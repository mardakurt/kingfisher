#!/usr/bin/env node
/**
 * What the compact position index actually costs and saves.
 *
 * Phase 17 measured a prototype on a copy and did not ship it. This measures
 * the shipped migration, on a database built by the application's own import
 * path — `build` and `benchmark` are imported from `bench-real-scale.mjs`
 * rather than copied, so the "before" database here is the same database that
 * benchmark reports on.
 *
 * The sequence is the one a user would experience:
 *
 *   an empty collection on the text schema
 *     → import real games through parsePgn → indexGame → insertGames
 *     → measure size and run the research queries
 *     → compact, timing it and watching the disk
 *     → measure size and run the same queries again
 *
 * Building the "before" database needs a text-schema file, which the current
 * code no longer creates. It comes from the migration fixture — the same DDL
 * the migration tests migrate from, which is `positions` exactly as it stood
 * at commit 24a30ac.
 *
 *   node scripts/bench-compaction.mjs --games 60000
 *   node scripts/bench-compaction.mjs --games 120000 --out /tmp/kf-compact
 *
 * The database is large and both copies exist at once during the VACUUM.
 * `--out` chooses where it lands; by default it goes to a temporary directory
 * and is removed unless `--keep` is given.
 */

import { mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { argv, exit } from 'node:process';
import { Worker } from 'node:worker_threads';

import { GameDatabase } from '../companion/src/database.mjs';
import { writeTextSchemaFixture } from '../companion/src/__fixtures__/text-schema.mjs';

import { build, freeBytes, gb, mb, n } from './bench-real-scale.mjs';
import { closeApp } from './load-app.mjs';

function parseArgs(list) {
  const args = {
    games: 60_000,
    keep: false,
    out: null,
    warm: 40,
    floor: 4e9,
    chunk: 50_000,
    from: null,
  };
  for (let i = 0; i < list.length; i += 1) {
    const flag = list[i];
    if (flag === '--games') args.games = Number(list[++i]);
    else if (flag === '--out') args.out = list[++i];
    else if (flag === '--keep') args.keep = true;
    else if (flag === '--warm') args.warm = Number(list[++i]);
    else if (flag === '--chunk') args.chunk = Number(list[++i]);
    else if (flag === '--from') args.from = list[++i];
  }
  return args;
}

const pct = (before, after) => `${(((before - after) / before) * 100).toFixed(1)}%`;

const percentile = (sorted, q) =>
  sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];

/**
 * The research queries, and only those.
 *
 * `bench-real-scale.mjs` benchmarks the whole product, maintenance queries
 * included. Two of those — the aggregate integrity check and the duplicate
 * scan — count whole tables, which at ten million positions is minutes per
 * run and told this benchmark nothing: the compact schema does not touch
 * `position_aggregates` and cannot change what counting it costs.
 *
 * So this measures what Phase 18's brief actually asks about — the explorer,
 * filtered explorer, exact position, games at a position, pawn skeleton,
 * structure signature, claims and reading a FEN back — which is also the list
 * the compact schema could plausibly have made worse.
 */
function researchQueries(database, warm) {
  const rows = [];
  const startKey = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';
  const najdorf = 'rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq -';

  /*
    Discovered from the data rather than assumed. A skeleton or signature that
    is not in this collection measures an empty answer, which is fast and
    meaningless — the point is to time a query that finds something.
  */
  const sample = database.searchStructures({
    mode: 'exact-position',
    positionKey: najdorf,
    pawnSkeleton: '',
    structureSignature: '',
    claims: [],
    limit: 1,
  })[0]?.position;

  const measure = (label, run) => {
    let value;
    const coldStart = performance.now();
    try {
      value = run();
    } catch (error) {
      console.log(`${label.padEnd(26)} FAILED: ${error.message}`);
      return;
    }
    const cold = performance.now() - coldStart;
    const samples = [];
    for (let i = 0; i < warm; i += 1) {
      const started = performance.now();
      run();
      samples.push(performance.now() - started);
    }
    samples.sort((a, b) => a - b);
    const row = {
      label,
      cold,
      median: percentile(samples, 0.5),
      p95: percentile(samples, 0.95),
      rows: Array.isArray(value) ? value.length : (value?.moves?.length ?? null),
    };
    rows.push(row);
    console.log(
      `${label.padEnd(26)} cold ${row.cold.toFixed(2).padStart(8)}  ` +
        `median ${row.median.toFixed(3).padStart(8)}  ` +
        `p95 ${row.p95.toFixed(3).padStart(8)}  ` +
        `${row.rows === null ? '' : `(${n(row.rows)} rows)`}`,
    );
  };

  measure('explorer, start', () => database.explore(startKey, 24));
  measure('explorer, najdorf', () => database.explore(najdorf, 24));
  measure('explorer, filtered', () => database.explore(najdorf, 24, { minRating: 2500 }));
  measure('games at position', () => database.gamesAtPosition(najdorf, 12));
  measure('exact position search', () =>
    database.searchStructures({
      mode: 'exact-position',
      positionKey: najdorf,
      pawnSkeleton: '',
      structureSignature: '',
      claims: [],
    }),
  );
  if (sample?.pawnSkeleton) {
    measure('pawn skeleton search', () =>
      database.searchStructures({
        mode: 'pawn-skeleton',
        pawnSkeleton: sample.pawnSkeleton,
        positionKey: najdorf,
        structureSignature: '',
        claims: [],
      }),
    );
  }
  if (sample?.structureSignature) {
    measure('structure signature', () =>
      database.searchStructures({
        mode: 'signature',
        structureSignature: sample.structureSignature,
        positionKey: '',
        pawnSkeleton: '',
        claims: [],
      }),
    );
  }
  if (sample?.structureClaims?.length) {
    measure('claim search', () =>
      database.searchStructures({
        claims: [sample.structureClaims[0]],
        positionKey: '',
        pawnSkeleton: '',
        structureSignature: '',
      }),
    );
  }
  // Reading a whole position back is the one path the compact schema makes
  // more work, because the FEN has to be rebuilt from the key and two integers.
  measure('read positions of a game', () => database.exportPage(null, 20, null).games);
  measure('player prefix', () => database.players('car', 20));
  return rows;
}

async function main() {
  const args = parseArgs(argv.slice(2));
  console.log('Kingfisher compaction benchmark');
  console.log(`node ${process.version} · ${process.platform}-${process.arch}\n`);

  /*
    `--from` measures a text-schema collection that already exists.

    The import is by far the longest part of this benchmark — 143,000 real
    games took forty-five minutes — and the interesting half is what happens
    after it. Separating them means a query set can be re-timed, or a warm
    count reconsidered, without paying for the import again.
  */
  const directory = args.from
    ? path.dirname(args.from)
    : (args.out ?? mkdtempSync(path.join(tmpdir(), 'kingfisher-compaction-')));
  mkdirSync(directory, { recursive: true });
  const file = args.from ?? path.join(directory, 'compaction.sqlite');
  console.log(`database: ${file}`);

  if (!args.from) {
    // The "before" state: an empty collection carrying the text schema, exactly
    // as a collection created before this phase does.
    writeTextSchemaFixture(file, { games: 0, pliesPerGame: 0 });
  }

  const database = new GameDatabase(file);
  const schema = database.schemaStatus();
  if (schema.version !== 1) {
    throw new Error(
      `fixture did not produce a text-schema database (got version ${schema.version})`,
    );
  }
  console.log(`schema before: version ${schema.version} (text)\n`);

  const stats = args.from
    ? { accepted: database.count(), positions: null }
    : await build(database, args.games, file, args.floor);
  database.checkpoint();
  const sizeBefore = statSync(file).size;

  console.log('\n--- import ------------------------------------------------------');
  console.log(`games stored       ${n(stats.accepted)}`);
  if (stats.positions !== null) console.log(`positions indexed  ${n(stats.positions)}`);
  console.log(`database on disk   ${gb(sizeBefore)}`);
  console.log(`bytes per game     ${n(Math.round(sizeBefore / Math.max(1, stats.accepted)))}`);

  console.log('\n--- queries, text schema ----------------------------------------');
  const before = researchQueries(database, args.warm);

  const preflight = database.compactionPreflight();
  console.log('\n--- preflight ---------------------------------------------------');
  console.log(`positions          ${n(preflight.positions)}`);
  console.log(`current            ${gb(preflight.currentBytes)}`);
  console.log(`estimated final    ${gb(preflight.estimatedFinalBytes)}`);
  console.log(`temporary needed   ${gb(preflight.temporaryBytesRequired)}`);
  console.log(`free disk          ${gb(preflight.freeBytes)}`);
  console.log(`sufficient         ${preflight.sufficient}`);
  console.log(`estimated duration ${preflight.estimatedSeconds}s`);

  /*
    Peak temporary disk is sampled rather than computed: the VACUUM's second
    copy is a file SQLite creates and removes on its own, so the honest way to
    report the peak is to watch free space fall and say how far.
  */
  const freeAtStart = freeBytes(file);
  // SQLite is synchronous. A timer on this thread never samples during the
  // migration, and previously reported a fictitious zero-byte peak.
  const samples = new BigInt64Array(new SharedArrayBuffer(16));
  Atomics.store(samples, 0, BigInt(freeAtStart));
  const watch = new Worker(
    `
    const { workerData, parentPort } = require('node:worker_threads');
    const { statfsSync } = require('node:fs');
    const samples = new BigInt64Array(workerData.samples);
    setInterval(() => {
      const fs = statfsSync(workerData.file, { bigint: true });
      const free = fs.bavail * fs.bsize;
      if (free < Atomics.load(samples, 0)) Atomics.store(samples, 0, free);
      Atomics.add(samples, 1, 1n);
    }, 100);
    parentPort.postMessage('ready');
  `,
    { eval: true, workerData: { file, samples: samples.buffer } },
  );
  await new Promise((resolve, reject) => {
    watch.once('message', resolve);
    watch.once('error', reject);
  });

  console.log('\n--- migrating ---------------------------------------------------');
  const started = performance.now();
  let lastReport = 0;
  const result = database.compactPositions({
    chunkSize: args.chunk,
    onProgress: ({ encoded, total, phase }) => {
      const now = performance.now();
      if (phase === 'reclaiming') {
        console.log(`  verifying and reclaiming …`);
        return;
      }
      if (now - lastReport < 2000) return;
      lastReport = now;
      const share = total ? ((encoded / total) * 100).toFixed(1) : '0.0';
      console.log(`  encoded ${n(encoded)} / ${n(total)}  (${share}%)`);
    },
  });
  const migrationMs = performance.now() - started;
  await watch.terminate();

  if (!result.migrated) {
    throw new Error(`migration did not run: ${result.reason}`);
  }

  const sizeAfter = statSync(file).size;
  const peakTemporary = Math.max(0, freeAtStart - Number(Atomics.load(samples, 0)));

  console.log('\n--- queries, compact schema -------------------------------------');
  const after = researchQueries(database, args.warm);
  const schemaAfter = database.schemaStatus();
  database.close();

  console.log('\n--- storage -----------------------------------------------------');
  console.log(`games              ${n(stats.accepted)}`);
  console.log(`positions          ${n(result.positions)}`);
  console.log(`schema after       version ${schemaAfter.version} (compact)`);
  console.log(`size before        ${gb(sizeBefore)}`);
  console.log(`size after         ${gb(sizeAfter)}`);
  console.log(`saved              ${gb(sizeBefore - sizeAfter)}  (${pct(sizeBefore, sizeAfter)})`);
  console.log(
    `bytes per game     ${n(Math.round(sizeBefore / stats.accepted))} → ${n(
      Math.round(sizeAfter / stats.accepted),
    )}`,
  );
  console.log(
    `a million games    ${gb((sizeBefore / stats.accepted) * 1e6)} → ${gb(
      (sizeAfter / stats.accepted) * 1e6,
    )}`,
  );
  console.log(`migration time     ${(migrationMs / 1000).toFixed(1)}s`);
  console.log(
    `peak disk decrease ${mb(peakTemporary)} (${Atomics.load(samples, 1)} independent samples at 100 ms; includes other disk activity)`,
  );

  console.log('\n--- query comparison --------------------------------------------');
  const byLabel = new Map(after.map((row) => [row.label, row]));
  console.log('all times in milliseconds; median of the warm runs\n');
  console.log('query                       before     after   change');
  for (const row of before) {
    const other = byLabel.get(row.label);
    if (!other) continue;
    const b = row.median;
    const a = other.median;
    if (typeof b !== 'number' || typeof a !== 'number') continue;
    const change = b === 0 ? '—' : `${(((a - b) / b) * 100).toFixed(1)}%`;
    console.log(
      `${row.label.padEnd(26)} ${b.toFixed(3).padStart(8)}  ${a.toFixed(3).padStart(8)}  ${change.padStart(7)}`,
    );
  }

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
