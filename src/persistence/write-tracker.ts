/**
 * Tracking the writes the user has not yet seen the disk answer for.
 *
 * Every persistence call that mutates a store passes through one
 * place — a `readwrite` transaction on the IndexedDB database — and
 * that single chokepoint is enough to know whether anything is still
 * in flight. The save barrier before a desktop update needs that
 * answer: it must refuse to install if the user has typed a comment
 * and that comment is still on its way to disk.
 *
 * The tracker is a small, hand-rolled registry. A write registers a
 * slot when it starts, releases the slot when it settles. A flush
 * awaits every currently-registered slot up to a budget; any slot
 * that is still open at the deadline is reported as
 * `pending-writes`, and a slot that has already rejected is reported
 * as `write-failed`.
 *
 * The tracker does not own the persistence layer. It is a passive
 * observer that any wrapper around `PersistenceDatabase` can use.
 * In production, the wrapper is `withWriteTracking()` applied to
 * the database returned by `openPersistenceDatabase()`; in tests,
 * the same wrapper is applied to `MemoryPersistenceDatabase`.
 */

import type { PersistenceDatabase, PersistenceTransaction } from './indexeddb/database';
import type { StoreName } from './schema/migrations';

export type WriteFlushResult =
  | { readonly ok: true; readonly waited: number }
  | {
      readonly ok: false;
      readonly reason: 'pending-writes';
      readonly inflight: number;
      readonly waited: number;
    }
  | {
      readonly ok: false;
      readonly reason: 'write-failed';
      readonly inflight: number;
      readonly waited: number;
    }
  | {
      readonly ok: false;
      readonly reason: 'timeout';
      readonly inflight: number;
      readonly waited: number;
    };

export interface WriteTracker {
  /**
   * Begin tracking a write. The returned `release` function is
   * idempotent — calling it twice does not double-decrement — and
   * must be called when the write settles, whether the outcome was
   * `commit` or `reject`.
   */
  begin(label: string): { release(commit: boolean): void };
  /** Number of writes currently in flight. */
  inflight(): number;
  /**
   * A snapshot of the most recent write that rejected. The tracker
   * records the latest failure so the workspace chrome can keep
   * "Save failed" visible until a fresh successful write arrives.
   * Returns `null` once a successful write has happened after the
   * last failure.
   */
  lastFailure(): { readonly label: string; readonly error: unknown } | null;
  /**
   * Subscribe to state changes. The listener is invoked whenever
   * the in-flight count or the last-failure snapshot changes.
   * The returned function detaches the listener.
   */
  subscribe(listener: () => void): () => void;
  /**
   * Wait for every currently-tracked write to settle, or for the
   * budget to expire. The result is structured so the caller can
   * map it to a save-barrier reason.
   */
  flush(budgetMs: number): Promise<WriteFlushResult>;
}

interface Slot {
  label: string;
  /** A promise that resolves when the slot is released. Never rejects. */
  promise: Promise<void>;
  /** Set by `release()`. `null` while the slot is open. */
  outcome: 'ok' | 'err' | null;
  /** Holds the rejection error if `outcome === 'err'`. */
  error: unknown;
}

const createTracker = (): WriteTracker => {
  const slots = new Set<Slot>();
  let lastFailure: { label: string; error: unknown } | null = null;
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of listeners) listener();
  };
  return {
    begin(label) {
      let resolveSlot: () => void = () => {};
      const promise = new Promise<void>((resolve) => {
        resolveSlot = resolve;
      });
      const slot: Slot = {
        label,
        promise,
        outcome: null,
        error: undefined,
      };
      slots.add(slot);
      notify();
      return {
        release(commit) {
          if (slot.outcome !== null) return;
          if (commit) {
            slot.outcome = 'ok';
            // A successful write clears the most recent failure so
            // the workspace status indicator can transition from
            // "Save failed" back to "Saved on this device".
            lastFailure = null;
          } else {
            slot.outcome = 'err';
            slot.error = new Error(`write failed: ${label}`);
            lastFailure = { label, error: slot.error };
          }
          resolveSlot();
          slots.delete(slot);
          notify();
        },
      };
    },
    inflight() {
      return slots.size;
    },
    lastFailure() {
      return lastFailure;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async flush(budgetMs) {
      const started = Date.now();
      const snapshot = Array.from(slots);
      if (snapshot.length === 0) {
        return { ok: true, waited: 0 };
      }
      let timer: ReturnType<typeof setTimeout> | null = null;
      const timeout = new Promise<{ timedOut: true }>((resolve) => {
        timer = setTimeout(() => resolve({ timedOut: true }), budgetMs);
      });
      const settled = Promise.all(snapshot.map((slot) => slot.promise)).then(() => ({
        timedOut: false as const,
      }));
      const race = await Promise.race([settled, timeout]);
      if (timer) clearTimeout(timer);
      const waited = Date.now() - started;
      // A slot in the snapshot is the authoritative record for
      // *this* flush, even if the live set no longer contains it
      // (the slot's release removes it from `slots` synchronously).
      // Read the outcome from the snapshot, not from the live set.
      if (race.timedOut) {
        return { ok: false, reason: 'timeout', inflight: snapshot.length, waited };
      }
      const anyRejected = snapshot.some((slot) => slot.outcome === 'err');
      const anyStillOpen = snapshot.some((slot) => slot.outcome === null);
      if (anyRejected) {
        return { ok: false, reason: 'write-failed', inflight: snapshot.length, waited };
      }
      if (anyStillOpen) {
        return { ok: false, reason: 'pending-writes', inflight: snapshot.length, waited };
      }
      return { ok: true, waited };
    },
  };
};

let singleton: WriteTracker | null = null;

/**
 * The renderer's single source of truth for "are any user writes
 * still on their way to disk?". Lazily created so a test that
 * imports this module does not instantiate a tracker on load.
 */
export function getWriteTracker(): WriteTracker {
  singleton ??= createTracker();
  return singleton;
}

/**
 * Reset the singleton. Tests call this between cases to ensure
 * leftover slots from a previous test do not poison the next.
 */
export function resetWriteTrackerForTests(): void {
  singleton = null;
}

/**
 * Wrap a `PersistenceDatabase` so every `readwrite` transaction
 * registers with the tracker. Read-only transactions are not
 * tracked — reads do not need to be flushed before an update.
 *
 * The wrapper is intentionally narrow. It does not inspect the
 * work the transaction performs; it only owns the slot that the
 * caller's `begin`/`release` cycle pairs with. This is the
 * minimum the save barrier needs.
 */
export function withWriteTracking(
  database: PersistenceDatabase,
  tracker: WriteTracker = getWriteTracker(),
): PersistenceDatabase {
  /*
    Spread doesn't carry prototype methods (`put`, `get`, `delete`,
    `clear`, `count`, etc. live on the class prototype). We use
    `Object.create` so the wrapped object delegates to the
    underlying database for everything except the `transaction`
    method, which we override to track writes.
  */
  const wrapped = Object.create(database) as PersistenceDatabase;
  Object.defineProperty(wrapped, 'transaction', {
    value: function transaction<T>(
      stores: readonly StoreName[],
      mode: IDBTransactionMode,
      work: (transaction: PersistenceTransaction) => Promise<T>,
    ): Promise<T> {
      if (mode !== 'readwrite') {
        return database.transaction(stores, mode, work);
      }
      const label = stores.length === 1 ? `write:${stores[0]}` : `write:${stores.join('+')}`;
      const handle = tracker.begin(label);
      return database.transaction(stores, mode, work).then(
        (value: T) => {
          handle.release(true);
          return value;
        },
        (err: unknown) => {
          handle.release(false);
          throw err;
        },
      );
    },
    enumerable: true,
    configurable: true,
    writable: true,
  });
  return wrapped;
}
