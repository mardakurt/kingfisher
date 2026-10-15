/**
 * "Something was written to these stores" — after it committed.
 *
 * Cloud sync needs to know when to look, not what changed: it recomputes the
 * difference from the records themselves, so a missed notification costs
 * latency and never correctness. That is why this is a plain announcement
 * from the one chokepoint every write passes through (`transaction`, which
 * `put`, `delete` and `clear` also reach through the prototype chain — see
 * `withWriteTracking`), fired only after the transaction completes so a
 * rolled-back write is never announced.
 */

import type { PersistenceDatabase, PersistenceTransaction } from './indexeddb/database';
import type { StoreName } from './schema/migrations';

type Listener = (stores: readonly StoreName[]) => void;

const listeners = new Set<Listener>();

export function subscribeLocalWrites(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function announce(stores: readonly StoreName[]): void {
  for (const listener of listeners) {
    try {
      listener(stores);
    } catch {
      // A listener's failure is not the write's failure.
    }
  }
}

export function withChangeFeed(database: PersistenceDatabase): PersistenceDatabase {
  const wrapped = Object.create(database) as PersistenceDatabase;
  Object.defineProperty(wrapped, 'transaction', {
    value: function transaction<T>(
      stores: readonly StoreName[],
      mode: IDBTransactionMode,
      work: (transaction: PersistenceTransaction) => Promise<T>,
    ): Promise<T> {
      if (mode !== 'readwrite') return database.transaction(stores, mode, work);
      return database.transaction(stores, mode, work).then((value) => {
        announce(stores);
        return value;
      });
    },
    enumerable: true,
    configurable: true,
    writable: true,
  });
  return wrapped;
}
