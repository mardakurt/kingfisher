#!/usr/bin/env node
/**
 * A large file imported the way the product imports it (Phase 85): the
 * companion's own `runImport` — the bundled import kit on worker threads, the
 * collection bulk-loaded — then the queries a professional runs, the move
 * search over the line index, and on a sample the same answers from the
 * linear read the index replaces. The numbers in the Phase 85 handover come
 * from this script.
 *
 *   node scripts/bench-import-file.mjs --file <pgn|pgn.zst|cbh> --out <dir> [--workers 8]
 *   node scripts/bench-import-file.mjs --query-only <collection.sqlite>
 */

import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { argv } from 'node:process';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

import { GameDatabase } from '../companion/src/database.mjs';
import { loadKit, runImport } from '../companion/src/import-jobs.mjs';
import { decodeMove, positionHash, unpackPlies } from '../companion/src/postings.mjs';

import {
  benchmark,
  equivalenceSample,
  gb,
  mb,
  moveSearchBenchmark,
  n,
} from './bench-real-scale.mjs';
import { closeApp } from './load-app.mjs';

const args = {
  file: null,
  out: null,
  workers: undefined,
  queryOnly: null,
  sample: 30_000,
  positions: true,
  layout: 'rows',
  oracle: 50,
  maxBytes: 10 * 1024 ** 3,
  minimumGames: 0,
  independentOracle: false,
  licence: null,
};
for (let i = 2; i < argv.length; i += 1) {
  if (argv[i] === '--licence') args.licence = argv[++i];
  else if (argv[i] === '--max-gib') args.maxBytes = Number(argv[++i]) * 1024 ** 3;
  else if (argv[i] === '--sha256') args.sha256 = argv[++i];
  else if (argv[i] === '--min-games') args.minimumGames = Number(argv[++i]);
  else if (argv[i] === '--independent-oracle') args.independentOracle = true;
  else if (argv[i] === '--file') args.file = argv[++i];
  else if (argv[i] === '--out') args.out = argv[++i];
  else if (argv[i] === '--workers') args.workers = Number(argv[++i]);
  else if (argv[i] === '--query-only') args.queryOnly = argv[++i];
  else if (argv[i] === '--sample') args.sample = Number(argv[++i]);
  // Search-only: headers and the line index, no per-position rows (the 10M run's disk budget).
  else if (argv[i] === '--no-positions') args.positions = false;
  // A busy player's key, for the header and preparation queries.
  else if (argv[i] === '--player') args.player = argv[++i];
  // Phase 86: the compact posting layout, and how many positions the linear
  // oracle checks the explorer on.
  else if (argv[i] === '--layout') args.layout = argv[++i];
  else if (argv[i] === '--oracle') args.oracle = Number(argv[++i]);
  // Rebuild the hot aggregates before the queries, and say how long it took
  // (the step that ends every large import).
  else if (argv[i] === '--rebuild-hot') args.rebuildHot = true;
}

if (args.file) args.file = path.resolve(args.file);
if (!args.queryOnly && (!args.file || !args.out))
  throw new Error('Choose --file and --out, or --query-only.');
if (
  !Number.isSafeInteger(args.minimumGames) ||
  args.minimumGames < 0 ||
  !Number.isSafeInteger(args.maxBytes) ||
  args.maxBytes < 1024 ** 2
)
  throw new Error('Invalid corpus minimum or disk budget.');
if (
  args.independentOracle &&
  (!Number.isSafeInteger(args.oracle) ||
    args.oracle < 1 ||
    (!args.queryOnly && args.layout !== 'postings'))
)
  throw new Error(
    'Independent PGN replay requires the posting layout and at least one oracle position.',
  );
let database;
let file;
let stats = null;
const kit = await loadKit();
if (args.queryOnly) {
  file = args.queryOnly;
  const opened = performance.now();
  database = new GameDatabase(file, { kit });
  console.log(`opened in ${((performance.now() - opened) / 1000).toFixed(1)} s`);
  if (args.rebuildHot) {
    const started = performance.now();
    database.rebuildAggregates();
    args.rebuildHotSeconds = Math.round((performance.now() - started) / 1000);
    console.log(`hot aggregates rebuilt in ${args.rebuildHotSeconds} s`);
  }
} else {
  mkdirSync(args.out, { recursive: true });
  file = path.join(args.out, 'collection.sqlite');
  database = new GameDatabase(file, { layout: args.layout, kit });
  console.log(`layout: ${database.layout}`);
  console.log(`importing ${args.file} → ${file}`);
  let last = 0;
  stats = await runImport(
    database,
    {
      file: args.file,
      maxBytes: args.maxBytes,
      sha256: args.sha256,
      ...(args.workers ? { workers: args.workers } : {}),
      keepPositions: args.positions,
      licence: args.licence,
    },
    (state) => {
      if (state.phase === 'indexing' && last >= 0) {
        console.log(`  ${n(state.imported)} imported; building indexes and aggregates…`);
        last = -1;
      }
      if (state.imported - last >= 50_000 && last >= 0) {
        last = state.imported;
        const seconds = state.elapsedMs / 1000;
        console.log(
          `  ${n(state.imported).padStart(9)} imported  ${Math.round(state.imported / seconds)}/s  rss ${mb(state.peakRssBytes)}`,
        );
      }
    },
  );
  database.checkpoint();
  console.log('\n--- import (the product path) --------------------------------');
  console.log(`games read         ${n(stats.read)}`);
  console.log(`games imported     ${n(stats.imported)}`);
  console.log(`duplicates         ${n(stats.duplicates)}`);
  console.log(`rejected           ${n(stats.rejected)}`);
  console.log(`workers            ${stats.workers}`);
  console.log(
    `wall time          ${(stats.elapsedMs / 60000).toFixed(1)} min (of which indexes ${(stats.indexMs / 60000).toFixed(1)} min)`,
  );
  console.log(
    `throughput         ${Math.round(stats.imported / (stats.elapsedMs / 1000))} games/s`,
  );
  console.log(`peak memory (rss)  ${mb(stats.peakRssBytes)}`);
}
if (
  args.independentOracle &&
  (database.layout !== 'postings' || !Number.isSafeInteger(args.oracle) || args.oracle < 1)
) {
  database.close();
  await closeApp();
  throw new Error(
    'Independent PGN replay requires the posting layout and at least one oracle position.',
  );
}
const size = statSync(file).size;
console.log(
  `database on disk   ${gb(size)} · ${n(database.count())} games · ${Math.round(size / database.count())} bytes a game`,
);
console.log('\n--- queries (ms) ----------------------------------------------');
const queries = benchmark(database, 5, args.player ? { player: args.player } : {});
console.log('\n--- move search (line index) -----------------------------------');
const moveSearch = await moveSearchBenchmark(database, 2);
const equivalence = args.sample > 0 ? await equivalenceSample(database, args.sample) : [];
const oracle = database.layout === 'postings' && args.oracle > 0 ? explorerOracle(database) : null;
if (args.out) {
  writeFileSync(
    path.join(args.out, 'result.json'),
    JSON.stringify(
      {
        environment: {
          platform: os.platform(),
          release: os.release(),
          cpu: os.cpus()[0]?.model,
          cores: os.availableParallelism(),
          ramBytes: os.totalmem(),
          node: process.version,
          commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
          dirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
        },
        requestedMinimumGames: args.minimumGames,
        stats,
        size,
        layout: database.layout,
        rebuildHotSeconds: args.rebuildHotSeconds ?? null,
        queries,
        moveSearch,
        equivalence,
        oracle,
      },
      null,
      2,
    ),
  );
}
const acceptanceFailed =
  database.count() < args.minimumGames ||
  oracle?.mismatches > 0 ||
  equivalence.some((row) => !row.same);
database.close();
await closeApp();
if (acceptanceFailed)
  throw new Error(
    'Real-scale acceptance failed: insufficient corpus or oracle mismatch; inspect result.json.',
  );

/**
 * The explorer at this size against a linear oracle (Phase 86).
 *
 * The row layout cannot be built beside a ten-million-game posting collection
 * — it is the 330 GB this layout exists to avoid — so the oracle is the
 * games' own ply records: every game's `game_plies` decoded in one pass,
 * counting, for each chosen position, the games that played each move from
 * it. That reads neither the posting tree nor the hot aggregates, which are
 * what the explorer answers from. Positions are the start, a few frequent
 * openings, and positions drawn from games spread across the collection, so
 * both the hot and the cold path are asked.
 */
function explorerOracle(db) {
  const handle = db.handleForTest();
  const keysOf = new Map();
  const want = new Set();
  const add = (key) => {
    const hash = positionHash(key);
    keysOf.set(hash, key);
    want.add(hash);
  };
  [
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -',
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -',
    'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -',
    'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq -',
  ].forEach(add);
  const total = handle.prepare('SELECT MAX(id) AS n FROM games').get().n;
  const pgnOf = handle.prepare('SELECT pgn FROM game_content WHERE game_id >= ? LIMIT 1');
  for (let index = 0; want.size < args.oracle && index < args.oracle * 4; index += 1) {
    const row = pgnOf.get(1 + Math.floor((((index * 7919) % 10_007) / 10_007) * total));
    const positions = kit.preparePgnBatch(row?.pgn ?? '', null, true).payloads[0]?.positions ?? [];
    if (positions.length < 12) continue;
    add(positions[6 + (index % Math.max(1, positions.length - 8))].positionKey);
  }
  const counts = new Map([...want].map((hash) => [hash, new Map()]));
  const started = performance.now();
  const plies = handle.prepare(
    args.independentOracle ? 'SELECT pgn FROM game_content' : 'SELECT plies FROM game_plies',
  );
  let games = 0;
  for (const row of plies.iterate()) {
    games += 1;
    let entries;
    if (args.independentOracle) {
      const prepared = kit.preparePgnBatch(row.pgn, null, true);
      if (prepared.rejected || prepared.payloads.length !== 1)
        throw new Error('Oracle could not replay a stored game.');
      entries = prepared.payloads[0].positions.map((position) => ({
        pos: positionHash(position.positionKey),
        move: position.moveUci,
      }));
    } else entries = unpackPlies(row.plies);
    for (const entry of entries) {
      const byMove = counts.get(entry.pos);
      if (byMove) byMove.set(entry.move, (byMove.get(entry.move) ?? 0) + 1);
    }
  }
  const oracleMs = performance.now() - started;
  const mismatches = [];
  let hot = 0;
  for (const [hash, byMove] of counts) {
    const key = keysOf.get(hash);
    const answer = db.explore(key, 500, {});
    const expected = [...byMove]
      .map(([move, n]) => `${args.independentOracle ? move : decodeMove(move)}:${n}`)
      .sort();
    const actual = answer.moves.map((m) => `${m.uci}:${m.games}`).sort();
    const sum = [...byMove.values()].reduce((a, b) => a + b, 0);
    if (sum >= 64) hot += 1;
    if (JSON.stringify(expected) !== JSON.stringify(actual) || answer.totalGames !== sum) {
      mismatches.push({ key, expected: expected.slice(0, 5), actual: actual.slice(0, 5) });
    }
  }
  const result = {
    independentPgnReplay: args.independentOracle,
    positions: counts.size,
    hotPositions: hot,
    gamesRead: games,
    oracleSeconds: Math.round(oracleMs / 1000),
    mismatches: mismatches.length,
    firstMismatches: mismatches.slice(0, 3),
  };
  console.log('\n--- explorer against a linear oracle ---------------------------');
  console.log(
    `${result.positions} positions (${hot} hot), ${n(games)} games read in ${result.oracleSeconds} s: ` +
      `${result.mismatches === 0 ? 'identical' : `${result.mismatches} MISMATCHES`}`,
  );
  return result;
}
