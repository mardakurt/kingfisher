import type {
  Key,
  PersistenceDatabase,
  PersistenceTransaction,
  ScanOptions,
  ScanResult,
} from './database';
import { readKeyPath, resolveSchema, type StoreName } from '../schema/migrations';

/**
 * Index definitions are read from the migrations, not restated here, so this
 * double resolves `dueAt` to `schedule.dueAt` and `players` to every element of
 * `playerKeys` exactly as IndexedDB would.
 */
const SCHEMA = resolveSchema();

const sameKey = (a: unknown, b: unknown): boolean => {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((part, index) => part === b[index]);
  }
  return a === b;
};

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

  async countRange(store: StoreName, index: string | null, range?: Key): Promise<number> {
    const values = index
      ? await this.getAllFromIndex<unknown>(store, index, range)
      : await this.getAll<unknown>(store);
    return values.length;
  }

  /**
   * The memory double sorts in full and slices, which is the honest way to
   * emulate a cursor without an index: it produces identical results, and the
   * performance difference is exactly what the real implementation exists for.
   */
  async scan<T>(store: StoreName, options: ScanOptions<T> = {}): Promise<ScanResult<T>> {
    const all = options.index
      ? await this.getAllFromIndex<T>(store, options.index, options.range)
      : await this.getAll<T>(store);

    const spec = options.index ? SCHEMA.get(store)?.indexes.get(options.index) : null;
    const sorted = [...all];
    if (spec) {
      const key = (value: unknown) =>
        Array.isArray(spec.keyPath)
          ? spec.keyPath.map((part) => readKeyPath(value, part)).join('\u001f')
          : readKeyPath(value, spec.keyPath as string);
      sorted.sort((a, b) => {
        const left = key(a);
        const right = key(b);
        if (left === right) return 0;
        return (left as never) < (right as never) ? -1 : 1;
      });
    }
    if (options.direction === 'prev' || options.direction === 'prevunique') sorted.reverse();

    const matches = options.match ? sorted.filter(options.match) : sorted;
    const offset = Math.max(0, options.offset ?? 0);
    const limit = options.limit ?? Number.POSITIVE_INFINITY;
    return { items: matches.slice(offset, offset + limit), total: matches.length };
  }

  async getAllFromIndex<T>(store: StoreName, index: string, key?: Key): Promise<T[]> {
    const values = await this.getAll<Record<string, unknown>>(store);
    const spec = SCHEMA.get(store)?.indexes.get(index);
    if (!spec) throw new Error(`No index "${index}" on ${store}.`);

    const extract = (value: unknown): unknown =>
      Array.isArray(spec.keyPath)
        ? spec.keyPath.map((part) => readKeyPath(value, part))
        : readKeyPath(value, spec.keyPath as string);

    // Records missing the indexed value are absent from a real IndexedDB index.
    const present = values.filter((value) => {
      const indexed = extract(value);
      return Array.isArray(indexed)
        ? indexed.every((part) => part !== undefined)
        : indexed !== undefined;
    });
    if (key === undefined) return present as T[];

    if (typeof IDBKeyRange !== 'undefined' && key instanceof IDBKeyRange) {
      return present.filter((value) => rangeIncludes(key, extract(value))) as T[];
    }

    return present.filter((value) => {
      const indexed = extract(value);
      // A multi-entry index matches when any element equals the key.
      if (spec.multiEntry && Array.isArray(indexed)) {
        return indexed.some((part) => sameKey(part, key));
      }
      return sameKey(indexed, key);
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

function rangeIncludes(range: IDBKeyRange, value: unknown): boolean {
  if (value === undefined) return false;
  const compare = (a: unknown, b: unknown): number => {
    if (typeof indexedDB !== 'undefined') return indexedDB.cmp(a as IDBValidKey, b as IDBValidKey);
    if (Array.isArray(a) && Array.isArray(b)) {
      for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
        const step = compare(a[i], b[i]);
        if (step !== 0) return step;
      }
      return 0;
    }
    if (a === b) return 0;
    return (a as never) < (b as never) ? -1 : 1;
  };

  if (range.lower !== undefined) {
    const step = compare(value, range.lower);
    if (step < 0 || (step === 0 && range.lowerOpen)) return false;
  }
  if (range.upper !== undefined) {
    const step = compare(value, range.upper);
    if (step > 0 || (step === 0 && range.upperOpen)) return false;
  }
  return true;
}
