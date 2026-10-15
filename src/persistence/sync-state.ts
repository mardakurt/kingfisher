/**
 * What this device knows about its own sync with an account.
 *
 * For every record it has exchanged with the cloud, the content hash and
 * server revision both sides last agreed on. That one fact is what turns a
 * local edit into a compare-and-swap ("I changed revision 7") and a remote
 * change into a fast-forward ("nothing here changed since 7, take 8").
 *
 * It lives in its own small database, `kingfisher-sync`, and not beside the
 * work in `kingfisher`, for three reasons: it is per device and must never
 * travel in a backup (restoring another machine's sync state would claim
 * agreements this device never made); it is keyed by account, so two people
 * who share a browser keep separate states; and losing it is safe — the next
 * sync compares hashes, finds identical content, and rebuilds it without
 * moving a byte of the user's work. Nothing here is authoritative.
 *
 * Conflicts are the exception that does matter: when the cloud wins a
 * conflict, the local version that lost is kept here until the person
 * restores or dismisses it, so no sync ever discards work silently.
 */

export interface SyncedRecordState {
  readonly userId: string;
  readonly store: string;
  readonly key: string;
  /** The content hash the cloud acknowledged; absent for a local-only record. */
  readonly hash: string | null;
  readonly revision: number;
  /**
   * The person chose to keep this record on this device only. It is never
   * uploaded, and edits to it stay local.
   */
  readonly localOnly?: boolean;
}

export type ImportDecision = 'imported' | 'declined';

export interface SyncMeta {
  readonly userId: string;
  /** Highest server sequence number applied. */
  readonly cursor: number;
  readonly lastSyncedAt?: number;
  readonly lastReconciledAt?: number;
  /** Absent until the person has answered the first-sign-in question on this device. */
  readonly importDecision?: ImportDecision;
  /** Which stores this build synced when the cursor was last advanced. */
  readonly storesFingerprint?: string;
}

export interface SyncConflictRecord {
  readonly id: string;
  readonly userId: string;
  readonly store: string;
  readonly key: string;
  /** The version on this device that the cloud's version replaced; `null` if it was a deletion. */
  readonly localValue: unknown;
  /** What replaced it, for display: `null` if the cloud's version is a deletion. */
  readonly remoteValue: unknown;
  readonly remoteDevice: string | null;
  readonly detectedAt: number;
}

export interface SyncStateStore {
  records(userId: string): Promise<readonly SyncedRecordState[]>;
  /** `store\u001fkey` for every record another account on this device has synced. */
  trackedByOthers(userId: string): Promise<ReadonlySet<string>>;
  putRecords(states: readonly SyncedRecordState[]): Promise<void>;
  deleteRecords(userId: string, keys: readonly { store: string; key: string }[]): Promise<void>;
  meta(userId: string): Promise<SyncMeta | null>;
  putMeta(meta: SyncMeta): Promise<void>;
  conflicts(userId: string): Promise<readonly SyncConflictRecord[]>;
  addConflict(conflict: SyncConflictRecord): Promise<void>;
  deleteConflict(id: string): Promise<void>;
  /** Forget everything about this account on this device. The user's work is untouched. */
  clearUser(userId: string): Promise<void>;
}

export const recordRef = (store: string, key: string): string => `${store}\u001f${key}`;

// ---------------------------------------------------------------------------

export class MemorySyncStateStore implements SyncStateStore {
  private readonly recordMap = new Map<string, SyncedRecordState>();
  private readonly metaMap = new Map<string, SyncMeta>();
  private readonly conflictMap = new Map<string, SyncConflictRecord>();

  private static id(userId: string, store: string, key: string) {
    return `${userId}\u001e${recordRef(store, key)}`;
  }

  async records(userId: string) {
    return [...this.recordMap.values()].filter((state) => state.userId === userId);
  }

  async trackedByOthers(userId: string) {
    return new Set(
      [...this.recordMap.values()]
        .filter((state) => state.userId !== userId && !state.localOnly)
        .map((state) => recordRef(state.store, state.key)),
    );
  }

  async putRecords(states: readonly SyncedRecordState[]) {
    for (const state of states) {
      this.recordMap.set(
        MemorySyncStateStore.id(state.userId, state.store, state.key),
        structuredClone(state),
      );
    }
  }

  async deleteRecords(userId: string, keys: readonly { store: string; key: string }[]) {
    for (const { store, key } of keys)
      this.recordMap.delete(MemorySyncStateStore.id(userId, store, key));
  }

  async meta(userId: string) {
    return this.metaMap.get(userId) ?? null;
  }

  async putMeta(meta: SyncMeta) {
    this.metaMap.set(meta.userId, structuredClone(meta));
  }

  async conflicts(userId: string) {
    return [...this.conflictMap.values()]
      .filter((conflict) => conflict.userId === userId)
      .sort((a, b) => b.detectedAt - a.detectedAt);
  }

  async addConflict(conflict: SyncConflictRecord) {
    this.conflictMap.set(conflict.id, structuredClone(conflict));
  }

  async deleteConflict(id: string) {
    this.conflictMap.delete(id);
  }

  async clearUser(userId: string) {
    for (const [id, state] of this.recordMap)
      if (state.userId === userId) this.recordMap.delete(id);
    this.metaMap.delete(userId);
    for (const [id, conflict] of this.conflictMap)
      if (conflict.userId === userId) this.conflictMap.delete(id);
  }
}

// ---------------------------------------------------------------------------

const SYNC_DATABASE = 'kingfisher-sync';
const SYNC_DATABASE_VERSION = 1;

const request = <T>(value: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error ?? new Error('Sync state request failed.'));
  });

export class IndexedDbSyncStateStore implements SyncStateStore {
  private constructor(private readonly db: IDBDatabase) {}

  static async open(): Promise<IndexedDbSyncStateStore> {
    if (typeof indexedDB === 'undefined')
      throw new Error('Local storage is unavailable in this browser context.');
    const open = indexedDB.open(SYNC_DATABASE, SYNC_DATABASE_VERSION);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onupgradeneeded = () => {
        const database = open.result;
        if (!database.objectStoreNames.contains('records')) {
          const records = database.createObjectStore('records', {
            keyPath: ['userId', 'store', 'key'],
          });
          records.createIndex('userId', 'userId');
        }
        if (!database.objectStoreNames.contains('meta'))
          database.createObjectStore('meta', { keyPath: 'userId' });
        if (!database.objectStoreNames.contains('conflicts')) {
          const conflicts = database.createObjectStore('conflicts', { keyPath: 'id' });
          conflicts.createIndex('userId', 'userId');
        }
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error ?? new Error('Could not open sync state.'));
      open.onblocked = () => reject(new Error('Sync state upgrade is blocked by another tab.'));
    });
    db.onversionchange = () => db.close();
    return new IndexedDbSyncStateStore(db);
  }

  private async run<T>(
    stores: string[],
    mode: IDBTransactionMode,
    work: (tx: IDBTransaction) => Promise<T> | T,
  ): Promise<T> {
    const tx = this.db.transaction(stores, mode);
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('Sync state transaction aborted.'));
      tx.onerror = () => reject(tx.error ?? new Error('Sync state transaction failed.'));
    });
    const result = await work(tx);
    await done;
    return result;
  }

  records(userId: string) {
    return this.run(['records'], 'readonly', (tx) =>
      request(
        tx.objectStore('records').index('userId').getAll(userId) as IDBRequest<SyncedRecordState[]>,
      ),
    );
  }

  async trackedByOthers(userId: string) {
    const all = await this.run(['records'], 'readonly', (tx) =>
      request(tx.objectStore('records').getAll() as IDBRequest<SyncedRecordState[]>),
    );
    return new Set(
      all
        .filter((state) => state.userId !== userId && !state.localOnly)
        .map((state) => recordRef(state.store, state.key)),
    );
  }

  putRecords(states: readonly SyncedRecordState[]) {
    if (states.length === 0) return Promise.resolve();
    return this.run(['records'], 'readwrite', (tx) => {
      const store = tx.objectStore('records');
      for (const state of states) store.put(state);
    });
  }

  deleteRecords(userId: string, keys: readonly { store: string; key: string }[]) {
    if (keys.length === 0) return Promise.resolve();
    return this.run(['records'], 'readwrite', (tx) => {
      const store = tx.objectStore('records');
      for (const { store: name, key } of keys) store.delete([userId, name, key]);
    });
  }

  async meta(userId: string) {
    const value = await this.run(['meta'], 'readonly', (tx) =>
      request(tx.objectStore('meta').get(userId) as IDBRequest<SyncMeta | undefined>),
    );
    return value ?? null;
  }

  putMeta(meta: SyncMeta) {
    return this.run(['meta'], 'readwrite', (tx) => {
      tx.objectStore('meta').put(meta);
    });
  }

  async conflicts(userId: string) {
    const list = await this.run(['conflicts'], 'readonly', (tx) =>
      request(
        tx.objectStore('conflicts').index('userId').getAll(userId) as IDBRequest<
          SyncConflictRecord[]
        >,
      ),
    );
    return list.sort((a, b) => b.detectedAt - a.detectedAt);
  }

  addConflict(conflict: SyncConflictRecord) {
    return this.run(['conflicts'], 'readwrite', (tx) => {
      tx.objectStore('conflicts').put(conflict);
    });
  }

  deleteConflict(id: string) {
    return this.run(['conflicts'], 'readwrite', (tx) => {
      tx.objectStore('conflicts').delete(id);
    });
  }

  async clearUser(userId: string) {
    await this.run(['records', 'meta', 'conflicts'], 'readwrite', async (tx) => {
      const records = tx.objectStore('records');
      const keys = await request(records.index('userId').getAllKeys(userId));
      for (const key of keys) records.delete(key);
      tx.objectStore('meta').delete(userId);
      const conflicts = tx.objectStore('conflicts');
      const conflictKeys = await request(conflicts.index('userId').getAllKeys(userId));
      for (const key of conflictKeys) conflicts.delete(key);
    });
  }
}
