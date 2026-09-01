import {
  applyMigrations,
  DATABASE_NAME,
  DATABASE_VERSION,
  type MigrationTarget,
  type StoreName,
} from '../schema/migrations';

export type Key = IDBValidKey | IDBKeyRange;

export interface PersistenceTransaction {
  get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined>;
  getAll<T>(store: StoreName): Promise<T[]>;
  /** Row count without reading the rows; a stored game carries a whole tree. */
  count(store: StoreName): Promise<number>;
  getAllFromIndex<T>(store: StoreName, index: string, key?: Key): Promise<T[]>;
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

  getAllFromIndex<T>(store: StoreName, index: string, key?: Key): Promise<T[]> {
    const source = this.value.objectStore(store).index(index);
    return request(source.getAll(key)) as Promise<T[]>;
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

  getAllFromIndex<T>(store: StoreName, index: string, key?: Key): Promise<T[]> {
    return this.readonly([store]).getAllFromIndex<T>(store, index, key);
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

export async function openPersistenceDatabase(): Promise<PersistenceDatabase> {
  if (typeof indexedDB === 'undefined') {
    throw new Error('Local storage is unavailable in this browser context.');
  }

  const open = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  const value = await new Promise<IDBDatabase>((resolve, reject) => {
    open.onupgradeneeded = (event) => {
      const database = open.result;
      const target: MigrationTarget = {
        hasStore: (name) => database.objectStoreNames.contains(name),
        createStore: (name, options, indexes = []) => {
          if (database.objectStoreNames.contains(name)) return;
          const store = database.createObjectStore(name, options);
          for (const index of indexes) {
            store.createIndex(index.name, index.keyPath as string | string[], {
              unique: index.unique ?? false,
            });
          }
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

function normalizeStorageError(error: unknown): Error {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return new Error('Local storage is full. Export or remove data, then try again.');
  }
  return error instanceof Error ? error : new Error('Local chess storage failed.');
}
