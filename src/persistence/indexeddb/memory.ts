import type { Key, PersistenceDatabase, PersistenceTransaction } from './database';
import type { StoreName } from '../schema/migrations';

const clone = <T>(value: T): T => structuredClone(value);

export class MemoryPersistenceDatabase implements PersistenceDatabase {
  private stores = new Map<StoreName, Map<IDBValidKey, unknown>>();

  private store(name: StoreName): Map<IDBValidKey, unknown> {
    let value = this.stores.get(name);
    if (!value) {
      value = new Map();
      this.stores.set(name, value);
    }
    return value;
  }

  async get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
    const value = this.store(store).get(key);
    return value === undefined ? undefined : clone(value as T);
  }

  async getAll<T>(store: StoreName): Promise<T[]> {
    return [...this.store(store).values()].map((value) => clone(value as T));
  }

  async count(store: StoreName): Promise<number> {
    return this.store(store).size;
  }

  async getAllFromIndex<T>(store: StoreName, index: string, key?: Key): Promise<T[]> {
    const values = await this.getAll<Record<string, unknown>>(store);
    if (key === undefined) return values as T[];
    if (typeof IDBKeyRange !== 'undefined' && key instanceof IDBKeyRange) {
      throw new Error('The memory database does not support IDBKeyRange queries.');
    }
    return values.filter((value) => {
      const indexed = value[index];
      if (Array.isArray(indexed) && Array.isArray(key)) {
        return indexed.length === key.length && indexed.every((part, i) => part === key[i]);
      }
      return indexed === key;
    }) as T[];
  }

  async put<T>(store: StoreName, value: T): Promise<IDBValidKey> {
    const record = value as Record<string, unknown>;
    const key = record.id as IDBValidKey | undefined;
    if (key === undefined) throw new Error(`A record written to ${store} has no id.`);
    this.store(store).set(key, clone(value));
    return key;
  }

  async delete(store: StoreName, key: IDBValidKey): Promise<void> {
    this.store(store).delete(key);
  }

  async clear(store: StoreName): Promise<void> {
    this.store(store).clear();
  }

  async transaction<T>(
    stores: readonly StoreName[],
    _mode: IDBTransactionMode,
    work: (transaction: PersistenceTransaction) => Promise<T>,
  ): Promise<T> {
    const snapshot = new Map<StoreName, Map<IDBValidKey, unknown>>();
    for (const store of stores) snapshot.set(store, new Map(this.store(store)));
    try {
      return await work(this);
    } catch (error) {
      for (const [store, values] of snapshot) this.stores.set(store, values);
      throw error;
    }
  }

  close(): void {}
}
