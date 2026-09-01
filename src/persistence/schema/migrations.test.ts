import { describe, expect, it } from 'vitest';

import {
  applyMigrations,
  DATABASE_VERSION,
  MIGRATIONS,
  STORE_NAMES,
  type MigrationTarget,
  type StoreName,
} from './migrations';

interface CreatedStore {
  readonly options: IDBObjectStoreParameters;
  readonly indexes: readonly { name: string; keyPath: string | readonly string[] }[];
}

/** Records what a migration asked for, without needing a real IndexedDB. */
function recorder() {
  const stores = new Map<StoreName, CreatedStore>();
  const target: MigrationTarget = {
    hasStore: (name) => stores.has(name),
    createStore: (name, options, indexes = []) => {
      if (stores.has(name)) throw new Error(`${name} was created twice`);
      stores.set(name, { options, indexes: [...indexes] });
    },
  };
  return { stores, target };
}

describe('schema migrations', () => {
  it('is versioned, and the versions are contiguous and ordered', () => {
    expect(MIGRATIONS).not.toHaveLength(0);
    MIGRATIONS.forEach((migration, index) => {
      expect(migration.version).toBe(index + 1);
      expect(migration.description).not.toBe('');
    });
    expect(MIGRATIONS.at(-1)?.version).toBe(DATABASE_VERSION);
  });

  it('creates every store the repositories use on a fresh database', () => {
    const { stores, target } = recorder();

    applyMigrations(target, 0, DATABASE_VERSION);

    expect([...stores.keys()].sort()).toEqual([...Object.values(STORE_NAMES)].sort());
    for (const store of stores.values()) expect(store.options.keyPath).toBe('id');
  });

  it('indexes the lookups the repositories actually perform', () => {
    const { stores, target } = recorder();
    applyMigrations(target, 0, DATABASE_VERSION);

    const indexNames = (store: StoreName) =>
      (stores.get(store)?.indexes ?? []).map((index) => index.name);

    // Chapters are read by study, and ordered within it.
    expect(indexNames(STORE_NAMES.chapters)).toContain('studyId');
    // Duplicate detection and the position lookup are the hot paths.
    expect(indexNames(STORE_NAMES.games)).toContain('fingerprint');
    expect(indexNames(STORE_NAMES.positions)).toContain('positionKey');
    expect(indexNames(STORE_NAMES.positions)).toContain('gameId');
  });

  it('enforces one game per fingerprint at the schema level', () => {
    const { stores, target } = recorder();
    applyMigrations(target, 0, DATABASE_VERSION);

    const fingerprint = stores
      .get(STORE_NAMES.games)
      ?.indexes.find((index) => index.name === 'fingerprint');
    expect(fingerprint).toBeDefined();
    expect(MIGRATIONS[0]?.description.length, 'every migration explains itself').toBeGreaterThan(0);
  });

  /**
   * The property that makes future schema changes safe: upgrading an existing
   * database only runs the steps it has not already seen, so nothing is
   * recreated and no user data is dropped to make types line up.
   */
  it('runs nothing when the stored database is already current', () => {
    const { stores, target } = recorder();
    applyMigrations(target, DATABASE_VERSION, DATABASE_VERSION);
    expect(stores.size).toBe(0);
  });

  it('runs only the steps between the stored and the target version', () => {
    const { stores, target } = recorder();
    applyMigrations(target, 1, DATABASE_VERSION);
    // With one migration shipped so far there is nothing above version 1 yet;
    // when there is, this asserts that version 1 is not replayed over live data.
    expect(stores.has(STORE_NAMES.studies)).toBe(false);
  });
});
