/**
 * Cloud sync: this device's records and one account's rows, kept equal.
 *
 * The model, in four rules.
 *
 * 1. **Content, not clocks.** A record is changed when its hash differs from
 *    the hash both sides last agreed on (`SyncedRecordState`). No timestamp
 *    from any device decides anything.
 * 2. **Compare-and-swap on the server.** An upload says which revision it was
 *    made on; the server applies it only if that is still current
 *    (`push_user_records`). Two devices can never silently overwrite each
 *    other.
 * 3. **The server's version wins a conflict, and the loser is kept.** When
 *    both sides changed, this device takes the server's version — the one
 *    every other device already has, so all of them converge — and the local
 *    version is stored as a conflict the person can restore. Nothing is
 *    discarded without their say.
 * 4. **The first sign-in asks.** Work that was on this device before the
 *    account existed here is uploaded only if the person says so; if they
 *    decline, it stays on this device, marked local-only. Work another
 *    account synced on this browser is never offered for upload into this
 *    one.
 *
 * Everything else — retries after a lost response, a crash between writing a
 * record and writing its state, a missed change notification — is absorbed
 * by rule 1: the next run recomputes the difference from the records
 * themselves.
 */

import { contentHash } from './canonical';
import type { LocalRecord, LocalSource } from './local-sources';
import {
  PULL_PAGE,
  PUSH_BATCH_LIMIT,
  type CloudRemote,
  type PushOutcome,
  type RemoteChange,
  type RemoteRow,
} from './remote';
import { scopeFingerprint } from './scope';
import {
  recordRef,
  type ImportDecision,
  type SyncConflictRecord,
  type SyncedRecordState,
  type SyncMeta,
  type SyncStateStore,
} from '@/persistence/sync-state';

/** Bodies above this are split; PostgREST and the edge both cap request size. */
const PUSH_BATCH_BYTES = 1_500_000;
/** Rows fetched per request during a reconcile. */
const FETCH_BATCH = 200;
const DELETED_HASH_INPUT = null;

export interface ImportSummary {
  readonly total: number;
  readonly byStore: Readonly<Record<string, number>>;
}

export type SyncResult =
  | { readonly status: 'awaiting-import'; readonly summary: ImportSummary }
  | {
      readonly status: 'synced';
      readonly pulled: number;
      readonly pushed: number;
      readonly conflicts: number;
      /** Rows this build could not apply (an unknown store or an invalid record). */
      readonly skipped: number;
      readonly reconciled: boolean;
    };

export interface SyncEngineOptions {
  readonly userId: string;
  readonly deviceId: string;
  readonly remote: CloudRemote;
  readonly state: SyncStateStore;
  readonly sources: readonly LocalSource[];
  readonly now?: () => number;
  /** Called after records another device wrote have been applied here. */
  readonly onApplied?: (changes: readonly { store: string; key: string }[]) => void;
}

interface RunCounters {
  pulled: number;
  pushed: number;
  conflicts: number;
  skipped: number;
  applied: { store: string; key: string }[];
}

export class CloudSyncEngine {
  private readonly sources: ReadonlyMap<string, LocalSource>;
  private readonly fingerprint: string;
  private readonly now: () => number;
  private running: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: SyncEngineOptions) {
    this.sources = new Map(options.sources.map((source) => [source.store, source]));
    this.fingerprint = scopeFingerprint(options.sources.map((source) => source.store));
    this.now = options.now ?? Date.now;
  }

  get userId(): string {
    return this.options.userId;
  }

  /** Runs one operation at a time, so two triggers never interleave a sync. */
  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const next = this.running.then(work, work);
    this.running = next.catch(() => undefined);
    return next;
  }

  private async loadMeta(): Promise<SyncMeta> {
    return (
      (await this.options.state.meta(this.options.userId)) ?? {
        userId: this.options.userId,
        cursor: 0,
      }
    );
  }

  private async stateMap(): Promise<Map<string, SyncedRecordState>> {
    const states = await this.options.state.records(this.options.userId);
    return new Map(states.map((state) => [recordRef(state.store, state.key), state]));
  }

  // -------------------------------------------------------------------------
  // First sign-in on this device.

  /** Work on this device the account has never seen and nobody has decided about. */
  importCandidates(): Promise<ImportSummary> {
    return this.exclusive(() => this.candidates().then((list) => summarise(list)));
  }

  private async candidates(): Promise<{ store: string; key: string }[]> {
    const states = await this.stateMap();
    const others = await this.options.state.trackedByOthers(this.options.userId);
    const found: { store: string; key: string }[] = [];
    for (const source of this.sources.values()) {
      for (const record of await source.list()) {
        const ref = recordRef(source.store, record.key);
        if (states.has(ref)) continue;
        if (source.singleton) {
          if (source.isPristine?.(record.value)) continue;
        } else if (others.has(ref)) {
          continue;
        }
        found.push({ store: source.store, key: record.key });
      }
    }
    return found;
  }

  /**
   * Answer the first-sign-in question. `imported` uploads this device's work
   * on the next sync; `declined` marks every candidate local-only, and work
   * another account synced here is marked local-only for this account too.
   */
  decideImport(decision: ImportDecision): Promise<void> {
    return this.exclusive(async () => {
      const meta = await this.loadMeta();
      if (decision === 'declined') {
        const candidates = await this.candidates();
        await this.options.state.putRecords(
          candidates.map(({ store, key }) => ({
            userId: this.options.userId,
            store,
            key,
            hash: null,
            revision: 0,
            localOnly: true,
          })),
        );
      }
      await this.options.state.putMeta({ ...meta, importDecision: decision });
    });
  }

  // -------------------------------------------------------------------------
  // The run.

  sync(options: { readonly reconcile?: boolean } = {}): Promise<SyncResult> {
    return this.exclusive(() => this.run(options));
  }

  private async run(options: { readonly reconcile?: boolean }): Promise<SyncResult> {
    let meta = await this.loadMeta();
    if (!meta.importDecision) {
      const summary = summarise(await this.candidates());
      if (summary.total > 0) return { status: 'awaiting-import', summary };
      meta = { ...meta, importDecision: 'imported' };
      await this.options.state.putMeta(meta);
    }

    const counters: RunCounters = { pulled: 0, pushed: 0, conflicts: 0, skipped: 0, applied: [] };
    const reconcile =
      options.reconcile === true ||
      meta.storesFingerprint !== this.fingerprint ||
      meta.lastReconciledAt === undefined;

    meta = reconcile ? await this.reconcile(meta, counters) : await this.pull(meta, counters);
    await this.push(counters);

    meta = { ...meta, lastSyncedAt: this.now() };
    await this.options.state.putMeta(meta);
    if (counters.applied.length > 0) this.options.onApplied?.(counters.applied);
    return {
      status: 'synced',
      pulled: counters.pulled,
      pushed: counters.pushed,
      conflicts: counters.conflicts,
      skipped: counters.skipped,
      reconciled: reconcile,
    };
  }

  /** Incremental: everything after the cursor, page by page, saving progress per page. */
  private async pull(meta: SyncMeta, counters: RunCounters): Promise<SyncMeta> {
    let current = meta;
    for (;;) {
      const rows = await this.options.remote.pullSince(current.cursor, PULL_PAGE);
      const states = await this.stateMap();
      for (const row of rows) await this.applyRemote(row, states, counters);
      if (rows.length > 0) {
        current = { ...current, cursor: Math.max(current.cursor, rows[rows.length - 1]!.seq) };
        await this.options.state.putMeta(current);
      }
      if (rows.length < PULL_PAGE) return current;
    }
  }

  /**
   * Full: compare the server's manifest (keys and revisions, no values) with
   * what this device has acknowledged, and fetch only what differs.
   *
   * Run on the first sync, after the synced scope changes, and periodically:
   * a sequence cursor alone can skip a row whose transaction committed after
   * a later one was read, and this is what heals that.
   */
  private async reconcile(meta: SyncMeta, counters: RunCounters): Promise<SyncMeta> {
    const manifest = await this.options.remote.manifest();
    const states = await this.stateMap();
    const wanted: { store: string; key: string }[] = [];
    let highest = meta.cursor;
    for (const entry of manifest) {
      highest = Math.max(highest, entry.seq);
      if (!this.sources.has(entry.store)) {
        counters.skipped += 1;
        continue;
      }
      const state = states.get(recordRef(entry.store, entry.key));
      // A tombstone this device never tracked has nothing to delete here.
      if (!state && entry.deleted) continue;
      if (!state || state.localOnly || state.revision !== entry.revision) {
        wanted.push({ store: entry.store, key: entry.key });
      }
    }
    for (let index = 0; index < wanted.length; index += FETCH_BATCH) {
      const rows = await this.options.remote.fetch(wanted.slice(index, index + FETCH_BATCH));
      for (const row of rows) await this.applyRemote(row, states, counters);
    }
    const next: SyncMeta = {
      ...meta,
      cursor: highest,
      lastReconciledAt: this.now(),
      storesFingerprint: this.fingerprint,
    };
    await this.options.state.putMeta(next);
    return next;
  }

  private async applyRemote(
    row: RemoteRow,
    states: Map<string, SyncedRecordState>,
    counters: RunCounters,
  ): Promise<void> {
    const source = this.sources.get(row.store);
    if (!source) {
      counters.skipped += 1;
      return;
    }
    const ref = recordRef(row.store, row.key);
    const state = states.get(ref);
    if (state && !state.localOnly && state.revision >= row.revision && state.hash === row.hash)
      return;

    const deleted = row.value === null;
    if (!deleted && !source.isValid(row.value)) {
      counters.skipped += 1;
      return;
    }

    const local = await source.get(row.key);
    const localHash = local === null ? null : await contentHash(local);
    const remoteHash = deleted ? null : row.hash;

    if (localHash === remoteHash) {
      await this.acknowledge(row, states);
      return;
    }

    const localUnchanged =
      state && !state.localOnly
        ? localHash === state.hash
        : local === null || (source.singleton === true && source.isPristine?.(local) === true);

    if (!localUnchanged) {
      await this.keepConflict(row.store, row.key, local, row.value, row.device);
      counters.conflicts += 1;
    }
    await this.write(source, row, counters);
    await this.acknowledge(row, states);
    counters.pulled += 1;
  }

  private async write(
    source: LocalSource,
    row: { store: string; key: string; value: unknown; device: string | null },
    counters: RunCounters,
  ) {
    if (row.value === null) {
      await source.delete(row.key);
    } else {
      const displaced = await source.put(row.key, row.value);
      for (const record of displaced) {
        await this.keepConflict(source.store, record.key, record.value, row.value, row.device);
        counters.conflicts += 1;
      }
    }
    counters.applied.push({ store: row.store, key: row.key });
  }

  private async acknowledge(
    row: { store: string; key: string; value: unknown; hash: string; revision: number },
    states: Map<string, SyncedRecordState>,
  ): Promise<void> {
    const ref = recordRef(row.store, row.key);
    if (row.value === null) {
      states.delete(ref);
      await this.options.state.deleteRecords(this.options.userId, [
        { store: row.store, key: row.key },
      ]);
      return;
    }
    const state: SyncedRecordState = {
      userId: this.options.userId,
      store: row.store,
      key: row.key,
      hash: row.hash,
      revision: row.revision,
    };
    states.set(ref, state);
    await this.options.state.putRecords([state]);
  }

  private async keepConflict(
    store: string,
    key: string,
    localValue: unknown,
    remoteValue: unknown,
    remoteDevice: string | null,
  ): Promise<void> {
    const conflict: SyncConflictRecord = {
      id: `${this.options.userId}:${store}:${key}:${this.now()}:${Math.random().toString(36).slice(2, 8)}`,
      userId: this.options.userId,
      store,
      key,
      localValue: localValue ?? null,
      remoteValue: remoteValue ?? null,
      remoteDevice,
      detectedAt: this.now(),
    };
    await this.options.state.addConflict(conflict);
  }

  /** Everything on this device the account has not acknowledged, as uploads. */
  private async localChanges(): Promise<RemoteChange[]> {
    const states = await this.stateMap();
    const others = await this.options.state.trackedByOthers(this.options.userId);
    const changes: RemoteChange[] = [];
    const present = new Set<string>();
    for (const source of this.sources.values()) {
      for (const record of await source.list()) {
        const ref = recordRef(source.store, record.key);
        present.add(ref);
        const state = states.get(ref);
        if (state?.localOnly) continue;
        if (!state && !source.singleton && others.has(ref)) continue;
        if (!state && source.singleton && source.isPristine?.(record.value)) continue;
        const hash = await contentHash(record.value);
        if (state && state.hash === hash) continue;
        changes.push({
          store: source.store,
          key: record.key,
          value: record.value,
          hash,
          base: state?.revision ?? 0,
          device: this.options.deviceId,
        });
      }
    }
    const deletedHash = await contentHash(DELETED_HASH_INPUT);
    for (const [ref, state] of states) {
      if (state.localOnly || present.has(ref) || !this.sources.has(state.store)) continue;
      // An additive source's missing record left its window; it was not deleted.
      if (this.sources.get(state.store)?.additive) continue;
      changes.push({
        store: state.store,
        key: state.key,
        value: null,
        hash: deletedHash,
        base: state.revision,
        device: this.options.deviceId,
      });
    }
    return changes;
  }

  /** How many local changes are waiting for the account. */
  pending(): Promise<number> {
    return this.exclusive(async () => (await this.localChanges()).length);
  }

  private async push(counters: RunCounters): Promise<void> {
    const changes = await this.localChanges();
    const states = await this.stateMap();
    for (const batch of batches(changes)) {
      const outcomes = await this.options.remote.push(batch);
      const byRef = new Map(batch.map((change) => [recordRef(change.store, change.key), change]));
      for (const outcome of outcomes) {
        const change = byRef.get(recordRef(outcome.store, outcome.key));
        if (!change) continue;
        await this.settle(change, outcome, states, counters);
      }
    }
  }

  private async settle(
    change: RemoteChange,
    outcome: PushOutcome,
    states: Map<string, SyncedRecordState>,
    counters: RunCounters,
  ): Promise<void> {
    if (outcome.status === 'absent') {
      states.delete(recordRef(change.store, change.key));
      await this.options.state.deleteRecords(this.options.userId, [
        { store: change.store, key: change.key },
      ]);
      return;
    }
    if (outcome.status === 'applied' || outcome.status === 'unchanged') {
      await this.acknowledge(
        {
          store: change.store,
          key: change.key,
          value: change.value,
          hash: change.hash,
          revision: outcome.revision,
        },
        states,
      );
      if (outcome.status === 'applied') counters.pushed += 1;
      return;
    }
    if (outcome.status !== 'conflict') return;
    // Conflict: the server's version wins here as it already has everywhere
    // else, and this device's version is kept for the person to review.
    const source = this.sources.get(change.store)!;
    const remoteValue = outcome.deleted ? null : outcome.value;
    if (remoteValue !== null && !source.isValid(remoteValue)) {
      // A version this build cannot read must not replace one it can.
      counters.skipped += 1;
      return;
    }
    await this.keepConflict(change.store, change.key, change.value, remoteValue, outcome.device);
    counters.conflicts += 1;
    const row = {
      store: change.store,
      key: change.key,
      value: remoteValue,
      hash: outcome.hash,
      revision: outcome.revision,
      device: outcome.device,
    };
    await this.write(source, row, counters);
    await this.acknowledge(row, states);
  }

  // -------------------------------------------------------------------------
  // Conflicts.

  conflicts(): Promise<readonly SyncConflictRecord[]> {
    return this.options.state.conflicts(this.options.userId);
  }

  /**
   * Put this device's losing version back. It becomes an ordinary local edit
   * and is uploaded on the next sync, on top of the server's current revision.
   */
  restoreConflict(id: string): Promise<void> {
    return this.exclusive(async () => {
      const conflict = (await this.options.state.conflicts(this.options.userId)).find(
        (item) => item.id === id,
      );
      if (!conflict) return;
      const source = this.sources.get(conflict.store);
      if (!source) throw new Error('This build cannot restore that kind of record.');
      if (conflict.localValue === null) await source.delete(conflict.key);
      else {
        const displaced = await source.put(conflict.key, conflict.localValue);
        for (const record of displaced) {
          await this.keepConflict(
            source.store,
            record.key,
            record.value,
            conflict.localValue,
            null,
          );
        }
      }
      await this.options.state.deleteConflict(id);
    });
  }

  dismissConflict(id: string): Promise<void> {
    return this.options.state.deleteConflict(id);
  }

  // -------------------------------------------------------------------------
  // Leaving.

  /**
   * Remove from this device the records the account holds identically, and
   * forget this account's sync state. Anything not yet uploaded stays, and
   * the count of what stayed is returned so the person is told.
   */
  removeSyncedCopies(): Promise<{ readonly removed: number; readonly kept: number }> {
    return this.exclusive(async () => {
      const states = await this.stateMap();
      let removed = 0;
      let kept = 0;
      for (const source of this.sources.values()) {
        // Games stay: an additive source never removes anything, so counting
        // them as removed would tell the person something that did not happen.
        if (source.singleton || source.additive) continue;
        for (const record of await source.list()) {
          const state = states.get(recordRef(source.store, record.key));
          if (!state || state.localOnly) continue;
          if (state.hash === (await contentHash(record.value))) {
            await source.delete(record.key);
            removed += 1;
          } else {
            kept += 1;
          }
        }
      }
      await this.options.state.clearUser(this.options.userId);
      return { removed, kept };
    });
  }
}

function summarise(list: readonly { store: string }[]): ImportSummary {
  const byStore: Record<string, number> = {};
  for (const { store } of list) byStore[store] = (byStore[store] ?? 0) + 1;
  return { total: list.length, byStore };
}

function* batches(changes: readonly RemoteChange[]): Generator<RemoteChange[]> {
  let batch: RemoteChange[] = [];
  let bytes = 0;
  for (const change of changes) {
    const size = change.value === null ? 64 : JSON.stringify(change.value).length + 128;
    if (batch.length > 0 && (batch.length >= PUSH_BATCH_LIMIT || bytes + size > PUSH_BATCH_BYTES)) {
      yield batch;
      batch = [];
      bytes = 0;
    }
    batch.push(change);
    bytes += size;
  }
  if (batch.length > 0) yield batch;
}

export type { LocalRecord };
