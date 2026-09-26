/**
 * The posting layout answers every position question exactly as the row
 * layout does (Phase 86).
 *
 * Not a model of either: the same games, prepared by the browser's own import
 * code (the import kit, from source), are written to one collection in each
 * layout, and every distinct position either holds is asked the explorer's
 * question under eight filters, the model-game question, the continuation
 * question and the exact-position search — before and after hot aggregates
 * exist, after an ordinary import on top of them, after deletions, after a
 * bulk load, and after converting a row-layout collection in place. Export
 * and the classification backfill, which re-derive rows from the stored PGN,
 * are compared row for row.
 */

import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as kit from '../../src/companion-kit/import-kit.ts';

import { GameDatabase } from './database.mjs';
import {
  decodeMove,
  encodeMove,
  HOT_GAMES,
  packPlies,
  positionHash,
  unpackPlies,
} from './postings.mjs';

const ROOT = new URL('../../', import.meta.url);
const read = (file) => readFileSync(new URL(file, ROOT), 'utf8');

const EDGES = `
[Event "Repetition"]
[Date "2019.03.01"]
[White "Loop, A"]
[Black "Loop, B"]
[Result "1/2-1/2"]
[WhiteElo "2410"]
[BlackElo "2395"]

1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 5. e4 e5 1/2-1/2

[Event "Promotion"]
[Date "2021.06.12"]
[White "Queen, Q"]
[Black "Rook, R"]
[Result "1-0"]
[WhiteElo "2620"]
[BlackElo "2580"]

1. e4 d5 2. exd5 c6 3. dxc6 Nf6 4. cxb7 Nbd7 5. bxa8=Q Qc7 6. Qxa7 e5 1-0

[Event "Underpromotion"]
[Date "2021.06.13"]
[White "Knight, K"]
[Black "Rook, R"]
[Result "0-1"]
[WhiteElo "2300"]
[BlackElo "2580"]

1. e4 d5 2. exd5 c6 3. dxc6 Nf6 4. cxb7 Nbd7 5. bxa8=N Qc7 1-0

[Event "En passant"]
[Date "2016.??.??"]
[White "Passant, E"]
[Black "Passant, F"]
[Result "1/2-1/2"]

1. e4 Nf6 2. e5 d5 3. exd6 cxd6 4. d4 g6 1/2-1/2

[Event "Castling"]
[Date "????.??.??"]
[White "Castle, W"]
[Black "Castle, B"]
[Result "0-1"]
[BlackElo "2500"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O d6 5. d3 Bg4 6. Nc3 Qd7 7. Be3 O-O-O 0-1

[Event "Set up"]
[Date "2020.01.01"]
[White "Ending, A"]
[Black "Ending, B"]
[Result "1/2-1/2"]
[SetUp "1"]
[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]

1. e4 Kd7 2. e5 Ke6 1/2-1/2

[Event "Order one"]
[Date "2024.05.05"]
[White "Order, A"]
[Black "Order, B"]
[Result "1-0"]
[WhiteElo "2705"]
[BlackElo "2690"]

1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 1-0

[Event "Order two"]
[Date "2025.05.05"]
[White "Order, B"]
[Black "Order, A"]
[Result "0-1"]
[WhiteElo "2695"]
[BlackElo "2702"]

1. c4 e6 2. d4 Nf6 3. Nf3 d5 0-1
`;

const IMPORTED_AT = 1_790_000_000_000;
const prepare = (text) => kit.preparePgnBatch(text, null, true, IMPORTED_AT);

const bench = prepare(
  read('public/bench/bench-1k.pgn').split('\n\n[Event').slice(0, 300).join('\n\n[Event'),
);
const capablanca = prepare(read('public/data/annotated/capablanca-chess-fundamentals-1921.pgn'));
const edges = prepare(EDGES);
const ALL = [...bench.payloads, ...capablanca.payloads, ...edges.payloads];

/** The same answer, with ties in game count put in one order. */
const normal = (result) => ({
  ...result,
  moves: [...result.moves].sort((a, b) => b.games - a.games || (a.uci < b.uci ? -1 : 1)),
});

function distinctKeys(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  const keys = db
    .prepare('SELECT DISTINCT position_key AS key FROM positions ORDER BY key')
    .all()
    .map((row) => row.key);
  db.close();
  return keys;
}

const PLAYER = ALL[0].game.whiteKey;
const FILTERS = [
  {},
  { minRating: 2600 },
  { maxRating: 2650 },
  { sinceYear: 2015 },
  { untilYear: 2012 },
  { minRating: 2500, sinceYear: 2010, untilYear: 2022 },
  { player: PLAYER },
  { player: PLAYER, playerColor: 'w', minRating: 2600 },
];

/** Every question, every position; returns the first difference or null. */
function firstDifference(rows, postings, keys) {
  for (const key of keys) {
    for (const filters of FILTERS) {
      const expected = normal(rows.explore(key, 500, filters));
      const actual = normal(postings.explore(key, 500, filters));
      if (JSON.stringify(expected) !== JSON.stringify(actual)) {
        return { key, filters, expected, actual };
      }
    }
    const ids = (list) => list.map((game) => game.fingerprint).sort();
    const a = ids(rows.gamesAtPosition(key, 10_000));
    const b = ids(postings.gamesAtPosition(key, 10_000));
    if (JSON.stringify(a) !== JSON.stringify(b)) return { key, what: 'games', a, b };

    const byGame = (list) => [...list].sort((x, y) => Number(x.gameId) - Number(y.gameId));
    const c = byGame(rows.continuationsAt(key, { games: 1000, plies: 40 }));
    const d = byGame(postings.continuationsAt(key, { games: 1000, plies: 40 }));
    if (JSON.stringify(c) !== JSON.stringify(d)) return { key, what: 'continuations', c, d };

    const hits = (list) =>
      list
        .map(
          (row) =>
            `${row.game.fingerprint}|${row.position.ply}|${row.position.moveUci}|${row.position.moveSan}|${row.position.mover}`,
        )
        .sort();
    const query = { mode: 'exact-position', positionKey: key, limit: 100, sort: 'rating' };
    const e = rows.searchStructures(query);
    const f = postings.searchStructures(query);
    if (e.length < 100 && JSON.stringify(hits(e)) !== JSON.stringify(hits(f))) {
      return { key, what: 'exact-position', e: hits(e), f: hits(f) };
    }
  }
  return null;
}

describe('the posting layout', { timeout: 120_000 }, () => {
  let directory;
  let rowsFile;
  let rows;
  let postings;

  beforeAll(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'kingfisher-postings-'));
    rowsFile = path.join(directory, 'rows.sqlite');
    rows = new GameDatabase(rowsFile);
    postings = new GameDatabase(path.join(directory, 'postings.sqlite'), {
      layout: 'postings',
      kit,
    });
  });

  afterAll(() => {
    rows.close();
    postings.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('prepares every fixture game, edge cases included', () => {
    expect(bench.rejected).toBe(0);
    expect(capablanca.rejected).toBe(0);
    expect(edges.rejected).toBe(0);
    expect(edges.payloads).toHaveLength(8);
    expect(postings.layout).toBe('postings');
    expect(rows.layout).toBe('rows');
  });

  it('encodes every move and position it is given, and reads them back', () => {
    for (const uci of ['e2e4', 'e7e8q', 'b7a8n', 'a2a1r', 'h7h8b', 'e1g1', 'e8c8']) {
      expect(decodeMove(encodeMove(uci))).toBe(uci);
    }
    expect(() => encodeMove('e2e9')).toThrow();
    const entries = [
      { ply: 0, pos: positionHash('a'), move: encodeMove('e2e4') },
      { ply: 301, pos: positionHash('b'), move: encodeMove('b7a8n') },
    ];
    expect(unpackPlies(packPlies(entries))).toEqual(entries);
  });

  it('answers as the row layout does, before any position is hot', () => {
    const first = ALL.slice(0, 200);
    rows.insertGames(first);
    postings.insertGames(first);
    expect(postings.aggregateIntegrity().aggregateRows).toBe(0);
    expect(firstDifference(rows, postings, distinctKeys(rowsFile))).toBeNull();
  });

  it('answers the same once hot aggregates exist, and keeps them exact through an import', () => {
    postings.rebuildAggregates();
    const hot = postings.aggregateIntegrity();
    expect(hot.aggregateRows).toBeGreaterThan(0);
    expect(hot.positions).toBe(hot.aggregatedPositions);
    // Ordinary import on top: hot rows are maintained per posting.
    const rest = ALL.slice(200);
    rows.insertGames(rest);
    postings.insertGames(rest);
    const after = postings.aggregateIntegrity();
    expect(after.positions).toBe(after.aggregatedPositions);
    expect(firstDifference(rows, postings, distinctKeys(rowsFile))).toBeNull();
    // The start position is hot, with every game.
    const start = postings.explore('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -');
    expect(start.totalGames).toBeGreaterThanOrEqual(HOT_GAMES);
  });

  it('answers the same after deleting games, hot rows recounted', () => {
    const fingerprints = ALL.filter((_, index) => index % 9 === 0).map(
      (entry) => entry.game.fingerprint,
    );
    expect(rows.deleteGamesByFingerprint(fingerprints).deleted).toBe(fingerprints.length);
    expect(postings.deleteGamesByFingerprint(fingerprints).deleted).toBe(fingerprints.length);
    const after = postings.aggregateIntegrity();
    expect(after.positions).toBe(after.aggregatedPositions);
    expect(firstDifference(rows, postings, distinctKeys(rowsFile))).toBeNull();
  });

  it('re-derives exported positions and the classification pages from the stored PGN', () => {
    let after = null;
    for (;;) {
      const a = rows.exportPage(after, 50);
      const b = postings.exportPage(after, 50);
      expect(b.games.map((game) => game.summary.fingerprint)).toEqual(
        a.games.map((game) => game.summary.fingerprint),
      );
      a.games.forEach((game, index) => {
        expect(b.games[index].positions).toEqual(game.positions);
      });
      const lineA = rows.exportPage(after, 50, null, { positions: 'line' });
      const lineB = postings.exportPage(after, 50, null, { positions: 'line' });
      lineA.games.forEach((game, index) => {
        expect(lineB.games[index].positions).toEqual(game.positions);
      });
      if (!a.nextAfter) break;
      after = a.nextAfter;
    }
    expect(postings.unclassifiedGames('digest', 500)).toEqual(
      rows.unclassifiedGames('digest', 500),
    );
  });

  it('refuses the structure searches it cannot answer, in words', () => {
    expect(() => postings.searchStructures({ mode: 'pawn-skeleton', pawnSkeleton: 'x' })).toThrow(
      /does not store pawn structures/,
    );
    expect(postings.unindexedCount()).toBe(0);
    expect(postings.schemaStatus().layout).toBe('postings');
  });

  it('builds the same index in a bulk load', () => {
    const bulk = new GameDatabase(path.join(directory, 'bulk.sqlite'), { layout: 'postings', kit });
    bulk.beginBulk();
    bulk.insertGames(ALL.slice(0, 150));
    bulk.checkpoint();
    bulk.insertGames(ALL.slice(150));
    bulk.endBulk();
    bulk.deleteGamesByFingerprint(
      ALL.filter((_, index) => index % 9 === 0).map((entry) => entry.game.fingerprint),
    );
    const facts = bulk.aggregateIntegrity();
    expect(facts.aggregateRows).toBeGreaterThan(0);
    expect(facts.positions).toBe(facts.aggregatedPositions);
    expect(firstDifference(rows, bulk, distinctKeys(rowsFile))).toBeNull();
    bulk.close();
  });

  it('finishes an interrupted bulk load when the collection is next opened', () => {
    const file = path.join(directory, 'interrupted.sqlite');
    const reference = new GameDatabase(path.join(directory, 'interrupted-rows.sqlite'));
    const part = ALL.slice(0, 120);
    reference.insertGames(part);
    const bulk = new GameDatabase(file, { layout: 'postings', kit });
    bulk.beginBulk();
    bulk.insertGames(part);
    bulk.checkpoint(); // committed, staged, never merged
    bulk.close();
    const staged = new DatabaseSync(file, { readOnly: true });
    const stagedRows = staged
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'posting_stage_%'",
      )
      .all();
    expect(stagedRows.length).toBeGreaterThan(0);
    staged.close();
    const reopened = new GameDatabase(file, { kit });
    const keys = distinctKeys(path.join(directory, 'interrupted-rows.sqlite'));
    expect(firstDifference(reference, reopened, keys)).toBeNull();
    reopened.close();
    reference.close();
  });

  it('converts a row-layout collection in place, and then answers the same', () => {
    const copy = path.join(directory, 'converted.sqlite');
    rows.checkpoint();
    copyFileSync(rowsFile, copy);
    const converted = new GameDatabase(copy, { kit });
    expect(converted.layout).toBe('rows');
    const result = converted.convertToPostings({ chunk: 37 });
    expect(result.converted).toBe(rows.count());
    expect(converted.layout).toBe('postings');
    expect(firstDifference(rows, converted, distinctKeys(rowsFile))).toBeNull();
    converted.close();
    // Reopened, it is still the posting layout.
    const reopened = new GameDatabase(copy, { kit });
    expect(reopened.layout).toBe('postings');
    expect(
      reopened.explore('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -').totalGames,
    ).toBe(rows.explore('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -').totalGames);
    reopened.close();
  });

  it('keeps one row per position and move per game, whatever a client sends', () => {
    // /db/import is an HTTP boundary: the browser collapses repetitions, but a
    // client that does not must not be able to count one game twice.
    const source = edges.payloads[0];
    const doubled = {
      ...source,
      game: { ...source.game, fingerprint: `${source.game.fingerprint}-doubled` },
      positions: [...source.positions, ...source.positions],
    };
    rows.insertGames([doubled]);
    postings.insertGames([doubled]);
    expect(firstDifference(rows, postings, distinctKeys(rowsFile))).toBeNull();
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';
    const loop = postings
      .gamesAtPosition(start, 10_000)
      .filter((game) => game.fingerprint.endsWith('-doubled'));
    expect(loop).toHaveLength(1);
  });

  it('never switches a collection that already holds rows by opening it', () => {
    expect(() => new GameDatabase(rowsFile, { layout: 'postings', kit })).toThrow(
      /convert it rather than switching/,
    );
  });
});
