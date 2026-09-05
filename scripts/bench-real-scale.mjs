#!/usr/bin/env node
/**
 * What Kingfisher costs against a real million-game collection.
 *
 * Every previous scale measurement in this repository generated its rows. That
 * answers "can SQLite hold a million records", which was never in doubt. It
 * does not answer the question a chess player is actually asking, because
 * generated games share an opening book, a name vocabulary and a length, and
 * all three are exactly what the position index, the player table and the
 * full-text index are sensitive to.
 *
 * So this reads the real thing: the Lichess broadcast archive already cached
 * for the reference-pack builds — 1.19 million real over-the-board games from
 * 2020 onwards, CC0, with real players, real openings and real game lengths.
 * No rating filter is applied. The Elite pack's thresholds exist to keep a
 * shipped artifact small; a scale test wants the opposite.
 *
 * The import runs through the application's own path and not around it:
 *
 *     PGN text → parsePgn → normalizeGame → classifyTree → indexGame
 *              → GameDatabase.insertGames
 *
 * which is the same sequence `/db/import` performs for a user's own PGN. The
 * only thing skipped is HTTP, which `bench:sqlite` measures separately.
 *
 *   node scripts/bench-real-scale.mjs                 # every cached archive
 *   node scripts/bench-real-scale.mjs --games 25000   # a sizing run
 *   node scripts/bench-real-scale.mjs --keep          # leave the database
 *   node scripts/bench-real-scale.mjs --query-only DB # re-run the queries
 *
 * The database is large. `--out` chooses where it lands; by default it goes to
 * a temporary directory and is removed unless `--keep` is given.
 */

import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, statfsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { argv, exit } from 'node:process';
import { fileURLToPath } from 'node:url';

import { GameDatabase } from '../companion/src/database.mjs';

import { closeApp, loadApp } from './load-app.mjs';
import { readGameTexts } from './reference/pgn-stream.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CACHE = process.env.KINGFISHER_ARCHIVE_CACHE ?? path.join(ROOT, '.archive-cache');

/** Games handed to `parsePgn` at once. Large enough to amortise, small enough
 *  that one batch's trees never approach the heap. */
const PARSE_BATCH = 500;
const PROGRESS_EVERY = 25_000;

function parseArgs(list) {
  const args = { games: Infinity, keep: false, out: null, queryOnly: null, warm: 40, floor: 4e9 };
  for (let i = 0; i < list.length; i += 1) {
    const flag = list[i];
    if (flag === '--games') args.games = Number(list[++i]);
    else if (flag === '--out') args.out = list[++i];
    else if (flag === '--keep') args.keep = true;
    else if (flag === '--query-only') args.queryOnly = list[++i];
    else if (flag === '--warm') args.warm = Number(list[++i]);
    else if (flag === '--floor-gb') args.floor = Number(list[++i]) * 1e9;
  }
  return args;
}

const mb = (bytes) => `${(bytes / 1_000_000).toFixed(1)} MB`;
const gb = (bytes) => `${(bytes / 1_000_000_000).toFixed(2)} GB`;
const n = (value) => value.toLocaleString('en-GB');

/** Nearest-rank percentile. Not `samples[floor(len * q)]`, which returns the
 *  maximum for small samples and was how Phase 15 came to report a cold run as
 *  a p95. See `bench-player-search.mjs`. */
const percentile = (sorted, q) =>
  sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];

/** Time one query cold, then `warm` times warm, reporting the split. */
function measure(label, run, warm) {
  let rows = null;
  const coldStart = performance.now();
  try {
    rows = run(0);
  } catch (error) {
    console.log(`${label.padEnd(30)} FAILED: ${error.message}`);
    return null;
  }
  const cold = performance.now() - coldStart;

  const samples = [];
  for (let i = 1; i <= warm; i += 1) {
    const started = performance.now();
    run(i);
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  const row = {
    label,
    cold,
    median: percentile(samples, 0.5),
    p95: percentile(samples, 0.95),
    worst: samples[samples.length - 1],
    rows: countOf(rows),
  };
  console.log(
    `${label.padEnd(30)} cold ${row.cold.toFixed(1).padStart(8)}  ` +
      `median ${row.median.toFixed(1).padStart(8)}  ` +
      `p95 ${row.p95.toFixed(1).padStart(8)}  ` +
      `worst ${row.worst.toFixed(1).padStart(8)}  ` +
      `${row.rows === null ? '' : `(${n(row.rows)} rows)`}`,
  );
  return row;
}

function countOf(value) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.length;
  if (typeof value === 'number') return value;
  if (typeof value === 'object') {
    for (const key of ['games', 'moves', 'rows', 'total', 'totalGames', 'results']) {
      const found = value[key];
      if (Array.isArray(found)) return found.length;
      if (typeof found === 'number') return found;
    }
  }
  return null;
}

/**
 * Free bytes on the filesystem holding `file`.
 *
 * A million real games is tens of gigabytes, and an import that fills the disk
 * it is running on takes the machine down with it. This run stops itself
 * instead, and says how far it got.
 */
function freeBytes(file) {
  try {
    const stat = statfsSync(path.dirname(file));
    return Number(stat.bsize) * Number(stat.bavail);
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/** The cached archives, oldest first, so a truncated run is a date range. */
function archives() {
  let entries;
  try {
    entries = readdirSync(CACHE);
  } catch {
    return [];
  }
  return entries
    .filter((file) => /^lichess_db_broadcast_\d{4}-\d{2}\.pgn\.zst$/.test(file))
    .sort()
    .map((file) => path.join(CACHE, file));
}

async function build(database, limit, databaseFile, floorBytes) {
  const { parsePgn } = await loadApp(['/src/chess/pgn/index.ts']);
  const { normalizeGame, indexGame } = await loadApp(['/src/persistence/prepare-game.ts']);
  const { classifyTree } = await loadApp(['/src/theory/classify-games.ts']);
  const { loadOpeningIndex } = await loadApp(['/src/theory/openings.ts']);
  const openings = await loadOpeningIndex();

  const files = archives();
  if (files.length === 0) {
    console.error(`No broadcast archives in ${CACHE}.`);
    console.error('Run `node scripts/build-reference-pack.mjs --pack starter` to populate it.');
    exit(1);
  }
  console.log(
    `${files.length} cached archives, ${path.basename(files[0])} … ${path.basename(files[files.length - 1])}\n`,
  );

  const stats = {
    read: 0,
    accepted: 0,
    rejected: 0,
    duplicates: 0,
    positions: 0,
    files: files.length,
    firstMonth: path.basename(files[0]).slice(21, 28),
    lastMonth: path.basename(files[files.length - 1]).slice(21, 28),
    peakRssBytes: 0,
  };

  const started = performance.now();
  let pending = [];

  const flush = () => {
    if (pending.length === 0) return;
    const text = pending.join('\n\n');
    pending = [];
    let parsed;
    try {
      parsed = parsePgn(text);
    } catch {
      // One unparseable batch must not end a million-game import.
      stats.rejected += PARSE_BATCH;
      return;
    }
    const prepared = [];
    for (const game of parsed.games) {
      try {
        const base = normalizeGame(game.tree);
        const record = { ...base, ...classifyTree(openings, base.tree) };
        const positions = indexGame(record);
        prepared.push({
          game: {
            fingerprint: record.fingerprint,
            white: record.white,
            black: record.black,
            whiteKey: record.whiteKey,
            blackKey: record.blackKey,
            result: record.result,
            date: record.date,
            year: record.year,
            event: record.event,
            site: record.site,
            round: record.round,
            whiteRating: record.whiteRating,
            blackRating: record.blackRating,
            eco: record.eco,
            opening: record.opening,
            classification: record.classification,
            classifiedWith: record.classifiedWith,
            plyCount: positions.length,
            importedAt: record.importedAt,
          },
          pgn: record.normalizedPgn,
          positions,
        });
        stats.positions += positions.length;
      } catch {
        stats.rejected += 1;
      }
    }
    if (prepared.length > 0) {
      const result = database.insertGames(prepared);
      stats.accepted += result.imported;
      stats.duplicates += result.duplicates;
    }
    const rss = process.memoryUsage().rss;
    if (rss > stats.peakRssBytes) stats.peakRssBytes = rss;
  };

  outer: for (const file of files) {
    for await (const text of readGameTexts(file)) {
      stats.read += 1;
      pending.push(text);
      if (pending.length >= PARSE_BATCH) {
        flush();
        if (stats.read % PROGRESS_EVERY < PARSE_BATCH) {
          const seconds = (performance.now() - started) / 1000;
          /*
            Fold the write-ahead log back into the database. Left alone across
            a four-hour import the WAL grows without bound, and the headroom
            check below would be measuring the wrong thing while the real
            consumer of the disk sat beside it.
          */
          database.checkpoint();
          const free = freeBytes(databaseFile);
          console.log(
            `  ${n(stats.read).padStart(9)} read  ${n(stats.accepted).padStart(9)} stored  ` +
              `${n(stats.positions).padStart(11)} positions  ` +
              `${Math.round(stats.read / seconds).toLocaleString()}/s  ` +
              `rss ${mb(process.memoryUsage().rss)}  free ${gb(free)}`,
          );
          if (free < floorBytes) {
            stats.stoppedForDisk = true;
            console.log(`\n  Stopping: free space fell below ${gb(floorBytes)}.`);
            break outer;
          }
        }
      }
      if (stats.read >= limit) break outer;
    }
  }
  flush();

  stats.elapsedMs = performance.now() - started;
  return stats;
}

/** The queries a professional actually runs, against whatever is in the file. */
function benchmark(database, warm) {
  const rows = [];
  const add = (label, run) => {
    const row = measure(label, run, warm);
    if (row) rows.push(row);
  };

  // A busy player and a real opening, discovered from the data rather than
  // assumed, so this measures a populated answer and not an empty one.
  const busiest = database.players('', 1)[0]?.nameKey ?? 'carlsen m';
  const prefix = busiest.slice(0, 3);
  console.log(`\nbusiest player key: "${busiest}"  ·  prefix "${prefix}"\n`);

  add('open + count', () => database.count());
  add('first page (100)', () => database.search({ limit: 100 }));
  add('deep page (offset 50k)', () => database.search({ limit: 100, offset: 50_000 }));
  add('player prefix', () => database.players(prefix, 20));
  add('player exact', () => database.search({ player: busiest, limit: 50 }));
  add('text common', () => database.search({ text: 'open', limit: 50 }));
  add('text rare', () => database.search({ text: 'reykjavik', limit: 50 }));
  add('text no match', () => database.search({ text: 'zzzznobody', limit: 50 }));
  add('eco filter', () => database.search({ eco: 'B90', limit: 50 }));
  add('year filter', () => database.search({ yearFrom: 2024, yearTo: 2025, limit: 50 }));
  add('rating filter', () => database.search({ minRating: 2600, limit: 50 }));

  const startKey = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';
  const najdorf = 'rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq -';
  add('explore start', () => database.explore(startKey, 24));
  add('explore najdorf', () => database.explore(najdorf, 24));
  add('explore filtered', () => database.explore(najdorf, 24, { minRating: 2500 }));
  add('games at position', () => database.gamesAtPosition(najdorf, 12));
  add('duplicate scan page', () => database.duplicateKeys(null, 5000));
  add('export page (200)', () => database.exportPage(null, 200, null));
  add('aggregate integrity', () => database.aggregateIntegrity());

  return rows;
}

async function main() {
  const args = parseArgs(argv.slice(2));

  console.log('Kingfisher real-scale benchmark');
  console.log(`node ${process.version} · ${process.platform}-${process.arch}`);

  if (args.queryOnly) {
    const database = new GameDatabase(args.queryOnly);
    console.log(`\nquerying ${args.queryOnly}`);
    console.log(`games on disk: ${n(database.count())}`);
    console.log(`file size:     ${gb(statSync(args.queryOnly).size)}\n`);
    benchmark(database, args.warm);
    database.close();
    return;
  }

  const directory = args.out ?? mkdtempSync(path.join(tmpdir(), 'kingfisher-real-scale-'));
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'real.sqlite');
  console.log(`database: ${file}\n`);

  const database = new GameDatabase(file);
  const stats = await build(database, args.games, file, args.floor);

  const size = statSync(file).size;
  const seconds = stats.elapsedMs / 1000;
  console.log('\n--- import ------------------------------------------------------');
  console.log(`archives           ${stats.files} (${stats.firstMonth} … ${stats.lastMonth})`);
  console.log(`games read         ${n(stats.read)}`);
  console.log(`games stored       ${n(stats.accepted)}`);
  console.log(`duplicates         ${n(stats.duplicates)}`);
  console.log(`rejected           ${n(stats.rejected)}`);
  console.log(`positions indexed  ${n(stats.positions)}`);
  console.log(`database on disk   ${gb(size)} (plus WAL)`);
  console.log(`bytes per game     ${Math.round(size / Math.max(1, stats.accepted))}`);
  console.log(`import wall time   ${(seconds / 60).toFixed(1)} min`);
  console.log(`throughput         ${Math.round(stats.read / seconds).toLocaleString()} games/s`);
  console.log(`peak rss           ${mb(stats.peakRssBytes)}`);

  console.log('\n--- queries -----------------------------------------------------');
  console.log('all times in milliseconds\n');
  benchmark(database, args.warm);

  database.close();
  if (args.keep || args.out) console.log(`\nDatabase kept at ${file}`);
  else rmSync(directory, { recursive: true, force: true });
}

main()
  .then(() => closeApp())
  .catch(async (error) => {
    console.error(error);
    await closeApp();
    exit(1);
  });
