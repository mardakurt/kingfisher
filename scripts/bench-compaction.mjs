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

import { GameDatabase } from '../companion/src/database.mjs';
import { writeTextSchemaFixture } from '../companion/src/__fixtures__/text-schema.mjs';

import { benchmark, build, freeBytes, gb, mb, n } from './bench-real-scale.mjs';
import { closeApp } from './load-app.mjs';

function parseArgs(list) {
  const args = { games: 60_000, keep: false, out: null, warm: 40, floor: 4e9, chunk: 50_000 };
  for (let i = 0; i < list.length; i += 1) {
    const flag = list[i];
    if (flag === '--games') args.games = Number(list[++i]);
    else if (flag === '--out') args.out = list[++i];
    else if (flag === '--keep') args.keep = true;
    else if (flag === '--warm') args.warm = Number(list[++i]);
    else if (flag === '--chunk') args.chunk = Number(list[++i]);
  }
  return args;
}

const pct = (before, after) => `${(((before - after) / before) * 100).toFixed(1)}%`;

async function main() {
  const args = parseArgs(argv.slice(2));
  console.log('Kingfisher compaction benchmark');
  console.log(`node ${process.version} · ${process.platform}-${process.arch}\n`);

  const directory = args.out ?? mkdtempSync(path.join(tmpdir(), 'kingfisher-compaction-'));
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'compaction.sqlite');
  console.log(`database: ${file}`);

  // The "before" state: an empty collection carrying the text schema, exactly
  // as a collection created before this phase does.
  writeTextSchemaFixture(file, { games: 0, pliesPerGame: 0 });

  const database = new GameDatabase(file);
  const schema = database.schemaStatus();
  if (schema.version !== 1) {
    throw new Error(
      `fixture did not produce a text-schema database (got version ${schema.version})`,
    );
  }
  console.log(`schema before: version ${schema.version} (text)\n`);

  const stats = await build(database, args.games, file, args.floor);
  database.checkpoint();
  const sizeBefore = statSync(file).size;

  console.log('\n--- import ------------------------------------------------------');
  console.log(`games stored       ${n(stats.accepted)}`);
  console.log(`positions indexed  ${n(stats.positions)}`);
  console.log(`database on disk   ${gb(sizeBefore)}`);
  console.log(`bytes per game     ${n(Math.round(sizeBefore / Math.max(1, stats.accepted)))}`);

  console.log('\n--- queries, text schema ----------------------------------------');
  const before = benchmark(database, args.warm);

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
  let lowestFree = freeAtStart;
  const watch = setInterval(() => {
    const now = freeBytes(file);
    if (now < lowestFree) lowestFree = now;
  }, 250);

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
  clearInterval(watch);

  if (!result.migrated) {
    throw new Error(`migration did not run: ${result.reason}`);
  }

  const sizeAfter = statSync(file).size;
  const peakTemporary = Math.max(0, freeAtStart - lowestFree);

  console.log('\n--- queries, compact schema -------------------------------------');
  const after = benchmark(database, args.warm);
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
  console.log(`peak temporary     ${mb(peakTemporary)} (sampled every 250 ms)`);

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
