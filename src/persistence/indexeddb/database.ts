import { toNativeRange, type KeyRange } from './key-range';
import {
  applyMigrations,
  DATABASE_NAME,
  DATABASE_VERSION,
  type MigrationTarget,
  type StoreName,
} from '../schema/migrations';

export type Key = IDBValidKey | KeyRange;

/** Where to read from, and in what order. */
export interface ScanOptions<T> {
  readonly index?: string;
  readonly range?: KeyRange;
  readonly direction?: IDBCursorDirection;
  /** Applied to each visited record; only matches count towards the page. */
  readonly match?: (value: T) => boolean;
  readonly offset?: number;
  readonly limit?: number;
  /**
   * Stop as soon as the page is full instead of walking the rest of the range.
   *
   * Only meaningful together with `match`: without one the scan already stops.
   * A scan that stops early cannot know how many records matched, and says so
   * through `complete`.
   */
  readonly stopEarly?: boolean;
}

export interface ScanResult<T> {
  readonly items: T[];
  /** Matching records, counted across the whole range, not just this page. */
  readonly total: number;
  /** False when `stopEarly` ended the walk, which makes `total` a lower bound. */
  readonly complete: boolean;
}

export interface PersistenceTransaction {
  get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined>;
  getAll<T>(store: StoreName): Promise<T[]>;
  /** Row count without reading the rows; a stored game carries a whole tree. */
  count(store: StoreName): Promise<number>;
  /** Count matching keys without deserialising a single record value. */
  countRange(store: StoreName, index: string | null, range?: KeyRange): Promise<number>;
  /** One page of records, read through a cursor rather than materialised whole. */
  scan<T>(store: StoreName, options?: ScanOptions<T>): Promise<ScanResult<T>>;
  getAllFromIndex<T>(store: StoreName, index: string, key?: Key): Promise<T[]>;
  /**
   * The primary keys an index matches, without reading a single record.
   *
   * The difference is not a micro-optimisation where records are large. A
   * reference pack's chunks are a hundred kilobytes each, so asking which
   * chunks a pack owns through `getAllFromIndex` deserialises the entire pack
   * — twelve megabytes, to compare eighty-eight strings.
   */
  getAllKeysFromIndex(store: StoreName, index: string, key?: Key): Promise<IDBValidKey[]>;
  put<T>(store: StoreName, value: T): Promise<IDBValidKey>;
  delete(store: StoreName, key: IDBValidKey): Promise<void>;
  clear(store: StoreName): Promise<void>;
}

export interface PersistenceDatabase extends PersistenceTransaction {
  transaction<T>(
    stores: readonly StoreName[],
    mode: IDBTransactionMode,
    work: (transaction: PersistenceTransaction) => Promise<T>,
  ): Promise<T>;
  close(): void;
}

export const isKeyRange = (key: Key): key is KeyRange =>
  typeof key === 'object' && key !== null && !Array.isArray(key) && 'kind' in key;

const request = <T>(value: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error ?? new Error('IndexedDB request failed.'));
  });

const complete = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
  });

class NativeTransaction implements PersistenceTransaction {
  constructor(private readonly value: IDBTransaction) {}

  get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
    return request(this.value.objectStore(store).get(key)) as Promise<T | undefined>;
  }

  getAll<T>(store: StoreName): Promise<T[]> {
    return request(this.value.objectStore(store).getAll()) as Promise<T[]>;
  }

  count(store: StoreName): Promise<number> {
    return request(this.value.objectStore(store).count());
  }

  /**
   * Counting through a *key* cursor is the point: IndexedDB never deserialises
   * the record values, so counting ten thousand games costs almost nothing even
   * though each one carries a full game tree.
   */
  countRange(store: StoreName, index: string | null, range?: KeyRange): Promise<number> {
    const source = index
      ? this.value.objectStore(store).index(index)
      : this.value.objectStore(store);
    return request(source.count(range ? toNativeRange(range) : undefined));
  }

  /**
   * Walk an index and take one page.
   *
   * Two properties matter for large collections. Without a per-record predicate
   * the cursor skips the offset with `advance` and stops the moment the page is
   * full, so the cost is the page size rather than the collection size — and
   * `total` is left to the caller, which can get it from a key cursor instead.
   * With a predicate there is no choice but to visit records, and `total` then
   * counts every match because it was paid for anyway.
   */
  scan<T>(store: StoreName, options: ScanOptions<T> = {}): Promise<ScanResult<T>> {
    const source = options.index
      ? this.value.objectStore(store).index(options.index)
      : this.value.objectStore(store);

    const offset = Math.max(0, options.offset ?? 0);
    const limit = options.limit ?? Number.POSITIVE_INFINITY;
    const counting = Boolean(options.match);

    return new Promise((resolve, reject) => {
      const items: T[] = [];
      let matched = 0;
      let skipped = false;
      const cursorRequest = source.openCursor(
        options.range ? toNativeRange(options.range) : null,
        options.direction ?? 'next',
      );

      cursorRequest.onerror = () =>
        reject(cursorRequest.error ?? new Error('IndexedDB scan failed.'));

      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) {
          resolve({ items, total: matched, complete: true });
          return;
        }

        // Skipping through the index costs nothing per record when there is no
        // predicate; stepping one at a time would deserialise every skipped row.
        if (!counting && !skipped && offset > 0) {
          skipped = true;
          cursor.advance(offset);
          return;
        }
        skipped = true;

        if (!counting) {
          items.push(cursor.value as T);
          matched += 1;
          if (items.length >= limit) {
            resolve({ items, total: matched, complete: false });
            return;
          }
          cursor.continue();
          return;
        }

        const value = cursor.value as T;
        if (options.match?.(value)) {
          if (matched >= offset && items.length < limit) items.push(value);
          matched += 1;
        }
        if (options.stopEarly && items.length >= limit) {
          resolve({ items, total: matched, complete: false });
          return;
        }
        cursor.continue();
      };
    });
  }

  getAllFromIndex<T>(store: StoreName, index: string, key?: Key): Promise<T[]> {
    const source = this.value.objectStore(store).index(index);
    const query = key !== undefined && isKeyRange(key) ? toNativeRange(key) : key;
    return request(source.getAll(query as IDBValidKey | IDBKeyRange | undefined)) as Promise<T[]>;
  }

  getAllKeysFromIndex(store: StoreName, index: string, key?: Key): Promise<IDBValidKey[]> {
    const source = this.value.objectStore(store).index(index);
    const query = key !== undefined && isKeyRange(key) ? toNativeRange(key) : key;
    return request(source.getAllKeys(query as IDBValidKey | IDBKeyRange | undefined));
  }

  put<T>(store: StoreName, value: T): Promise<IDBValidKey> {
    return request(this.value.objectStore(store).put(value));
  }

  async delete(store: StoreName, key: IDBValidKey): Promise<void> {
    await request(this.value.objectStore(store).delete(key));
  }

  async clear(store: StoreName): Promise<void> {
    await request(this.value.objectStore(store).clear());
  }
}

class NativeDatabase implements PersistenceDatabase {
  constructor(private readonly value: IDBDatabase) {}

  private readonly(stores: readonly StoreName[]): NativeTransaction {
    return new NativeTransaction(this.value.transaction(stores, 'readonly'));
  }

  get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
    return this.readonly([store]).get<T>(store, key);
  }

  getAll<T>(store: StoreName): Promise<T[]> {
    return this.readonly([store]).getAll<T>(store);
  }

  count(store: StoreName): Promise<number> {
    return this.readonly([store]).count(store);
  }

  countRange(store: StoreName, index: string | null, range?: KeyRange): Promise<number> {
    return this.readonly([store]).countRange(store, index, range);
  }

  scan<T>(store: StoreName, options?: ScanOptions<T>): Promise<ScanResult<T>> {
    return this.readonly([store]).scan<T>(store, options);
  }

  getAllFromIndex<T>(store: StoreName, index: string, key?: Key): Promise<T[]> {
    return this.readonly([store]).getAllFromIndex<T>(store, index, key);
  }

  getAllKeysFromIndex(store: StoreName, index: string, key?: Key): Promise<IDBValidKey[]> {
    return this.readonly([store]).getAllKeysFromIndex(store, index, key);
  }

  async put<T>(store: StoreName, value: T): Promise<IDBValidKey> {
    return this.transaction([store], 'readwrite', (tx) => tx.put(store, value));
  }

  async delete(store: StoreName, key: IDBValidKey): Promise<void> {
    await this.transaction([store], 'readwrite', (tx) => tx.delete(store, key));
  }

  async clear(store: StoreName): Promise<void> {
    await this.transaction([store], 'readwrite', (tx) => tx.clear(store));
  }

  async transaction<T>(
    stores: readonly StoreName[],
    mode: IDBTransactionMode,
    work: (transaction: PersistenceTransaction) => Promise<T>,
  ): Promise<T> {
    const native = this.value.transaction(stores, mode);
    const done = complete(native);
    try {
      const result = await work(new NativeTransaction(native));
      await done;
      return result;
    } catch (error) {
      try {
        native.abort();
      } catch {
        // The transaction may already have completed or aborted.
      }
      try {
        await done;
      } catch {
        // Preserve the original failure.
      }
      throw normalizeStorageError(error);
    }
  }

  close(): void {
    this.value.close();
  }
}

/**
 * Opens the database at an arbitrary version and name.
 *
 * Production always calls `openPersistenceDatabase()`, which is this at the
 * current version and the one real database name. The parameters exist for
 * migration-fixture tests, which need to open the *same* underlying database
 * at an old version first — to create it in the shape a real installation at
 * that version would have — and then again at `DATABASE_VERSION`, to run the
 * exact upgrade path a real update runs.
 */
export async function openPersistenceDatabaseAt(
  version: number,
  name: string = DATABASE_NAME,
): Promise<PersistenceDatabase> {
  if (typeof indexedDB === 'undefined') {
    throw new Error('Local storage is unavailable in this browser context.');
  }

  const open = indexedDB.open(name, version);
  const value = await new Promise<IDBDatabase>((resolve, reject) => {
    open.onupgradeneeded = (event) => {
      const database = open.result;
      // The upgrade transaction: every schema change and every backfill below
      // happens inside it, so an interrupted upgrade rolls back whole.
      const upgrade = open.transaction as IDBTransaction;

      const target: MigrationTarget = {
        hasStore: (name) => database.objectStoreNames.contains(name),
        createStore: (name, options, indexes = []) => {
          if (database.objectStoreNames.contains(name)) return;
          const store = database.createObjectStore(name, options);
          for (const index of indexes) {
            store.createIndex(index.name, index.keyPath as string | string[], {
              unique: index.unique ?? false,
              multiEntry: index.multiEntry ?? false,
            });
          }
        },
        addIndex: (name, index) => {
          if (!database.objectStoreNames.contains(name)) return;
          const store = upgrade.objectStore(name);
          if (store.indexNames.contains(index.name)) return;
          store.createIndex(index.name, index.keyPath as string | string[], {
            unique: index.unique ?? false,
            multiEntry: index.multiEntry ?? false,
          });
        },
        split: (from, to, divide) => {
          if (!database.objectStoreNames.contains(from)) return;
          if (!database.objectStoreNames.contains(to)) return;
          const source = upgrade.objectStore(from);
          const target_ = upgrade.objectStore(to);
          const cursorRequest = source.openCursor();
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) return;
            const parts = divide(cursor.value);
            if (parts) {
              target_.put(parts.move);
              cursor.update(parts.keep);
            }
            cursor.continue();
          };
        },
        rewrite: (name, update) => {
          if (!database.objectStoreNames.contains(name)) return;
          const store = upgrade.objectStore(name);
          const cursorRequest = store.openCursor();
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) return;
            const next = update(cursor.value);
            if (next !== cursor.value) cursor.update(next);
            cursor.continue();
          };
        },
      };
      applyMigrations(target, event.oldVersion, event.newVersion ?? DATABASE_VERSION);
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error ?? new Error('Could not open local chess storage.'));
    open.onblocked = () => reject(new Error('Local storage upgrade is blocked by another tab.'));
  });

  value.onversionchange = () => value.close();
  return new NativeDatabase(value);
}

export function openPersistenceDatabase(): Promise<PersistenceDatabase> {
  return openPersistenceDatabaseAt(DATABASE_VERSION);
}

function normalizeStorageError(error: unknown): Error {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return new Error('Local storage is full. Export or remove data, then try again.');
  }
  return error instanceof Error ? error : new Error('Local chess storage failed.');
}
