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

import { GameDatabase } from '../companion/src/database.mjs';
import { runImport } from '../companion/src/import-jobs.mjs';

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
};
for (let i = 2; i < argv.length; i += 1) {
  if (argv[i] === '--file') args.file = argv[++i];
  else if (argv[i] === '--out') args.out = argv[++i];
  else if (argv[i] === '--workers') args.workers = Number(argv[++i]);
  else if (argv[i] === '--query-only') args.queryOnly = argv[++i];
  else if (argv[i] === '--sample') args.sample = Number(argv[++i]);
  // Search-only: headers and the line index, no per-position rows (the 10M run's disk budget).
  else if (argv[i] === '--no-positions') args.positions = false;
}

let database;
let file;
let stats = null;
if (args.queryOnly) {
  file = args.queryOnly;
  database = new GameDatabase(file);
} else {
  mkdirSync(args.out, { recursive: true });
  file = path.join(args.out, 'collection.sqlite');
  database = new GameDatabase(file);
  console.log(`importing ${args.file} → ${file}`);
  let last = 0;
  stats = await runImport(
    database,
    {
      file: args.file,
      ...(args.workers ? { workers: args.workers } : {}),
      keepPositions: args.positions,
      licence: 'Lichess database, CC0',
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
const size = statSync(file).size;
console.log(
  `database on disk   ${gb(size)} · ${n(database.count())} games · ${Math.round(size / database.count())} bytes a game`,
);
console.log('\n--- queries (ms) ----------------------------------------------');
const queries = benchmark(database, 5);
console.log('\n--- move search (line index) -----------------------------------');
const moveSearch = await moveSearchBenchmark(database, 2);
const equivalence = args.sample > 0 ? await equivalenceSample(database, args.sample) : [];
if (args.out) {
  writeFileSync(
    path.join(args.out, 'result.json'),
    JSON.stringify({ stats, size, queries, moveSearch, equivalence }, null, 2),
  );
}
database.close();
await closeApp();
