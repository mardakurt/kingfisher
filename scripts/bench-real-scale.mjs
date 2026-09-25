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
 * 2020 onwards, CC BY-SA 4.0, with real players, real openings and real game lengths.
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

import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  statfsSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { argv, exit } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { Worker } from 'node:worker_threads';

import { GameDatabase } from '../companion/src/database.mjs';

import { closeApp, loadApp } from './load-app.mjs';
import { readGameTexts } from './reference/pgn-stream.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
/*
 * Phase 29: default the archive cache to the external user-cache
 * location. Honour the legacy KINGFISHER_ARCHIVE_CACHE env var for
 * back-compat, then `cache-paths.archiveCache` as the canonical
 * default. After `npm run data:cache:migrate` the contents of the
 * old `.archive-cache/` live at the external path.
 */
const { cachePaths } = await import('./cache-paths.mjs');
const CACHE = process.env.KINGFISHER_ARCHIVE_CACHE ?? cachePaths.archiveCache;

/** Games handed to `parsePgn` at once. Large enough to amortise, small enough
 *  that one batch's trees never approach the heap. */
const PARSE_BATCH = 500;
const PROGRESS_EVERY = 25_000;

function parseArgs(list) {
  const args = {
    games: Infinity,
    keep: false,
    out: null,
    queryOnly: null,
    warm: 40,
    floor: 4e9,
    archives: [],
    positions: true,
    workers: 1,
    bulk: false,
  };
  for (let i = 0; i < list.length; i += 1) {
    const flag = list[i];
    if (flag === '--games') args.games = Number(list[++i]);
    else if (flag === '--out') args.out = list[++i];
    else if (flag === '--keep') args.keep = true;
    else if (flag === '--query-only') args.queryOnly = list[++i];
    else if (flag === '--warm') args.warm = Number(list[++i]);
    else if (flag === '--floor-gb') args.floor = Number(list[++i]) * 1e9;
    // Phase 85: any archive (a Lichess standard month, CC0), and a search-only build.
    else if (flag === '--archive') args.archives.push(list[++i]);
    else if (flag === '--no-positions') args.positions = false;
    else if (flag === '--workers') args.workers = Number(list[++i]);
    else if (flag === '--bulk') args.bulk = true;
  }
  return args;
}

export const mb = (bytes) => `${(bytes / 1_000_000).toFixed(1)} MB`;
export const gb = (bytes) => `${(bytes / 1_000_000_000).toFixed(2)} GB`;
export const n = (value) => value.toLocaleString('en-GB');

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
export function freeBytes(file) {
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

export async function build(database, limit, databaseFile, floorBytes, options = {}) {
  const { parsePgn } = await loadApp(['/src/chess/pgn/index.ts']);
  const { normalizeGame, indexGame } = await loadApp(['/src/persistence/prepare-game.ts']);
  const { classifyTree } = await loadApp(['/src/theory/classify-games.ts']);
  const { loadOpeningIndex } = await loadApp(['/src/theory/openings.ts']);
  const { lineIndexForTree } = await loadApp(['/src/search/line-index-encode.ts']);
  const openings = await loadOpeningIndex();

  const files = options.archives?.length ? options.archives : archives();
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
    accepted: database.count(),
    previouslyStored: database.count(),
    rejected: 0,
    duplicates: 0,
    positions: 0,
    files: files.length,
    firstMonth: /\d{4}-\d{2}/.exec(path.basename(files[0]))?.[0] ?? '?',
    lastMonth: /\d{4}-\d{2}/.exec(path.basename(files[files.length - 1]))?.[0] ?? '?',
    peakRssBytes: 0,
  };

  const started = performance.now();
  let pending = [];

  const flush = () => {
    if (pending.length === 0) return;
    const batchCount = pending.length;
    const text = pending.join('\n\n');
    pending = [];
    let parsed;
    try {
      parsed = parsePgn(text);
    } catch {
      // One unparseable batch must not end a million-game import.
      stats.rejected += batchCount;
      return;
    }
    stats.rejected += Math.max(0, batchCount - parsed.games.length);
    const prepared = [];
    for (const game of parsed.games) {
      try {
        if (
          game.issues.some((issue) => issue.severity === 'error') ||
          (game.tree.headers.Variant && game.tree.headers.Variant !== 'Standard')
        ) {
          stats.rejected += 1;
          continue;
        }
        const base = normalizeGame(game.tree);
        if (database.haveFingerprints([base.fingerprint]).present.length > 0) {
          stats.duplicates += 1;
          continue;
        }
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
          // A search-only build keeps no explorer positions (--no-positions).
          positions: options.positions === false ? [] : positions,
          line: lineIndexForTree(record.tree),
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
      if (stats.accepted >= limit) break outer;
    }
  }
  flush();

  stats.elapsedMs = performance.now() - started;
  return stats;
}

/**
 * Phase 85: the same import with the preparation spread over worker threads
 * (`real-scale.worker.mjs`); this thread only writes. Each worker takes every
 * n-th game, so the archive's order is kept within a share, and a batch is
 * written only when the writer has room, so memory stays bounded.
 */
export async function buildParallel(database, limit, databaseFile, floorBytes, options) {
  const files = options.archives;
  const shares = options.workers;
  const stats = {
    read: 0,
    accepted: database.count(),
    previouslyStored: database.count(),
    rejected: 0,
    duplicates: 0,
    positions: 0,
    files: files.length,
    firstMonth: /\d{4}-\d{2}/.exec(path.basename(files[0]))?.[0] ?? '?',
    lastMonth: /\d{4}-\d{2}/.exec(path.basename(files[files.length - 1]))?.[0] ?? '?',
    peakRssBytes: 0,
    workers: shares,
  };
  const started = performance.now();
  let lastReport = 0;
  const workers = Array.from(
    { length: shares },
    (_, share) =>
      new Worker(new URL('./real-scale.worker.mjs', import.meta.url), {
        workerData: {
          files,
          share,
          shares,
          limit: Number.isFinite(limit) ? Math.ceil(limit / shares) : Infinity,
          positions: options.positions !== false,
        },
      }),
  );
  await new Promise((resolve, reject) => {
    let finished = 0;
    for (const worker of workers) {
      worker.on('error', reject);
      worker.on('message', (message) => {
        if (message.kind === 'done') {
          stats.read = Math.max(stats.read, message.read);
          finished += 1;
          if (finished === workers.length) resolve();
          return;
        }
        stats.rejected += message.rejected;
        if (message.prepared.length) {
          const result = database.insertGames(message.prepared);
          stats.accepted += result.imported;
          stats.duplicates += result.duplicates;
          for (const entry of message.prepared) stats.positions += entry.positions.length;
        }
        const rss = process.memoryUsage().rss;
        if (rss > stats.peakRssBytes) stats.peakRssBytes = rss;
        if (stats.accepted - lastReport >= 25_000) {
          lastReport = stats.accepted;
          database.checkpoint();
          const seconds = (performance.now() - started) / 1000;
          const free = freeBytes(databaseFile);
          console.log(
            `  ${n(stats.accepted).padStart(9)} stored  ${n(stats.positions).padStart(11)} positions  ` +
              `${Math.round(stats.accepted / seconds).toLocaleString()}/s  rss ${mb(rss)}  free ${gb(free)}`,
          );
          if (free < floorBytes) {
            stats.stoppedForDisk = true;
            console.log(`\n  Stopping: free space fell below ${gb(floorBytes)}.`);
            for (const other of workers) void other.terminate();
            resolve();
            return;
          }
        }
        if (stats.accepted >= limit) {
          for (const other of workers) void other.terminate();
          resolve();
          return;
        }
        worker.postMessage('ack');
      });
    }
  });
  stats.read = Math.max(stats.read, stats.accepted + stats.rejected + stats.duplicates);
  stats.elapsedMs = performance.now() - started;
  return stats;
}

/** The queries a professional actually runs, against whatever is in the file. */
export function benchmark(database, warm) {
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
  add('year filter', () => database.search({ fromYear: 2024, toYear: 2025, limit: 50 }));
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

/**
 * Phase 85: the move search over the companion's line index, at this scale —
 * material, theme and route, each cold and then warm — and, on a sample, the
 * same answer from the linear read the index replaces.
 */
export async function moveSearchBenchmark(database, warm = 3) {
  const { THEMES_VERSION_NUMBER } = await loadApp(['/src/search/line-index-encode.ts']);
  const questions = [
    ['material R v B', { material: { text: 'R v B' } }],
    ['theme opposite bishops', { theme: 'opposite-coloured-bishops' }],
    ['route N g1 f3 d4 f5', { route: { text: 'N g1 f3 d4 f5' } }],
    ['material + route', { material: { text: 'Q v Q' }, route: { text: 'N g1 f3' } }],
  ];
  const rows = [];
  for (const [label, text] of questions) {
    const deep = { themesVersion: THEMES_VERSION_NUMBER, ...text };
    const samples = [];
    let result = null;
    for (let run = 0; run <= warm; run += 1) {
      const started = performance.now();
      result = await database.moveSearch({}, deep, { limit: 100 });
      samples.push(performance.now() - started);
    }
    const [cold, ...rest] = samples;
    rest.sort((a, b) => a - b);
    const row = {
      label,
      cold,
      median: rest[Math.floor(rest.length / 2)] ?? cold,
      hits: result.total,
      scanned: result.scanned,
      unindexed: result.unindexed,
      slices: result.slices,
    };
    console.log(
      `${label.padEnd(30)} cold ${(cold / 1000).toFixed(2).padStart(7)} s  median ${(row.median / 1000).toFixed(2).padStart(7)} s  ` +
        `${n(row.hits)} hits of ${n(row.scanned)} scanned (${row.slices} slices, ${n(row.unindexed)} unindexed)`,
    );
    rows.push(row);
  }
  return rows;
}

/**
 * The linear read the index replaces, on the first `sample` games: every
 * game's PGN replayed by the rules code and asked with `scanGame`. The hits
 * must be the index's hits on the same games.
 */
export async function equivalenceSample(database, sample) {
  const { THEMES_VERSION_NUMBER } = await loadApp(['/src/search/line-index-encode.ts']);
  const { parsePgn } = await loadApp(['/src/chess/pgn/index.ts']);
  const { scanGame } = await loadApp(['/src/search/game-scan.ts']);
  const { parseMaterialQuery } = await loadApp(['/src/search/material-query.ts']);
  const { parseRoute } = await loadApp(['/src/search/route.ts']);
  const questions = [
    [{ material: { text: 'R v B' } }, { material: { query: parseMaterialQuery('R v B').query } }],
    [{ theme: 'opposite-coloured-bishops' }, { theme: 'opposite-coloured-bishops' }],
    [{ route: { text: 'N g1 f3 d4 f5' } }, { route: { route: parseRoute('N g1 f3 d4 f5').route } }],
  ];
  const out = [];
  for (const [text, deep] of questions) {
    const linear = new Map();
    const readIds = new Set();
    const started = performance.now();
    let after = null;
    let read = 0;
    do {
      const page = database.exportPage(after, 500, null, { positions: false });
      for (const game of page.games) {
        if (read >= sample) break;
        const tree = parsePgn(game.pgn).games[0]?.tree;
        read += 1;
        readIds.add(String(game.summary.id));
        const hit = tree ? scanGame(tree, deep) : null;
        if (hit) linear.set(String(game.summary.id), hit.ply);
      }
      after = page.nextAfter;
      if (read >= sample) break;
    } while (after);
    const linearMs = performance.now() - started;
    const indexed = await database.moveSearch(
      {},
      { themesVersion: THEMES_VERSION_NUMBER, ...text },
      { limit: 50_000 },
    );
    const fromIndex = new Map(
      indexed.hits
        .filter((hit) => readIds.has(String(hit.game.id)))
        .map((hit) => [String(hit.game.id), hit.ply]),
    );
    let same = fromIndex.size === linear.size;
    for (const [id, ply] of linear) if (fromIndex.get(id) !== ply) same = false;
    console.log(
      `equivalence ${JSON.stringify(text).padEnd(34)} ${n(read)} games: linear ${n(linear.size)} hits in ${(linearMs / 1000).toFixed(1)} s, index ${n(fromIndex.size)} hits — ${same ? 'identical' : 'DIFFERENT'}`,
    );
    out.push({ text, read, linearHits: linear.size, indexHits: fromIndex.size, linearMs, same });
  }
  return out;
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
    console.log('\n--- move search (line index) -------------------------------------');
    await moveSearchBenchmark(database);
    database.close();
    return;
  }

  const directory = args.out ?? mkdtempSync(path.join(tmpdir(), 'kingfisher-real-scale-'));
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'real.sqlite');
  console.log(`database: ${file}\n`);

  const database = new GameDatabase(file);
  if (args.bulk) database.beginBulk();
  const stats =
    args.workers > 1 && args.archives.length > 0
      ? await buildParallel(database, args.games, file, args.floor, {
          archives: args.archives,
          positions: args.positions,
          workers: args.workers,
        })
      : await build(database, args.games, file, args.floor, {
          archives: args.archives,
          positions: args.positions,
        });

  if (args.bulk) {
    const indexing = performance.now();
    database.endBulk();
    stats.indexMs = performance.now() - indexing;
    stats.elapsedMs += stats.indexMs;
    console.log(`\nindexes and aggregates built in ${(stats.indexMs / 60000).toFixed(1)} min`);
  }
  database.checkpoint();
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
  const queries = args.positions ? benchmark(database, args.warm) : [];
  console.log('\n--- move search (line index) -------------------------------------');
  const moveSearch = await moveSearchBenchmark(database);
  const equivalence = await equivalenceSample(database, 30_000);
  writeFileSync(
    path.join(directory, 'result.json'),
    JSON.stringify({ stats, size, queries, moveSearch, equivalence }, null, 2),
  );

  database.close();
  if (args.keep || args.out) console.log(`\nDatabase kept at ${file}`);
  else rmSync(directory, { recursive: true, force: true });
}

/*
  Only when run directly. `bench-compaction.mjs` imports `build` and
  `benchmark` from here so that the two benchmarks measure a database built by
  exactly the same code, rather than by two copies of it that can drift.
*/
if (import.meta.url === pathToFileURL(argv[1] ?? '').href) {
  main()
    .then(() => closeApp())
    .catch(async (error) => {
      console.error(error);
      await closeApp();
      exit(1);
    });
}
