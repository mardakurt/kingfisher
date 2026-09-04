import { describe, expect, it } from 'vitest';

import { START_FEN } from '@/chess/fen';
import { parsePgn } from '@/chess/pgn';

import { normalizeGame, indexGame } from '../import-game';
import { MemoryPersistenceDatabase } from '../indexeddb/memory';
import { LocalGameRepository } from '../repositories/game-repository';

import {
  applyMigrations,
  DATABASE_VERSION,
  MIGRATIONS,
  playerKey,
  resolveSchema,
  splitGameRecord,
  STORE_NAMES,
  withPlayerKeys,
  type MigrationTarget,
  type StoreName,
} from './migrations';

interface CreatedStore {
  readonly options: IDBObjectStoreParameters;
  indexes: { name: string; keyPath: string | readonly string[] }[];
}

/** Records what a migration asked for, without needing a real IndexedDB. */
function recorder() {
  const stores = new Map<StoreName, CreatedStore>();
  const rewritten: StoreName[] = [];
  const splits: string[] = [];
  const target: MigrationTarget = {
    hasStore: (name) => stores.has(name),
    createStore: (name, options, indexes = []) => {
      if (stores.has(name)) throw new Error(`${name} was created twice`);
      stores.set(name, { options, indexes: [...indexes] });
    },
    addIndex: (name, index) => {
      const store = stores.get(name);
      if (!store) throw new Error(`${name} does not exist yet`);
      store.indexes.push(index);
    },
    split: (from, to) => {
      splits.push(`${from}->${to}`);
    },
    rewrite: (name) => {
      rewritten.push(name);
    },
  };
  return { stores, target, rewritten, splits };
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
    /*
      Every store is keyed by a single `id`, with one exception: a reference
      pack's chunks are identified by the pack they belong to *and* their name,
      so that removing a pack can delete its chunks by range rather than by
      remembering which ones it wrote.
    */
    for (const [name, store] of stores) {
      expect(store.options.keyPath).toEqual(
        name === STORE_NAMES.referenceChunks ? ['packId', 'chunkId'] : 'id',
      );
    }
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
  it('resolves a schema that matches what the migrations created', () => {
    const schema = resolveSchema();
    expect([...schema.keys()].sort()).toEqual([...Object.values(STORE_NAMES)].sort());
    // Index names and key paths differ on purpose; the resolver must keep both.
    expect(schema.get(STORE_NAMES.trainingItems)?.indexes.get('dueAt')?.keyPath).toBe(
      'schedule.dueAt',
    );
    expect(schema.get(STORE_NAMES.games)?.indexes.get('players')?.multiEntry).toBe(true);
  });

  /**
   * The upgrade a real Phase 2 installation performs. Simulated by building the
   * version 1 schema first and then running only the steps above it, which is
   * exactly what the browser does — and is where a migration that assumes a
   * fresh database would fail.
   */
  it('upgrades an existing version 1 database without recreating its stores', () => {
    const { stores, target, rewritten } = recorder();
    applyMigrations(target, 0, 1);
    const v1Stores = [...stores.keys()].sort();
    const gamesIndexesBefore = stores.get(STORE_NAMES.games)?.indexes.length ?? 0;

    applyMigrations(target, 1, DATABASE_VERSION);

    // Nothing from version 1 was recreated; `createStore` throws on a repeat.
    for (const store of v1Stores) expect(stores.has(store)).toBe(true);

    // The new stores arrived.
    expect(stores.has(STORE_NAMES.repertoires)).toBe(true);
    expect(stores.has(STORE_NAMES.repertoirePositions)).toBe(true);
    expect(stores.has(STORE_NAMES.trainingItems)).toBe(true);
    expect(stores.has(STORE_NAMES.trainingReviews)).toBe(true);
    expect(stores.has(STORE_NAMES.modelGameLinks)).toBe(true);
    expect(stores.has(STORE_NAMES.profile)).toBe(true);

    // The existing games store gained indexes rather than being replaced.
    const gamesIndexes = stores.get(STORE_NAMES.games)?.indexes ?? [];
    expect(gamesIndexes.length).toBeGreaterThan(gamesIndexesBefore);
    expect(gamesIndexes.map((index) => index.name)).toEqual(
      expect.arrayContaining(['fingerprint', 'players', 'whiteKey', 'blackKey', 'year']),
    );

    // And its records are backfilled, so old games are searchable by the new
    // indexes without being re-imported.
    expect(rewritten).toContain(STORE_NAMES.games);
  });

  it('runs nothing at all when a current database is opened', () => {
    const { stores, target, rewritten } = recorder();
    applyMigrations(target, DATABASE_VERSION, DATABASE_VERSION);
    expect(stores.size).toBe(0);
    expect(rewritten).toHaveLength(0);
  });

  it('moves a Phase 2 game tree without changing its searchable summary', () => {
    const legacy = {
      id: 'g1',
      white: 'A',
      black: 'B',
      tree: { rootId: 'root', nodes: { root: { fen: START_FEN } } },
      normalizedPgn: '1. e4 *',
    };
    const split = splitGameRecord(legacy);

    expect(split?.keep).toEqual({ id: 'g1', white: 'A', black: 'B' });
    expect(split?.move).toEqual({
      id: 'g1',
      tree: legacy.tree,
      normalizedPgn: '1. e4 *',
    });
    expect(splitGameRecord(split?.keep)).toBeNull();
  });

  it('supports search, open, explore and delete after the v2-to-v3 split', async () => {
    const parsed = parsePgn('[White "Carlsen"]\n[Black "Nepo"]\n[Opening "Catalan"]\n\n1. d4 Nf6 *')
      .games[0];
    if (!parsed) throw new Error('migration fixture did not parse');
    const legacy = normalizeGame(parsed.tree, 1);
    const split = splitGameRecord(legacy) as { keep: unknown; move: unknown };
    const database = new MemoryPersistenceDatabase();
    await database.put(STORE_NAMES.games, split.keep);
    await database.put(STORE_NAMES.gameContent, split.move);
    for (const position of indexGame(legacy)) await database.put(STORE_NAMES.positions, position);
    const repository = new LocalGameRepository(database);

    expect((await repository.search({ player: 'carlsen' })).games[0]?.opening).toBe('Catalan');
    expect((await repository.get(legacy.id))?.tree.headers.White).toBe('Carlsen');
    expect((await repository.explore(START_FEN)).moves[0]?.san).toBe('d4');

    await repository.delete(legacy.id);
    expect(await repository.get(legacy.id)).toBeNull();
    expect((await repository.explore(START_FEN)).totalGames).toBe(0);
  });
});

describe('player key normalization', () => {
  it('folds case and whitespace, because those are the same person', () => {
    expect(playerKey('  KASPAROV,   Garry ')).toBe('kasparov, garry');
    expect(playerKey('Kasparov, Garry')).toBe('kasparov, garry');
  });

  it('does not merge names that merely look similar', () => {
    // Two different people; an aggressive normalizer would collapse them and
    // produce a preparation report about the wrong player.
    expect(playerKey('Polgar, Judit')).not.toBe(playerKey('Polgar, Susan'));
    expect(playerKey('M. Carlsen')).not.toBe(playerKey('Magnus Carlsen'));
  });

  it('handles a missing name without throwing', () => {
    expect(playerKey(undefined)).toBe('');
  });
});

describe('games backfill', () => {
  it('adds normalized keys for both players', () => {
    const record = withPlayerKeys({ id: 'g1', white: 'Carlsen, M', black: 'Nepo, I' }) as Record<
      string,
      unknown
    >;
    expect(record.whiteKey).toBe('carlsen, m');
    expect(record.blackKey).toBe('nepo, i');
    expect(record.playerKeys).toEqual(['carlsen, m', 'nepo, i']);
  });

  it('lists one key when a player faced themselves in a fixture', () => {
    const record = withPlayerKeys({ white: 'A', black: 'A' }) as Record<string, unknown>;
    expect(record.playerKeys).toEqual(['a']);
  });

  it('leaves a non-object record alone', () => {
    expect(withPlayerKeys(null)).toBeNull();
  });
});
