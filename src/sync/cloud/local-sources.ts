/**
 * The device side of sync: one `LocalSource` per synced store.
 *
 * A source lists its records, reads one, writes one and deletes one. Every
 * write of a record another device made is validated first by the same rules
 * a backup restore applies (`isValidStoreRecord`), so the cloud can never put
 * into IndexedDB what a backup file could not.
 */

import { isValidStoreRecord } from '@/persistence/backup';
import type { PersistenceDatabase } from '@/persistence/indexeddb/database';
import { STORE_NAMES, type StoreName } from '@/persistence/schema/migrations';

export interface LocalRecord {
  readonly key: string;
  readonly value: unknown;
}

export interface LocalSource {
  readonly store: string;
  list(): Promise<readonly LocalRecord[]>;
  get(key: string): Promise<unknown | null>;
  /**
   * Write a record another device made. Returns the records this write
   * displaced because they claimed the same unique key (the same repertoire
   * position created independently on two devices), so the engine can keep
   * them as conflicts rather than lose them.
   */
  put(key: string, value: unknown): Promise<readonly LocalRecord[]>;
  delete(key: string): Promise<void>;
  isValid(value: unknown): boolean;
  /**
   * A singleton source (preferences) always holds exactly one record, so it
   * cannot "belong" to whichever account synced it last on this device, and
   * its untouched defaults are not work worth asking about.
   */
  readonly singleton?: boolean;
  /** For a singleton: true when the record is still the defaults nobody chose. */
  isPristine?(value: unknown): boolean;
}

const keyOf = (value: unknown): string | null => {
  if (typeof value !== 'object' || value === null) return null;
  const id = (value as { id?: unknown }).id;
  return typeof id === 'string' && id.length > 0 ? id : null;
};

/**
 * The unique indexes a record from another device can collide with, read
 * through the index rather than by scanning the store: a pull of a thousand
 * repertoire positions must not deserialise the repertoire a thousand times.
 * `local-sources.test.ts` checks this against the schema's unique indexes.
 */
export const UNIQUE_INDEXES: Readonly<
  Partial<
    Record<
      StoreName,
      {
        readonly index: string;
        readonly key: (record: Record<string, unknown>) => IDBValidKey | null;
      }
    >
  >
> = {
  [STORE_NAMES.repertoirePositions]: {
    index: 'repertoirePosition',
    key: (r) =>
      typeof r.repertoireId === 'string' && typeof r.positionKey === 'string'
        ? [r.repertoireId, r.positionKey]
        : null,
  },
  [STORE_NAMES.studyReferences]: {
    index: 'chapterTarget',
    key: (r) =>
      typeof r.chapterId === 'string' &&
      typeof r.kind === 'string' &&
      typeof r.targetId === 'string'
        ? [r.chapterId, r.kind, r.targetId]
        : null,
  },
  [STORE_NAMES.reviewItems]: {
    index: 'identityKey',
    key: (r) => (typeof r.identityKey === 'string' ? r.identityKey : null),
  },
  [STORE_NAMES.trainingSets]: {
    index: 'name',
    key: (r) => (typeof r.name === 'string' ? r.name : null),
  },
  [STORE_NAMES.openingFiles]: {
    index: 'name',
    key: (r) => (typeof r.name === 'string' ? r.name : null),
  },
  [STORE_NAMES.sourceSets]: {
    index: 'name',
    key: (r) => (typeof r.name === 'string' ? r.name : null),
  },
  [STORE_NAMES.journal]: {
    index: 'fingerprint',
    key: (r) => (typeof r.fingerprint === 'string' ? r.fingerprint : null),
  },
};

export function databaseSource(database: PersistenceDatabase, store: StoreName): LocalSource {
  const unique = UNIQUE_INDEXES[store];
  return {
    store,
    async list() {
      const rows = await database.getAll<unknown>(store);
      const records: LocalRecord[] = [];
      for (const value of rows) {
        const key = keyOf(value);
        if (key !== null) records.push({ key, value });
      }
      return records;
    },
    async get(key) {
      return (await database.get<unknown>(store, key)) ?? null;
    },
    async put(key, value) {
      if (keyOf(value) !== key) throw new Error(`A ${store} record arrived under the wrong key.`);
      return database.transaction([store], 'readwrite', async (tx) => {
        const displaced: LocalRecord[] = [];
        const incoming = unique?.key(value as Record<string, unknown>) ?? null;
        if (unique && incoming !== null) {
          for (const existing of await tx.getAllFromIndex<unknown>(store, unique.index, incoming)) {
            const existingKey = keyOf(existing);
            if (existingKey === null || existingKey === key) continue;
            displaced.push({ key: existingKey, value: existing });
            await tx.delete(store, existingKey);
          }
        }
        await tx.put(store, value);
        return displaced;
      });
    },
    async delete(key) {
      await database.delete(store, key);
    },
    isValid: (value) => isValidStoreRecord(store, value),
  };
}
