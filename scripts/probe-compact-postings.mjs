#!/usr/bin/env node
/**
 * Where a companion database's bytes go, and what a posting index would cost.
 *
 * Phase 85 imported 10,680,708 real games search-only because the position
 * rows at that size would need about 330 GB — the 1M run's 33.2 GB scaled.
 * That left the explorer and the position page unmeasured at 10M. This probe
 * answers two questions against a real database the product itself imported
 * (`bench-real-scale.mjs --keep`), without touching it:
 *
 * 1. **Where do the bytes go?** `dbstat` accounts for every table and every
 *    index, so the cost of the position side is measured rather than
 *    inferred.
 *
 * 2. **Does a compact posting index answer the same questions?** It builds,
 *    in a separate file, the representation proposed in
 *    `docs/design/compact-position-postings.md`:
 *
 *        postings(pos, game, ply, move)  PRIMARY KEY (pos, game, ply)  WITHOUT ROWID
 *        game_moves(game, moves BLOB)    two bytes a ply
 *
 *    `pos` is the first eight bytes of SHA-256 of the canonical position key;
 *    `move` packs from, to and promotion into fifteen bits. SAN and the mover
 *    are not stored: both follow from the position and the move, and are
 *    derived here through the rules code to prove it. Then, for a sample of
 *    positions weighted as the rows are (so the long tail of positions seen
 *    once is represented) plus the most frequent ones, it asks both
 *    representations the explorer's question — moves, games, results,
 *    average rating, last year, unfiltered and filtered — and the model-game
 *    question, and requires identical answers.
 *
 *   node scripts/probe-compact-postings.mjs --db <companion.sqlite> --out <dir>
 *        [--sample 3000] [--top 200] [--report <dir>]
 *
 * The source is opened read-only. The compact file is written beside `--out`
 * and removed unless `--keep` is given.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { argv, exit } from 'node:process';
import { DatabaseSync } from 'node:sqlite';

import { closeApp, loadApp } from './load-app.mjs';

function parseArgs(list) {
  const args = { db: null, out: null, sample: 3000, top: 200, keep: false, report: null };
  for (let index = 0; index < list.length; index += 1) {
    const flag = list[index];
    if (flag === '--db') args.db = list[++index];
    else if (flag === '--out') args.out = list[++index];
    else if (flag === '--sample') args.sample = Number(list[++index]);
    else if (flag === '--top') args.top = Number(list[++index]);
    else if (flag === '--report') args.report = list[++index];
    else if (flag === '--keep') args.keep = true;
    else throw new Error(`Unknown flag ${flag}`);
  }
  if (!args.db || !args.out) throw new Error('--db and --out are required');
  return args;
}

const FILES = 'abcdefgh';
const PROMOTIONS = ['', 'n', 'b', 'r', 'q'];

/** A square index 0..63, a1 = 0. */
const square = (text) => FILES.indexOf(text[0]) + (Number(text[1]) - 1) * 8;
const squareName = (index) => `${FILES[index % 8]}${Math.floor(index / 8) + 1}`;

/** from (6 bits) | to (6 bits) | promotion (3 bits). Fits in two bytes. */
export function encodeMove(uci) {
  const promotion = PROMOTIONS.indexOf(uci.slice(4) || '');
  if (uci.length < 4 || promotion < 0) throw new Error(`Not a UCI move: ${uci}`);
  return square(uci.slice(0, 2)) | (square(uci.slice(2, 4)) << 6) | (promotion << 12);
}

export function decodeMove(code) {
  return `${squareName(code & 63)}${squareName((code >> 6) & 63)}${PROMOTIONS[code >> 12]}`;
}

/** The first eight bytes of SHA-256 of the canonical key, as a signed 64-bit integer. */
export function positionHash(key) {
  return createHash('sha256').update(key).digest().readBigInt64BE(0);
}

/** Every object's bytes, by table or index name, from dbstat. */
function objectSizes(db) {
  const rows = db
    .prepare(
      `SELECT d.name AS name, SUM(d.pgsize) AS bytes, m.type AS type, m.tbl_name AS tableName
         FROM dbstat d LEFT JOIN sqlite_master m ON m.name = d.name
        GROUP BY d.name ORDER BY bytes DESC`,
    )
    .all();
  return rows.map((row) => ({
    name: row.name,
    type: row.type ?? 'internal',
    table: row.tableName ?? row.name,
    bytes: Number(row.bytes),
  }));
}

/**
 * The position side: every object that exists because of per-position rows.
 * Everything else (games, players, events, text search) is the game side and
 * is unchanged by the proposal.
 */
const POSITION_SIDE = new Set([
  'positions',
  'position_aggregates',
  'position_filter_cache',
  'position_filter_total_cache',
  'position_filter_cache_keys',
  'pawn_skeletons',
  'structure_signatures',
  'structure_claim_sets',
  'claims',
  'claim_set_members',
]);

const mb = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
}

const EXPLORE_SOURCE = (filter) => `
  SELECT p.move_uci AS uci, MIN(p.move_san) AS san, MIN(p.mover) AS mover, COUNT(*) AS games,
         SUM(CASE WHEN g.result = '1-0' THEN 1 ELSE 0 END) AS white,
         SUM(CASE WHEN g.result = '1/2-1/2' THEN 1 ELSE 0 END) AS draws,
         SUM(CASE WHEN g.result = '0-1' THEN 1 ELSE 0 END) AS black,
         AVG(g.max_rating) AS averageRating, MAX(g.year) AS lastPlayedYear
    FROM positions p JOIN games g ON g.id = p.game_id
   WHERE p.position_key = ? ${filter}
   GROUP BY p.move_uci ORDER BY games DESC, uci`;

const EXPLORE_COMPACT = (filter) => `
  SELECT p.move AS move, COUNT(*) AS games,
         SUM(CASE WHEN g.result = '1-0' THEN 1 ELSE 0 END) AS white,
         SUM(CASE WHEN g.result = '1/2-1/2' THEN 1 ELSE 0 END) AS draws,
         SUM(CASE WHEN g.result = '0-1' THEN 1 ELSE 0 END) AS black,
         AVG(g.max_rating) AS averageRating, MAX(g.year) AS lastPlayedYear
    FROM postings p JOIN src.games g ON g.id = p.game
   WHERE p.pos = ? ${filter}
   GROUP BY p.move`;

const GAMES_SOURCE = `SELECT DISTINCT p.game_id AS id FROM positions p WHERE p.position_key = ?`;
const GAMES_COMPACT = `SELECT DISTINCT game AS id FROM postings WHERE pos = ?`;

async function main() {
  const args = parseArgs(argv.slice(2));
  mkdirSync(args.out, { recursive: true });
  const compactFile = path.join(args.out, 'compact-postings.sqlite');
  rmSync(compactFile, { force: true });

  const { Position } = await loadApp(['/src/chess/position.ts']);

  const source = new DatabaseSync(args.db, { readOnly: true });
  const sourceBytes = statSync(args.db).size;
  const games = source.prepare('SELECT COUNT(*) AS n FROM games').get().n;
  const rows = source.prepare('SELECT COUNT(*) AS n FROM positions').get().n;
  console.log(`source: ${games.toLocaleString()} games, ${rows.toLocaleString()} position rows`);

  console.log('measuring the source with dbstat…');
  const sourceObjects = objectSizes(source);
  const positionSide = sourceObjects.filter((o) => POSITION_SIDE.has(o.table));
  const gameSide = sourceObjects.filter((o) => !POSITION_SIDE.has(o.table));
  const sum = (list) => list.reduce((total, o) => total + o.bytes, 0);

  // ── Build ──────────────────────────────────────────────────────────────
  const compact = new DatabaseSync(compactFile);
  compact.exec(`
    PRAGMA journal_mode = OFF;
    PRAGMA synchronous = OFF;
    CREATE TABLE postings (
      pos  INTEGER NOT NULL,
      game INTEGER NOT NULL,
      ply  INTEGER NOT NULL,
      move INTEGER NOT NULL,
      PRIMARY KEY (pos, game, ply)
    ) WITHOUT ROWID;
    CREATE TABLE game_moves (game INTEGER PRIMARY KEY, moves BLOB NOT NULL);
  `);
  const insert = compact.prepare('INSERT INTO postings (pos, game, ply, move) VALUES (?, ?, ?, ?)');
  const insertMoves = compact.prepare('INSERT INTO game_moves (game, moves) VALUES (?, ?)');

  const built = performance.now();
  const read = source.prepare(
    'SELECT game_id AS game, ply, position_key AS key, move_uci AS uci FROM positions ORDER BY game_id, ply',
  );
  let current = null;
  let codes = [];
  let written = 0;
  const flush = () => {
    if (current === null) return;
    const blob = Buffer.alloc(codes.length * 2);
    codes.forEach((code, index) => blob.writeUInt16BE(code, index * 2));
    insertMoves.run(current, blob);
  };
  compact.exec('BEGIN');
  for (const row of read.iterate()) {
    if (row.game !== current) {
      flush();
      current = row.game;
      codes = [];
    }
    const code = encodeMove(row.uci);
    codes.push(code);
    insert.run(positionHash(row.key), row.game, row.ply, code);
    written += 1;
    if (written % 1_000_000 === 0) {
      compact.exec('COMMIT; BEGIN');
      console.log(`  ${written.toLocaleString()} postings`);
    }
  }
  flush();
  compact.exec('COMMIT');
  const buildMs = performance.now() - built;

  // Rows inserted in hash order leave half-full pages; VACUUM rebuilds each
  // b-tree in key order, which is what a bulk build would write.
  console.log('vacuuming the compact file…');
  compact.exec('VACUUM');
  const compactObjects = objectSizes(compact);
  const compactBytes = statSync(compactFile).size;

  // ── Collisions ─────────────────────────────────────────────────────────
  // Two distinct keys sharing a hash would merge their rows. Equal distinct
  // counts mean no pair in this database does.
  compact.exec(`ATTACH DATABASE '${args.db.replaceAll("'", "''")}' AS src`);
  const distinctKeys = source
    .prepare('SELECT COUNT(DISTINCT position_key) AS n FROM positions')
    .get().n;
  const distinctHashes = compact.prepare('SELECT COUNT(DISTINCT pos) AS n FROM postings').get().n;
  const singletonPositions = compact
    .prepare(
      'SELECT COUNT(*) AS n FROM (SELECT pos FROM postings GROUP BY pos HAVING COUNT(*) = 1)',
    )
    .get().n;

  // ── Equivalence ────────────────────────────────────────────────────────
  // The sample: the most frequent positions, and positions drawn by row, so
  // the draw is weighted as the explorer's traffic through the tree is not —
  // it is weighted as the database is, and most of it is the tail.
  const top = source
    .prepare(
      `SELECT position_key AS key FROM positions GROUP BY position_key ORDER BY COUNT(*) DESC LIMIT ?`,
    )
    .all(args.top)
    .map((row) => row.key);
  const maxRowid = source.prepare('SELECT MAX(rowid) AS n FROM positions').get().n;
  const byRowid = source.prepare(
    'SELECT position_key AS key FROM positions WHERE rowid >= ? LIMIT 1',
  );
  let seed = 86;
  const random = () => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    return seed / 2_147_483_648;
  };
  const drawn = [];
  for (let index = 0; index < args.sample; index += 1) {
    const row = byRowid.get(1 + Math.floor(random() * maxRowid));
    if (row) drawn.push(row.key);
  }
  const sample = [...new Set([...top, ...drawn])];

  const filters = [
    { label: 'unfiltered', sql: '' },
    { label: 'rating >= 2200', sql: 'AND g.max_rating >= 2200' },
    { label: 'year >= 2025', sql: 'AND g.year >= 2025' },
  ];
  const mismatches = [];
  const timings = { source: [], compact: [] };
  let sanChecked = 0;
  for (const filter of filters) {
    const fromSource = source.prepare(EXPLORE_SOURCE(filter.sql));
    const fromCompact = compact.prepare(EXPLORE_COMPACT(filter.sql));
    for (const key of sample) {
      let started = performance.now();
      const expected = fromSource.all(key);
      timings.source.push(performance.now() - started);
      started = performance.now();
      const answer = fromCompact.all(positionHash(key));
      timings.compact.push(performance.now() - started);

      const position = Position.fromFen(`${key} 0 1`);
      if (!position.ok) {
        mismatches.push({ key, filter: filter.label, why: 'key does not parse' });
        continue;
      }
      const actual = answer
        .map((row) => {
          const uci = decodeMove(row.move);
          const played = position.value.playUci(uci);
          return {
            uci,
            san: played.ok ? played.value.san : null,
            mover: position.value.turn,
            games: row.games,
            white: row.white,
            draws: row.draws,
            black: row.black,
            averageRating: row.averageRating,
            lastPlayedYear: row.lastPlayedYear,
          };
        })
        .sort((a, b) => b.games - a.games || (a.uci < b.uci ? -1 : 1));
      const normalise = (list) =>
        JSON.stringify(
          list.map((row) => ({
            ...row,
            averageRating: row.averageRating === null ? null : Number(row.averageRating.toFixed(6)),
          })),
        );
      const expectedRows = expected.map((row) => ({ ...row }));
      sanChecked += actual.length;
      if (normalise(actual) !== normalise(expectedRows)) {
        mismatches.push({ key, filter: filter.label, expected: expectedRows, actual });
      }
    }
  }
  const gamesSource = source.prepare(GAMES_SOURCE);
  const gamesCompact = compact.prepare(GAMES_COMPACT);
  let gameSetsChecked = 0;
  for (const key of sample) {
    const a = gamesSource
      .all(key)
      .map((row) => row.id)
      .sort((x, y) => x - y);
    const b = gamesCompact
      .all(positionHash(key))
      .map((row) => row.id)
      .sort((x, y) => x - y);
    gameSetsChecked += 1;
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      mismatches.push({ key, filter: 'games at position', expected: a.length, actual: b.length });
    }
  }

  // A game's moves read back from its blob equal its rows.
  const blobs = compact
    .prepare('SELECT game, moves FROM game_moves ORDER BY random() LIMIT 500')
    .all();
  const rowsOf = source.prepare(
    'SELECT move_uci AS uci FROM positions WHERE game_id = ? ORDER BY ply',
  );
  let blobMismatches = 0;
  for (const { game, moves } of blobs) {
    const decoded = [];
    for (let offset = 0; offset < moves.length; offset += 2) {
      decoded.push(decodeMove(Buffer.from(moves).readUInt16BE(offset)));
    }
    const expected = rowsOf.all(game).map((row) => row.uci);
    if (JSON.stringify(decoded) !== JSON.stringify(expected)) blobMismatches += 1;
  }

  const perGame = (bytes) => bytes / games;
  const report = {
    probe: 'compact position postings',
    source: {
      file: path.basename(args.db),
      games,
      positionRows: rows,
      fileBytes: sourceBytes,
      positionSideBytes: sum(positionSide),
      gameSideBytes: sum(gameSide),
      objects: sourceObjects,
    },
    compact: {
      fileBytes: compactBytes,
      buildMs: Math.round(buildMs),
      objects: compactObjects,
    },
    perGame: {
      sourcePositionSide: Math.round(perGame(sum(positionSide))),
      compactPositionSide: Math.round(perGame(compactBytes)),
      gameSide: Math.round(perGame(sum(gameSide))),
      bytesPerPosting: Number(
        (compactObjects.find((o) => o.name === 'postings')?.bytes / rows).toFixed(2),
      ),
    },
    collisions: { distinctKeys, distinctHashes, collided: distinctKeys - distinctHashes },
    singletonPositions,
    equivalence: {
      positions: sample.length,
      top: top.length,
      filters: filters.map((f) => f.label),
      comparisons: sample.length * filters.length,
      movesWithDerivedSan: sanChecked,
      gameSetsChecked,
      blobsChecked: blobs.length,
      blobMismatches,
      mismatches: mismatches.length,
      firstMismatches: mismatches.slice(0, 5),
    },
    queryMs: {
      sourceMedian: Number(median(timings.source).toFixed(3)),
      compactMedian: Number(median(timings.compact).toFixed(3)),
      sourceP95: Number(
        [...timings.source]
          .sort((a, b) => a - b)
          [Math.floor(timings.source.length * 0.95)].toFixed(3),
      ),
      compactP95: Number(
        [...timings.compact]
          .sort((a, b) => a - b)
          [Math.floor(timings.compact.length * 0.95)].toFixed(3),
      ),
    },
  };

  /*
    Structure search (pawn skeletons, signatures, claim sets) is part of the
    position side the compact file does not carry. It is reported on its own
    so the saving is never quoted as if structure search came free: at large
    sizes those questions go to the line index's scan instead.
  */
  const STRUCTURE_TABLES = new Set([
    'pawn_skeletons',
    'structure_signatures',
    'structure_claim_sets',
    'claims',
    'claim_set_members',
  ]);
  const STRUCTURE_INDEXES = new Set([
    'positions_pawn_skeleton_id',
    'positions_structure_signature_id',
    'positions_structure_claims_id',
  ]);
  report.structureSearchBytes = sum(
    sourceObjects.filter((o) => STRUCTURE_TABLES.has(o.table) || STRUCTURE_INDEXES.has(o.name)),
  );

  // Per-game sizes are this corpus's: game length and PGN content move both
  // sides. A projection for another corpus must use that corpus's own game
  // side and plies per game; this one is labelled as what it is.
  const projection = (targetGames) => ({
    games: targetGames,
    sourceBytes: Math.round(perGame(sourceBytes) * targetGames),
    compactBytes: Math.round((perGame(sum(gameSide)) + perGame(compactBytes)) * targetGames),
  });
  report.projectionAtThisCorpusSizes = [projection(1_048_440), projection(10_680_708)];

  const lines = [
    `Compact position postings — ${games.toLocaleString()} real games, ${rows.toLocaleString()} rows`,
    ``,
    `Source file ${mb(sourceBytes)}: position side ${mb(sum(positionSide))} (${((100 * sum(positionSide)) / sourceBytes).toFixed(1)}%), game side ${mb(sum(gameSide))}`,
    ...positionSide
      .slice(0, 12)
      .map((o) => `  ${o.type.padEnd(8)} ${o.name.padEnd(44)} ${mb(o.bytes)}`),
    `Compact file ${mb(compactBytes)} (postings + game_moves), built in ${(buildMs / 1000).toFixed(1)} s`,
    ...compactObjects.map((o) => `  ${o.type.padEnd(8)} ${o.name.padEnd(44)} ${mb(o.bytes)}`),
    `Per game: position side ${report.perGame.sourcePositionSide} B → ${report.perGame.compactPositionSide} B; ${report.perGame.bytesPerPosting} B a posting`,
    `Collisions: ${distinctKeys.toLocaleString()} distinct keys, ${distinctHashes.toLocaleString()} distinct hashes`,
    `Positions seen once: ${singletonPositions.toLocaleString()}`,
    `Equivalence: ${sample.length} positions × ${filters.length} filters, ${sanChecked} moves with SAN derived, ${gameSetsChecked} game sets, ${blobs.length} move blobs — ${mismatches.length + blobMismatches} mismatches`,
    `Explorer query median ${report.queryMs.sourceMedian} ms → ${report.queryMs.compactMedian} ms (p95 ${report.queryMs.sourceP95} → ${report.queryMs.compactP95})`,
    `Structure search in the source (not in the compact file): ${mb(report.structureSearchBytes)}`,
    ...report.projectionAtThisCorpusSizes.map(
      (p) =>
        `At ${p.games.toLocaleString()} games of this corpus's sizes: ${mb(p.sourceBytes)} → ${mb(p.compactBytes)}`,
    ),
  ];
  console.log(`\n${lines.join('\n')}`);

  if (args.report) {
    mkdirSync(args.report, { recursive: true });
    writeFileSync(
      path.join(args.report, 'probe-result.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    writeFileSync(path.join(args.report, 'probe-summary.txt'), `${lines.join('\n')}\n`);
  }

  compact.close();
  source.close();
  if (!args.keep) rmSync(compactFile, { force: true });
  await closeApp();
  exit(mismatches.length + blobMismatches === 0 ? 0 : 1);
}

await main();
