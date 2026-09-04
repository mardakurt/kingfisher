import 'fake-indexeddb/auto';

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// The real companion SQLite implementation, in this process. Testing a copy
// against a double would prove the loop and nothing about whether a game
// actually survives the crossing between two genuinely different stores.
import { GameDatabase } from '../../../companion/src/database.mjs';

import { parsePgn } from '@/chess/pgn';
import type { CompanionClient } from '@/companion/client';
import { openPersistenceDatabaseAt } from '@/persistence/indexeddb/database';
import { indexGame, normalizeGame } from '@/persistence/prepare-game';
import { LocalGameRepository } from '@/persistence/repositories/game-repository';
import { DATABASE_VERSION, STORE_NAMES } from '@/persistence/schema/migrations';
import type { PersistenceDatabase } from '@/persistence/indexeddb/database';
import { classifyTree } from '@/theory/classify-games';
import { loadOpeningIndex } from '@/theory/openings';

import { LocalGameCollection } from './local';
import { copyGames, findDuplicates, moveGames, previewMerge } from './operations';
import { SqliteGameCollection } from './sqlite';

const index = await loadOpeningIndex();

const PGNS = [
  '[White "Carlsen, Magnus"]\n[Black "Firouzja, Alireza"]\n[Result "1-0"]\n[Date "2024.02.01"]\n[Event "Tata"]\n[Round "3"]\n\n' +
    '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e5 1-0',
  '[White "Gukesh, D"]\n[Black "Carlsen, Magnus"]\n[Result "1/2-1/2"]\n[Date "2025.04.10"]\n[Event "Candidates"]\n[Round "7"]\n\n' +
    '1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 4. e3 O-O 1/2-1/2',
  '[White "Nepomniachtchi, Ian"]\n[Black "Ding, Liren"]\n[Result "0-1"]\n[Date "2023.04.20"]\n[Event "WCh"]\n[Round "6"]\n\n' +
    '1. e4 e6 2. d4 d5 3. Nc3 Bb4 4. e5 c5 0-1',
];

function prepared(pgn: string) {
  const parsed = parsePgn(pgn).games[0];
  if (!parsed) throw new Error('fixture PGN did not parse');
  const base = normalizeGame(parsed.tree);
  const game = { ...base, ...classifyTree(index, base.tree) };
  return { game, positions: indexGame(game) };
}

/**
 * A companion client backed by a real SQLite file, with no HTTP in between.
 *
 * Only the methods the collection port uses are implemented; anything else
 * throwing is the point, since a copy reaching for a route it does not need
 * would be a bug worth failing on.
 */
function fakeClient(databases: ReadonlyMap<string, GameDatabase>): CompanionClient {
  const target = (key: string) => {
    const database = databases.get(key);
    if (!database) throw new Error(`No such collection: ${key}`);
    return database;
  };
  return {
    async status() {
      return {
        engines: [],
        sessions: [],
        databases: [...databases.entries()].map(([key, database]) => ({
          key,
          name: key,
          games: database.count(),
          file: `${key}.sqlite`,
          bytes: null,
          modifiedAt: null,
        })),
      };
    },
    async exportPage(key: string, after: string | null, limit: number, query?: unknown) {
      return target(key).exportPage(after, limit, query ?? null);
    },
    async haveFingerprints(key: string, fingerprints: readonly string[]) {
      return target(key).haveFingerprints([...fingerprints]);
    },
    async duplicateKeys(key: string, after: string | null, limit: number) {
      return target(key).duplicateKeys(after, limit);
    },
    async importGames(key: string, games: unknown[]) {
      return target(key).insertGames(games);
    },
    async deleteGames(key: string, selection: { fingerprints?: readonly string[] }) {
      const result = target(key).deleteGamesByFingerprint([...(selection.fingerprints ?? [])]);
      return { deleted: result.deleted, integrity: result.integrity ?? ({} as never) };
    },
  } as unknown as CompanionClient;
}

let counter = 0;
let directory: string;
let sqliteFiles: Map<string, GameDatabase>;
let browser: PersistenceDatabase;

async function localCollection(seed: readonly string[] = []) {
  browser = await openPersistenceDatabaseAt(DATABASE_VERSION, `round-trip-${++counter}`);
  const repository = new LocalGameRepository(browser);
  for (const pgn of seed) {
    const { game, positions } = prepared(pgn);
    await repository.persist(game, positions);
  }
  return new LocalGameCollection(browser, repository);
}

function sqliteCollection(name: string, seed: readonly string[] = []) {
  const database = new GameDatabase(path.join(directory, `${name}.sqlite`));
  sqliteFiles.set(name, database);
  if (seed.length > 0) {
    database.insertGames(
      seed.map((pgn) => {
        const { game, positions } = prepared(pgn);
        return {
          game: {
            fingerprint: game.fingerprint,
            white: game.white,
            black: game.black,
            whiteKey: game.whiteKey,
            blackKey: game.blackKey,
            result: game.result,
            date: game.date,
            year: game.year,
            event: game.event,
            site: game.site,
            round: game.round,
            eco: game.eco,
            opening: game.opening,
            classification: game.classification,
            classifiedWith: game.classifiedWith,
            plyCount: positions.length,
            importedAt: game.importedAt,
          },
          pgn: game.normalizedPgn,
          positions,
        };
      }),
    );
  }
  return new SqliteGameCollection(fakeClient(sqliteFiles), name, name);
}

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'kingfisher-round-trip-'));
  sqliteFiles = new Map();
});

afterEach(() => {
  for (const database of sqliteFiles.values()) database.close();
  browser?.close();
  rmSync(directory, { recursive: true, force: true });
});

describe('copying games between real stores', () => {
  it('carries a game from the browser into SQLite with its identity intact', async () => {
    const source = await localCollection(PGNS);
    const destination = sqliteCollection('mega');

    const result = await copyGames(source, destination, { pageSize: 2 });

    expect(result.stage).toBe('complete');
    expect(result.written).toBe(3);
    expect(await destination.count()).toBe(3);

    // The fingerprint survived, which is what makes the copy recognisable as
    // the same game rather than as a near-identical new one.
    const original = prepared(PGNS[0] as string).game;
    expect(await destination.have([original.fingerprint])).toEqual(new Set([original.fingerprint]));
  });

  it('carries a game from SQLite into the browser, movetext and index included', async () => {
    const source = sqliteCollection('mega', PGNS);
    const destination = await localCollection();

    const result = await copyGames(source, destination, { pageSize: 2 });

    expect(result.written).toBe(3);
    expect(await destination.count()).toBe(3);

    // The moves came across, not just the metadata: a game the browser cannot
    // open is not a copied game.
    const original = prepared(PGNS[1] as string).game;
    const stored = await browser.getAllFromIndex<{ id: string }>(
      STORE_NAMES.games,
      'fingerprint',
      original.fingerprint,
    );
    expect(stored).toHaveLength(1);
    const content = await browser.get<{ normalizedPgn: string }>(
      STORE_NAMES.gameContent,
      stored[0]!.id,
    );
    expect(content?.normalizedPgn).toContain('Nf6');

    // And the position index, so the copy is searchable and explorable at once.
    const positions = await browser.getAllFromIndex(STORE_NAMES.positions, 'gameId', stored[0]!.id);
    expect(positions.length).toBeGreaterThan(3);
  });

  it('carries the classification rather than re-deriving it at the far end', async () => {
    const source = await localCollection([PGNS[0] as string]);
    const destination = sqliteCollection('archive');

    await copyGames(source, destination);

    const page = await destination.read(null, null, 10);
    expect(page.games[0]?.summary.classification?.name).toBe('Sicilian Defense');
    expect(page.games[0]?.summary.classifiedWith).toBe(index.digest);
  });

  it('copies between two SQLite collections', async () => {
    const source = sqliteCollection('a', PGNS);
    const destination = sqliteCollection('b');

    await copyGames(source, destination, { pageSize: 1 });

    expect(await destination.count()).toBe(3);
    expect(await source.count()).toBe(3);
  });

  it('copies only the filtered result', async () => {
    const source = sqliteCollection('a', PGNS);
    const destination = await localCollection();

    await copyGames(source, destination, { query: { result: '0-1' } });

    expect(await destination.count()).toBe(1);
  });
});

describe('moving games between real stores', () => {
  it('leaves the source empty and the destination whole', async () => {
    const source = await localCollection(PGNS);
    const destination = sqliteCollection('mega');

    const result = await moveGames(source, destination, { pageSize: 2 });

    expect(result.removed).toBe(3);
    expect(await source.count()).toBe(0);
    expect(await destination.count()).toBe(3);
    expect(result.undeletedAfterCopy).toBeUndefined();
  });

  it('moves back the other way without losing the moves', async () => {
    const source = sqliteCollection('mega', PGNS);
    const destination = await localCollection();

    await moveGames(source, destination);

    expect(await source.count()).toBe(0);
    expect(await destination.count()).toBe(3);
    const page = await destination.read(null, null, 10);
    expect(page.games.every((game) => game.pgn.length > 20)).toBe(true);
  });
});

describe('merging real collections', () => {
  it('counts the exact overlap before anything is written', async () => {
    const source = await localCollection(PGNS);
    const destination = sqliteCollection('mega', [PGNS[0] as string]);

    const preview = await previewMerge(source, destination);

    expect(preview.sourceGames).toBe(3);
    expect(preview.alreadyPresent).toBe(1);
    expect(preview.newGames).toBe(2);
  });

  it('writes exactly the games the preview called new', async () => {
    const source = await localCollection(PGNS);
    const destination = sqliteCollection('mega', [PGNS[0] as string]);

    const preview = await previewMerge(source, destination);
    const result = await copyGames(source, destination);

    expect(result.written).toBe(preview.newGames);
    expect(result.duplicates).toBe(preview.alreadyPresent);
    expect(await destination.count()).toBe(3);
  });
});

describe('duplicate search across real stores', () => {
  it('finds the same game held in two different kinds of collection', async () => {
    const local = await localCollection([PGNS[0] as string, PGNS[1] as string]);
    const sqlite = sqliteCollection('mega', [PGNS[1] as string, PGNS[2] as string]);

    const result = await findDuplicates([local, sqlite]);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.kind).toBe('exact');
    expect(result.groups[0]?.members).toHaveLength(2);
    expect(result.groups[0]?.members.map((member) => member.collectionName).sort()).toEqual([
      'My games',
      'mega',
    ]);
  });

  it('flags one game annotated two different ways without calling it exact', async () => {
    const annotated = (PGNS[2] as string).replace(
      '4. e5 c5',
      '4. e5 {The main line, and the one I always get wrong.} c5',
    );
    const local = await localCollection([PGNS[2] as string]);
    const sqlite = sqliteCollection('notes', [annotated]);

    const result = await findDuplicates([local, sqlite]);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.kind).toBe('annotations-differ');
  });
});
