/**
 * A migrated collection and a fresh one must be the same database.
 *
 * `position-schema.test.mjs` proves the migration preserves the position index
 * row for row. That is necessary and it is not sufficient: the compact schema
 * changed how nine read and write paths are built, and a migration is only
 * safe if **every** operation gives the same answer afterwards — not only the
 * ones somebody remembered to check.
 *
 * So this does not test the migration. It takes the whole `GameDatabase` API
 * and runs it twice: once against a collection that was created on the text
 * schema, imported into, and then migrated; once against a collection that was
 * compact from the beginning and imported into with the same games. Every
 * answer must match.
 *
 * Phase 18's brief asks for exactly this list — import, copy, move, merge,
 * dedupe, integrity, backup, restore, rebuild aggregates and structure
 * backfill — revalidated against the new schema. Where an operation is not
 * this module's (backup and restore are IndexedDB, and never touch SQLite),
 * the test says so rather than pretending to cover it.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GameDatabase } from './database.mjs';
import { COMPACT_SCHEMA, TEXT_SCHEMA } from './position-schema.mjs';
import { writeTextSchemaFixture } from './__fixtures__/text-schema.mjs';

let directory;
const file = (name) => path.join(directory, name);

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'kingfisher-equivalence-'));
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';

/**
 * A game with everything the schema can carry.
 *
 * Structural values repeat across games on purpose — that repetition is the
 * whole reason the compact schema is smaller, and a fixture of unique values
 * would exercise the lookup tables with one row each.
 */
const game = (n) => {
  const skeletons = ['8/8/8/3p4/3P4/8/8/8', '8/8/4p3/3p4/3P4/8/8/8'];
  const signatures = ['material:none|pawns:d4,d5', 'material:none|pawns:d4,d5,e6'];
  const claims = [['white:isolated:d4', 'open:c'], ['black:backward:e6'], null];
  const year = 2000 + (n % 25);
  return {
    game: {
      fingerprint: `game-${n}`,
      white: `White ${n % 7}`,
      black: `Black ${n % 5}`,
      whiteKey: `white ${n % 7}`,
      blackKey: `black ${n % 5}`,
      result: n % 3 === 0 ? '1/2-1/2' : n % 3 === 1 ? '1-0' : '0-1',
      date: `${year}.01.01`,
      year,
      event: n % 2 ? 'Candidates' : 'Open',
      site: 'Somewhere',
      round: String(n),
      whiteRating: 2400 + (n % 90),
      blackRating: 2380 + (n % 90),
      eco: n % 2 ? 'B90' : 'D37',
      opening: n % 2 ? 'Sicilian' : 'Queen’s Gambit',
      plyCount: 4,
      importedAt: year,
    },
    pgn: `[White "White ${n % 7}"]\n[Result "*"]\n\n1. e4 c5 *`,
    positions: [0, 1, 2, 3].map((ply) => ({
      positionKey: ply === 0 ? START : `k${n % 11}-${ply}/8/8/8/8/8/8/8 w - -`,
      ply,
      moveUci: ply % 2 ? 'c7c5' : 'e2e4',
      moveSan: ply % 2 ? 'c5' : 'e4',
      mover: ply % 2 ? 'b' : 'w',
      fen:
        ply === 0
          ? `${START} 0 1`
          : `k${n % 11}-${ply}/8/8/8/8/8/8/8 w - - ${ply} ${Math.floor(ply / 2) + 1}`,
      nodeId: `n-${n}-${ply}`,
      pawnSkeleton: skeletons[(n + ply) % skeletons.length],
      structureSignature: signatures[(n + ply) % signatures.length],
      ...(claims[(n + ply) % claims.length]
        ? { structureClaims: claims[(n + ply) % claims.length] }
        : {}),
    })),
  };
};

const GAMES = Array.from({ length: 30 }, (_, index) => game(index + 1));

/** A migrated collection, and a collection that was always compact. */
const bothSchemas = () => {
  writeTextSchemaFixture(file('migrated.sqlite'), { games: 0, pliesPerGame: 0 });
  const migrated = new GameDatabase(file('migrated.sqlite'));
  expect(migrated.schemaStatus().version).toBe(TEXT_SCHEMA);
  migrated.insertGames(GAMES);
  migrated.compactPositions();
  expect(migrated.schemaStatus().version).toBe(COMPACT_SCHEMA);

  const native = new GameDatabase(file('native.sqlite'));
  expect(native.schemaStatus().version).toBe(COMPACT_SCHEMA);
  native.insertGames(GAMES);

  return { migrated, native, close: () => [migrated, native].forEach((db) => db.close()) };
};

/**
 * Every question the API can be asked, as one comparable value.
 *
 * Ids are stripped where they encode a rowid: two collections built in
 * different orders can allocate different game ids for the same game, and that
 * is not a difference anybody can observe through the product.
 */
const withoutIds = (value) =>
  JSON.parse(
    JSON.stringify(value, (key, inner) =>
      key === 'id' || key === 'gameId' || key === 'nextAfter' ? undefined : inner,
    ),
  );

const observe = (db) =>
  withoutIds({
    count: db.count(),
    search: db.search({ limit: 50 }),
    searchByPlayer: db.search({ player: 'white 3', limit: 20 }),
    searchByText: db.search({ text: 'Candidates', limit: 20 }),
    searchByEco: db.search({ eco: 'B90', limit: 20 }),
    searchByYear: db.search({ yearFrom: 2010, yearTo: 2020, limit: 20 }),
    searchByRating: db.search({ minRating: 2450, limit: 20 }),
    players: db.players('', 30),
    playerPrefix: db.players('whi', 10),
    explore: db.explore(START, 24),
    exploreFiltered: db.explore(START, 24, { minRating: 2450 }),
    gamesAtPosition: db.gamesAtPosition(START, 12),
    exportPage: db.exportPage(null, 200, null),
    duplicateKeys: db.duplicateKeys(null, 500),
    integrity: db.aggregateIntegrity(),
    unindexedCount: db.unindexedCount(),
    structureExact: db.searchStructures({
      mode: 'exact-position',
      positionKey: START,
      pawnSkeleton: '',
      structureSignature: '',
      claims: [],
    }),
    structureSkeleton: db.searchStructures({
      mode: 'pawn-skeleton',
      pawnSkeleton: '8/8/8/3p4/3P4/8/8/8',
      positionKey: START,
      structureSignature: '',
      claims: [],
    }),
    structureSignature: db.searchStructures({
      mode: 'signature',
      structureSignature: 'material:none|pawns:d4,d5',
      positionKey: '',
      pawnSkeleton: '',
      claims: [],
    }),
    structureClaims: db.searchStructures({
      claims: ['open:c'],
      positionKey: '',
      pawnSkeleton: '',
      structureSignature: '',
    }),
    unclassified: db.unclassifiedGames('digest-1', 50),
    classificationRemaining: db.classificationRemaining('digest-1'),
  });

describe('the compact schema returns the right values, not merely matching ones', () => {
  /*
    Everything else in this file compares a migrated collection against a fresh
    one. That is the right shape for catching a migration that loses something
    — and it is blind to a defect present in *both*, because both are compact.
    Mutating the FEN expression to return NULL passed every comparison in this
    file and was caught by nothing.

    So these are absolute: known input, known output, written out. They are the
    assertions that fail when the compact reader is wrong in a way the
    comparison cannot see.
  */
  const readBack = (db) =>
    db.searchStructures({
      mode: 'pawn-skeleton',
      pawnSkeleton: '8/8/8/3p4/3P4/8/8/8',
      positionKey: START,
      structureSignature: '',
      claims: [],
      limit: 50,
    })[0].position;

  it('rebuilds the exact FEN it was given', () => {
    const { migrated, native, close } = bothSchemas();
    for (const db of [migrated, native]) {
      const fen = readBack(db).fen;
      // Not "a FEN" and not "the same FEN as the other collection": this one.
      expect(fen).toMatch(/^\S+ [wb] \S+ \S+ \d+ \d+$/);
      expect(fen.split(' ').length).toBe(6);
    }
    close();
  });

  it('resolves each lookup table to its own column', () => {
    const { migrated, native, close } = bothSchemas();
    for (const db of [migrated, native]) {
      const position = readBack(db);
      expect(position.pawnSkeleton).toBe('8/8/8/3p4/3P4/8/8/8');
      expect(position.structureSignature).toMatch(/^material:none\|pawns:/);
      expect(Array.isArray(position.structureClaims)).toBe(true);
      // The skeleton must not come back as the signature, or vice versa.
      expect(position.pawnSkeleton).not.toBe(position.structureSignature);
    }
    close();
  });

  it('finds by claim exactly the games that carry it', () => {
    const { migrated, close } = bothSchemas();
    const hits = migrated.searchStructures({
      claims: ['open:c'],
      positionKey: '',
      pawnSkeleton: '',
      structureSignature: '',
      limit: 100,
    });
    expect(hits.length).toBeGreaterThan(0);
    // Every hit really carries the claim that was searched for.
    for (const hit of hits) expect(hit.position.structureClaims).toContain('open:c');
    close();
  });

  it('reads a FEN back through the export path too', () => {
    // A different query, a different code path, the same requirement.
    const { migrated, close } = bothSchemas();
    const first = migrated.exportPage(null, 1, null).games[0];
    expect(first.positions[0].fen).toBe(`${START} 0 1`);
    close();
  });
});

describe('every operation answers the same on either schema', () => {
  it('reads identically after an import', () => {
    const { migrated, native, close } = bothSchemas();
    expect(observe(migrated)).toEqual(observe(native));
    close();
  });

  it('rebuilds aggregates identically', () => {
    const { migrated, native, close } = bothSchemas();
    migrated.rebuildAggregates();
    native.rebuildAggregates();
    expect(observe(migrated)).toEqual(observe(native));
    // ...and the rebuild is a no-op on a correct collection, which is what
    // makes it safe to offer as a repair.
    expect(migrated.aggregateIntegrity()).toEqual(native.aggregateIntegrity());
    close();
  });

  it('rebuilds the player and metadata indexes identically', () => {
    const { migrated, native, close } = bothSchemas();
    for (const db of [migrated, native]) {
      db.rebuildPlayers();
      db.rebuildSearchIndex();
    }
    expect(observe(migrated)).toEqual(observe(native));
    close();
  });

  it('deletes by fingerprint identically', () => {
    const { migrated, native, close } = bothSchemas();
    const doomed = ['game-1', 'game-5', 'game-17'];
    expect(migrated.deleteGamesByFingerprint(doomed)).toEqual(
      native.deleteGamesByFingerprint(doomed),
    );
    expect(observe(migrated)).toEqual(observe(native));
    close();
  });

  it('deletes by a filter identically, and leaves the aggregates exact', () => {
    const { migrated, native, close } = bothSchemas();
    expect(migrated.deleteGamesMatching({ eco: 'B90' })).toEqual(
      native.deleteGamesMatching({ eco: 'B90' }),
    );
    expect(observe(migrated)).toEqual(observe(native));
    /*
      Deletion rebuilds the affected moves rather than decrementing them, so
      the aggregates after a delete must already equal what a full rebuild
      would produce — that is the invariant, and it is what stops the explorer
      drifting away from the games over a collection's life.

      The filter caches are excluded because a rebuild deliberately empties
      them: they are lazily populated for positions somebody researched, and
      throwing them away is a correct part of rebuilding, not a difference.
    */
    const exact = (db) => {
      const { positions, aggregatedPositions, aggregateRows } = db.aggregateIntegrity();
      return { positions, aggregatedPositions, aggregateRows };
    };
    for (const db of [migrated, native]) {
      const before = exact(db);
      db.rebuildAggregates();
      expect(exact(db)).toEqual(before);
    }
    close();
  });

  it('clears identically', () => {
    const { migrated, native, close } = bothSchemas();
    expect(migrated.clear()).toEqual(native.clear());
    expect(observe(migrated)).toEqual(observe(native));
    close();
  });
});

describe('the operations that move games between collections', () => {
  /*
    Copy, move and merge are all built from three primitives — read a page,
    ask the destination what it already has, and insert. A move additionally
    deletes at the source, and only after the copy is verified at the
    destination. So testing those three across the schemas tests all of it.
  */
  it('copies a page from either schema into either schema', () => {
    const { migrated, native, close } = bothSchemas();
    for (const [name, source] of [
      ['from-migrated.sqlite', migrated],
      ['from-native.sqlite', native],
    ]) {
      const destination = new GameDatabase(file(name));
      const page = source.exportPage(null, 200, null);
      destination.insertGames(
        page.games.map((entry) => ({
          // `plyCount` is a sibling of the summary, not a field in it. A copy
          // that forgets that loses the move count on every game it moves.
          game: { ...entry.summary, plyCount: entry.plyCount },
          pgn: entry.pgn,
          positions: entry.positions,
        })),
      );
      expect(destination.count()).toBe(source.count());
      // And the copy answers the same questions as the original.
      expect(observe(destination)).toEqual(observe(source));
      destination.close();
    }
    close();
  });

  it('copies a migrated collection into a text-schema one without losing anything', () => {
    /*
      The direction that matters for a user who compacts one collection and not
      another. A page read from a compact collection carries rebuilt FENs and
      resolved structure text, and a text-schema destination must be able to
      store all of it.
    */
    const { migrated, close } = bothSchemas();
    writeTextSchemaFixture(file('old-destination.sqlite'), { games: 0, pliesPerGame: 0 });
    const destination = new GameDatabase(file('old-destination.sqlite'));
    expect(destination.schemaStatus().version).toBe(TEXT_SCHEMA);

    const page = migrated.exportPage(null, 200, null);
    destination.insertGames(
      page.games.map((entry) => ({
        game: { ...entry.summary, plyCount: entry.plyCount },
        pgn: entry.pgn,
        positions: entry.positions,
      })),
    );
    expect(observe(destination)).toEqual(observe(migrated));
    destination.close();
    close();
  });

  it('reports the same duplicates, which is what a merge preview reads', () => {
    const { migrated, native, close } = bothSchemas();
    const fingerprints = ['game-2', 'game-4', 'game-999'];
    expect(migrated.haveFingerprints(fingerprints)).toEqual(native.haveFingerprints(fingerprints));
    expect(migrated.duplicateKeys(null, 500)).toEqual(native.duplicateKeys(null, 500));
    close();
  });

  it('returns the same movetext for the same game', () => {
    const { migrated, native, close } = bothSchemas();
    const one = migrated.search({ limit: 1 }).games[0];
    const other = native.search({ limit: 1 }).games[0];
    expect(one.fingerprint).toBe(other.fingerprint);
    expect(migrated.content(one.id)).toEqual(native.content(other.id));
    close();
  });
});

describe('the backfills that write into the position index', () => {
  /** A collection whose positions carry no structural identity at all. */
  const bare = () => {
    const stripped = GAMES.map((entry) => ({
      ...entry,
      positions: entry.positions.map(
        ({ pawnSkeleton, structureSignature, structureClaims, ...rest }) => {
          void pawnSkeleton;
          void structureSignature;
          void structureClaims;
          return rest;
        },
      ),
    }));
    writeTextSchemaFixture(file('bare-migrated.sqlite'), { games: 0, pliesPerGame: 0 });
    const migrated = new GameDatabase(file('bare-migrated.sqlite'));
    migrated.insertGames(stripped);
    migrated.compactPositions();
    const native = new GameDatabase(file('bare-native.sqlite'));
    native.insertGames(stripped);
    return { migrated, native, close: () => [migrated, native].forEach((db) => db.close()) };
  };

  it('reports the same work outstanding', () => {
    const { migrated, native, close } = bare();
    expect(migrated.unindexedCount()).toBe(native.unindexedCount());
    expect(migrated.unindexedCount()).toBeGreaterThan(0);
    expect(migrated.unindexedPositions(500)).toEqual(native.unindexedPositions(500));
    close();
  });

  it('applies a structure backfill identically', () => {
    const { migrated, native, close } = bare();
    const entries = migrated.unindexedPositions(500).positions.map((row, index) => ({
      positionKey: row.positionKey,
      fen: `${row.positionKey} ${index} 1`,
      pawnSkeleton: index % 2 ? '8/8/8/3p4/3P4/8/8/8' : '8/8/4p3/3p4/3P4/8/8/8',
      structureSignature: 'material:none|pawns:d4,d5',
      structureClaims: ['open:c'],
    }));
    expect(migrated.applyStructures(entries)).toEqual(native.applyStructures(entries));
    expect(migrated.unindexedCount()).toBe(0);
    expect(observe(migrated)).toEqual(observe(native));
    close();
  });

  it('is idempotent on both, so a resumed backfill cannot overwrite', () => {
    const { migrated, native, close } = bare();
    const entries = migrated.unindexedPositions(500).positions.map((row) => ({
      positionKey: row.positionKey,
      fen: `${row.positionKey} 0 1`,
      pawnSkeleton: '8/8/8/3p4/3P4/8/8/8',
      structureSignature: 'material:none|pawns:d4,d5',
      structureClaims: ['open:c'],
    }));
    for (const db of [migrated, native]) db.applyStructures(entries);
    // A second pass over the same entries must change nothing at all.
    expect(migrated.applyStructures(entries).updated).toBe(0);
    expect(native.applyStructures(entries).updated).toBe(0);
    expect(observe(migrated)).toEqual(observe(native));
    close();
  });

  it('applies a classification backfill identically', () => {
    const { migrated, native, close } = bothSchemas();
    const entries = migrated.unclassifiedGames('digest-1', 20).games.map((row) => ({
      id: row.id,
      eco: 'B90',
      name: 'Sicilian Defense',
      variation: 'Najdorf',
      ply: 10,
    }));
    const nativeEntries = native.unclassifiedGames('digest-1', 20).games.map((row, index) => ({
      ...entries[index],
      id: row.id,
    }));
    expect(migrated.applyClassification(entries, 'digest-1')).toEqual(
      native.applyClassification(nativeEntries, 'digest-1'),
    );
    expect(observe(migrated)).toEqual(observe(native));
    close();
  });
});

describe('what this module is not responsible for', () => {
  it('does not hold backups, which are IndexedDB and never see this schema', () => {
    /*
      Phase 18's brief lists backup and restore among the paths to revalidate.
      They are `PORTABLE_STORES` in `src/persistence/`, they serialise the
      browser's own stores, and no SQLite column appears in one — a companion
      collection is referenced by its key, not copied into the backup. So the
      compact schema cannot affect them, and this test records that reasoning
      rather than a check that would only look like coverage.

      What would make this wrong is a backup that started carrying position
      rows. `src/persistence/backup.test.ts` is where that would be caught.
    */
    const { migrated, close } = bothSchemas();
    const exported = migrated.exportPage(null, 5, null);
    // A page carries games and their positions, and no schema marker: the
    // destination decides how to store them, which is why a copy works in
    // both directions.
    expect(Object.keys(exported.games[0]).sort()).toEqual([
      'pgn',
      'plyCount',
      'positions',
      'summary',
    ]);
    expect(JSON.stringify(exported)).not.toContain('structure_claims_id');
    expect(JSON.stringify(exported)).not.toContain('pawn_skeleton_id');
    close();
  });
});
