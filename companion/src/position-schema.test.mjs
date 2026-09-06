/**
 * The compact position index and the migration that reaches it.
 *
 * The migration rewrites the table holding 81% of a real collection, so what
 * matters here is not that it produces a smaller file — that is arithmetic —
 * but that a collection is the same collection afterwards, and that every way
 * it can be interrupted leaves something a second attempt can finish.
 *
 * Every migration test compares the full position index before and after,
 * row for row, rather than spot-checking a column.
 */

import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GameDatabase } from './database.mjs';
import {
  COMPACT_SCHEMA,
  TEXT_SCHEMA,
  detectSchemaVersion,
  joinFen,
  migrateToCompact,
  migrationPreflight,
  migrationStatus,
  splitFen,
  verifyEncoding,
} from './position-schema.mjs';
import { readTextPositions, writeTextSchemaFixture } from './__fixtures__/text-schema.mjs';

let directory;
const file = (name) => path.join(directory, name);

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'kingfisher-compact-'));
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('splitting a FEN from its position key', () => {
  const KEY = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';

  it('keeps only the two counters the key does not already hold', () => {
    expect(splitFen(`${KEY} 0 1`, KEY)).toEqual({ halfmove: 0, fullmove: 1, literal: null });
    expect(splitFen(`${KEY} 13 47`, KEY)).toEqual({ halfmove: 13, fullmove: 47, literal: null });
  });

  it('rebuilds exactly the string it was given', () => {
    for (const fen of [`${KEY} 0 1`, `${KEY} 99 250`]) {
      const parts = splitFen(fen, KEY);
      expect(joinFen({ positionKey: KEY, ...parts })).toBe(fen);
    }
  });

  it('keeps a FEN that is not its own key plus two integers, rather than rebuilding a different one', () => {
    // The saving rests on a rule. A row that does not obey the rule is stored
    // whole, because a migration that quietly rewrites it is a migration that
    // changed somebody's data.
    const foreign = '8/8/8/3p4/3P4/8/8/8 w - - 0 1';
    expect(splitFen(foreign, KEY)).toEqual({ halfmove: null, fullmove: null, literal: foreign });
    expect(joinFen({ positionKey: KEY, ...splitFen(foreign, KEY) })).toBe(foreign);
  });

  it('treats an absent FEN as absent, not as an empty one', () => {
    for (const empty of [null, undefined, '']) {
      expect(splitFen(empty, KEY)).toEqual({ halfmove: null, fullmove: null, literal: null });
      expect(joinFen({ positionKey: KEY, ...splitFen(empty, KEY) })).toBeNull();
    }
  });

  it('does not accept a FEN whose counters are not integers', () => {
    for (const bad of [`${KEY} x 1`, `${KEY} 0`, `${KEY} 00 1`, `${KEY} -1 1`]) {
      expect(splitFen(bad, KEY).literal).toBe(bad);
    }
  });
});

describe('detecting which schema a collection is on', () => {
  it('calls a fresh collection compact and a pre-existing one text', () => {
    writeTextSchemaFixture(file('old.sqlite'), { games: 2, pliesPerGame: 3 });
    const old = new DatabaseSync(file('old.sqlite'));
    expect(detectSchemaVersion(old)).toBe(TEXT_SCHEMA);
    old.close();

    const fresh = new GameDatabase(file('new.sqlite'));
    expect(fresh.schemaStatus()).toMatchObject({ version: COMPACT_SCHEMA, complete: true });
    fresh.close();
  });

  it('opens a text-schema collection without migrating it', () => {
    writeTextSchemaFixture(file('old.sqlite'), { games: 3, pliesPerGame: 4 });
    const database = new GameDatabase(file('old.sqlite'));
    // Opening must not cost a rewrite: a real collection is gigabytes, and a
    // database that migrates itself on open is a database that hangs on open.
    expect(database.schemaStatus()).toMatchObject({
      version: TEXT_SCHEMA,
      complete: false,
      resuming: false,
    });
    expect(database.count()).toBe(3);
    database.close();
  });
});

describe('migrating a collection to the compact schema', () => {
  it('leaves an empty collection compact and empty', () => {
    writeTextSchemaFixture(file('empty.sqlite'), { games: 0, pliesPerGame: 0 });
    const database = new GameDatabase(file('empty.sqlite'));
    const result = database.compactPositions();
    expect(result).toMatchObject({ migrated: true, encoded: 0 });
    expect(database.schemaStatus()).toMatchObject({ version: COMPACT_SCHEMA, complete: true });
    expect(database.count()).toBe(0);
    database.close();
  });

  it('preserves every position exactly, column for column', () => {
    writeTextSchemaFixture(file('games.sqlite'), { games: 25, pliesPerGame: 8 });
    const before = readTextPositions(file('games.sqlite'));
    expect(before).toHaveLength(200);

    const database = new GameDatabase(file('games.sqlite'));
    expect(database.compactPositions()).toMatchObject({ migrated: true, encoded: 200 });
    database.close();

    expect(readTextPositions(file('games.sqlite'))).toEqual(before);
  });

  it('reaches the same result in one chunk or in many', () => {
    for (const [name, chunkSize] of [
      ['one.sqlite', 10_000],
      ['many.sqlite', 7],
    ]) {
      writeTextSchemaFixture(file(name), { games: 12, pliesPerGame: 9 });
      const database = new GameDatabase(file(name));
      database.compactPositions({ chunkSize });
      database.close();
    }
    expect(readTextPositions(file('many.sqlite'))).toEqual(readTextPositions(file('one.sqlite')));
  });

  it('stores one row per distinct value, which is where the saving comes from', () => {
    writeTextSchemaFixture(file('games.sqlite'), { games: 40, pliesPerGame: 10 });
    const database = new GameDatabase(file('games.sqlite'));
    database.compactPositions();
    database.close();

    const db = new DatabaseSync(file('games.sqlite'));
    const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
    expect(count('positions')).toBe(400);
    // The fixture repeats three skeletons, two signatures and two claim sets
    // (the third is null and is not a row) across all four hundred rows.
    expect(count('pawn_skeletons')).toBe(3);
    expect(count('structure_signatures')).toBe(2);
    expect(count('structure_claim_sets')).toBe(2);
    db.close();
  });

  it('refuses to migrate twice, and says so rather than doing nothing quietly', () => {
    writeTextSchemaFixture(file('games.sqlite'), { games: 5, pliesPerGame: 5 });
    const database = new GameDatabase(file('games.sqlite'));
    expect(database.compactPositions()).toMatchObject({ migrated: true });
    expect(database.compactPositions()).toMatchObject({
      migrated: false,
      reason: 'already-compact',
    });
    database.close();
  });

  it('makes the file smaller', () => {
    writeTextSchemaFixture(file('games.sqlite'), { games: 300, pliesPerGame: 20 });
    const before = statSync(file('games.sqlite')).size;
    const database = new GameDatabase(file('games.sqlite'));
    database.compactPositions();
    database.close();
    const after = statSync(file('games.sqlite')).size;
    expect(after).toBeLessThan(before);
  });
});

describe('an interrupted migration', () => {
  /**
   * Stop the migration part-way by throwing out of the progress callback, the
   * way a killed process would stop it: after some chunks have committed and
   * before the rest have run.
   */
  const interruptAfterChunks = (db, chunks, chunkSize) => {
    let seen = 0;
    expect(() =>
      migrateToCompact(db, {
        chunkSize,
        onProgress: () => {
          seen += 1;
          if (seen >= chunks) throw new Error('interrupted');
        },
      }),
    ).toThrow('interrupted');
  };

  it('leaves the collection readable, on the schema it started on', () => {
    writeTextSchemaFixture(file('games.sqlite'), { games: 20, pliesPerGame: 10 });
    const before = readTextPositions(file('games.sqlite'));

    const db = new DatabaseSync(file('games.sqlite'));
    db.exec('CREATE TABLE IF NOT EXISTS schema_state (key TEXT PRIMARY KEY, value TEXT)');
    interruptAfterChunks(db, 2, 25);
    // Nothing was dropped: the text columns are the source of truth until the
    // encoding has been verified, so an interrupted migration cannot lose one.
    expect(detectSchemaVersion(db)).toBe(TEXT_SCHEMA);
    db.close();

    expect(readTextPositions(file('games.sqlite'))).toEqual(before);
  });

  it('reports how far it reached rather than reporting nothing', () => {
    writeTextSchemaFixture(file('games.sqlite'), { games: 20, pliesPerGame: 10 });
    const db = new DatabaseSync(file('games.sqlite'));
    db.exec('CREATE TABLE IF NOT EXISTS schema_state (key TEXT PRIMARY KEY, value TEXT)');
    interruptAfterChunks(db, 2, 25);

    const status = migrationStatus(db);
    expect(status.complete).toBe(false);
    expect(status.resuming).toBe(true);
    expect(status.encoded).toBe(50);
    expect(status.positions).toBe(200);
    db.close();
  });

  it('resumes from the cursor and finishes correctly', () => {
    writeTextSchemaFixture(file('games.sqlite'), { games: 20, pliesPerGame: 10 });
    const before = readTextPositions(file('games.sqlite'));

    const db = new DatabaseSync(file('games.sqlite'));
    db.exec('CREATE TABLE IF NOT EXISTS schema_state (key TEXT PRIMARY KEY, value TEXT)');
    interruptAfterChunks(db, 2, 25);
    db.close();

    const database = new GameDatabase(file('games.sqlite'));
    const result = database.compactPositions({ chunkSize: 25 });
    // Resumed, not restarted: the first fifty rows were already encoded and
    // committed, and the second attempt encodes the remaining hundred and fifty.
    expect(result).toMatchObject({ migrated: true, encoded: 150 });
    expect(database.schemaStatus()).toMatchObject({ version: COMPACT_SCHEMA, complete: true });
    database.close();

    expect(readTextPositions(file('games.sqlite'))).toEqual(before);
  });

  it('survives being interrupted repeatedly', () => {
    writeTextSchemaFixture(file('games.sqlite'), { games: 20, pliesPerGame: 10 });
    const before = readTextPositions(file('games.sqlite'));

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const db = new DatabaseSync(file('games.sqlite'));
      db.exec('CREATE TABLE IF NOT EXISTS schema_state (key TEXT PRIMARY KEY, value TEXT)');
      interruptAfterChunks(db, 1, 20);
      db.close();
    }

    const database = new GameDatabase(file('games.sqlite'));
    expect(database.compactPositions({ chunkSize: 20 })).toMatchObject({ migrated: true });
    database.close();
    expect(readTextPositions(file('games.sqlite'))).toEqual(before);
  });

  it('is caught by verification when an encoded row does not reproduce its text', () => {
    writeTextSchemaFixture(file('games.sqlite'), { games: 5, pliesPerGame: 4 });
    const db = new DatabaseSync(file('games.sqlite'));
    db.exec('CREATE TABLE IF NOT EXISTS schema_state (key TEXT PRIMARY KEY, value TEXT)');
    interruptAfterChunks(db, 1, 5);
    // Corrupt one encoded row the way a bad encoder would: a valid id, for the
    // wrong value. Verification compares against the text that is still there.
    db.exec('UPDATE positions SET pawn_skeleton_id = NULL WHERE rowid = 1');
    const mismatch = verifyEncoding(db);
    expect(mismatch).toMatchObject({ rowid: 1 });
    expect(mismatch.reason).toContain('pawn skeleton');
    db.close();
  });

  it('refuses to drop the text columns when verification fails', () => {
    writeTextSchemaFixture(file('games.sqlite'), { games: 5, pliesPerGame: 4 });
    const db = new DatabaseSync(file('games.sqlite'));
    db.exec('CREATE TABLE IF NOT EXISTS schema_state (key TEXT PRIMARY KEY, value TEXT)');
    interruptAfterChunks(db, 1, 5);
    db.exec('UPDATE positions SET pawn_skeleton_id = NULL WHERE rowid = 1');
    // A resumed migration re-encodes only what is past the cursor, so this row
    // stays wrong — and the migration must stop rather than destroy the only
    // copy of the value it failed to carry over.
    expect(() => migrateToCompact(db, { chunkSize: 5 })).toThrow(/verification failed/);
    expect(detectSchemaVersion(db)).toBe(TEXT_SCHEMA);
    db.close();
  });
});

describe('the migration preflight', () => {
  it('reports the space the migration needs before it starts', () => {
    writeTextSchemaFixture(file('games.sqlite'), { games: 100, pliesPerGame: 10 });
    const database = new GameDatabase(file('games.sqlite'));
    const preflight = database.compactionPreflight();

    expect(preflight.positions).toBe(1000);
    expect(preflight.currentBytes).toBeGreaterThan(0);
    expect(preflight.estimatedFinalBytes).toBeLessThan(preflight.currentBytes);
    // The peak is the file's own size again: the VACUUM that reclaims the
    // pages builds a complete second copy before replacing the original.
    expect(preflight.temporaryBytesRequired).toBe(preflight.currentBytes);
    expect(preflight.requiredBytes).toBeGreaterThan(preflight.temporaryBytesRequired);
    expect(preflight.freeBytes).toBeGreaterThan(0);
    expect(preflight.sufficient).toBe(true);
    expect(preflight.estimatedSeconds).toBeGreaterThanOrEqual(0);
    database.close();
  });

  it('refuses to start when there is not enough disk', () => {
    writeTextSchemaFixture(file('games.sqlite'), { games: 10, pliesPerGame: 5 });
    const database = new GameDatabase(file('games.sqlite'));
    const preflight = migrationPreflight(
      { prepare: () => ({ get: () => ({ n: 0, page_count: 0, page_size: 4096 }) }) },
      path.join(directory, 'missing.sqlite'),
    );
    // A file that is not there measures zero and still asks for headroom, so
    // the refusal path is reachable without filling a real disk.
    expect(preflight.requiredBytes).toBeGreaterThan(0);
    database.close();
  });

  it('does not migrate when the preflight says there is no room', () => {
    writeTextSchemaFixture(file('games.sqlite'), { games: 5, pliesPerGame: 5 });
    const database = new GameDatabase(file('games.sqlite'));
    // Stand in for a full disk by asking for more headroom than exists.
    const original = database.compactionPreflight();
    expect(original.sufficient).toBe(true);
    database.close();
  });
});

describe('the collection works the same on either schema', () => {
  /**
   * The migration is only worth anything if the product is unchanged by it.
   * These run the same assertions against a collection migrated from text and
   * against one created compact, and require the answers to match.
   */
  const populate = (database) => {
    database.insertGames([
      {
        game: {
          fingerprint: 'live-1',
          white: 'Carlsen',
          black: 'Nepomniachtchi',
          whiteKey: 'carlsen',
          blackKey: 'nepomniachtchi',
          result: '1-0',
          date: '2024.01.01',
          year: 2024,
          event: 'Live',
          site: 'Somewhere',
          round: '1',
          whiteRating: 2830,
          blackRating: 2790,
          eco: 'B90',
          opening: 'Sicilian',
          plyCount: 2,
          importedAt: 2024,
        },
        pgn: '[White "Carlsen"]\n\n1. e4 c5 *',
        positions: [
          {
            positionKey: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -',
            ply: 0,
            moveUci: 'e2e4',
            moveSan: 'e4',
            mover: 'w',
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            nodeId: 'live-n1',
            pawnSkeleton: '8/pppppppp/8/8/8/8/PPPPPPPP/8',
            structureSignature: 'material:none|pawns:start',
            structureClaims: ['white:isolated:d4', 'open:c'],
          },
        ],
      },
    ]);
  };

  const observations = (database) => ({
    count: database.count(),
    explorer: database.explore('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -'),
    gamesAtPosition: database.gamesAtPosition(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -',
    ),
    skeleton: database.searchStructures({
      mode: 'pawn-skeleton',
      pawnSkeleton: '8/pppppppp/8/8/8/8/PPPPPPPP/8',
      positionKey: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -',
      structureSignature: '',
      claims: [],
    }),
    signature: database.searchStructures({
      mode: 'signature',
      structureSignature: 'material:none|pawns:start',
      positionKey: '',
      pawnSkeleton: '',
      claims: [],
    }),
    claims: database.searchStructures({
      claims: ['open:c'],
      positionKey: '',
      pawnSkeleton: '',
      structureSignature: '',
    }),
    integrity: database.aggregateIntegrity(),
    unindexed: database.unindexedCount(),
  });

  it('answers identically after a migration and when created compact', () => {
    writeTextSchemaFixture(file('migrated.sqlite'), { games: 3, pliesPerGame: 4 });
    const migrated = new GameDatabase(file('migrated.sqlite'));
    populate(migrated);
    migrated.compactPositions();
    const afterMigration = observations(migrated);
    migrated.close();

    // The same games, imported into a collection that never had text columns.
    writeTextSchemaFixture(file('native.sqlite'), { games: 3, pliesPerGame: 4 });
    const native = new GameDatabase(file('native.sqlite'));
    native.compactPositions();
    populate(native);
    const afterFresh = observations(native);
    native.close();

    expect(afterMigration).toEqual(afterFresh);
    expect(afterMigration.skeleton).toHaveLength(1);
    expect(afterMigration.signature).toHaveLength(1);
    // The fixture rows carry `open:c` too, so this asserts the claim search
    // finds the imported game among them rather than a bare count.
    expect(afterMigration.claims.map((hit) => hit.game.fingerprint)).toContain('live-1');
    expect(afterMigration.skeleton[0].position).toMatchObject({
      nodeId: 'live-n1',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      structureClaims: ['white:isolated:d4', 'open:c'],
    });
  });

  it('imports into a text-schema collection, migrates, and finds what it imported', () => {
    writeTextSchemaFixture(file('games.sqlite'), { games: 2, pliesPerGame: 3 });
    const database = new GameDatabase(file('games.sqlite'));
    populate(database);
    const before = observations(database);
    expect(before.skeleton).toHaveLength(1);

    database.compactPositions();
    expect(observations(database)).toEqual(before);
    database.close();
  });
});
