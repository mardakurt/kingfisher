#!/usr/bin/env node
/**
 * What a collection's Opening Report costs, at a size you choose.
 *
 * The assessment that sent this here asks for two things item 1 did not
 * measure: that "common position queries meet a stated latency target on
 * recorded hardware", and — because the collection may be a million games —
 * what such a collection actually costs on disk. Both are arithmetic until
 * something is timed, and this is the timing.
 *
 * It measures the path the application uses. The games are prepared by the
 * application's own import kit, indexed by the application's own indexer, and
 * read back through `GameDatabase.positionHistory` and `.explore`, which are
 * the methods the companion serves. Nothing here is a private fast lane, and
 * the position keys are the ones the application stores — a benchmark that
 * computed its own would silently stop measuring this.
 *
 *   node scripts/bench-collection-report.mjs                 # 20,000 games
 *   node scripts/bench-collection-report.mjs 100000          # larger
 *   node scripts/bench-collection-report.mjs 100000 --keep   # keep the file
 *   node scripts/bench-collection-report.mjs 100000 --postings
 *
 * **The collection is written to a temporary directory outside the repository
 * and deleted at the end unless `--keep` is passed.** Nothing lands in the
 * working tree. A million games is several gigabytes, and that is a decision
 * for the person whose disk it is — this script is built so that decision can
 * be made from a measured bytes-per-game figure rather than a guess, and so
 * that a five-minute measurement at 20,000 games is enough to make it.
 *
 * A number from a smaller collection is a lower bound, not an estimate of a
 * million, and the output says so where it is printed.
 */

import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { arch, platform, version } from 'node:process';
import { cpus, release, totalmem } from 'node:os';
import { performance } from 'node:perf_hooks';

import { GameDatabase } from '../companion/src/database.mjs';
import { closeApp, loadApp } from './load-app.mjs';

const args = process.argv.slice(2);
const COUNT = Number(args.find((a) => /^\d+$/.test(a)) ?? 20_000);
const KEEP = args.includes('--keep');
const POSTINGS = args.includes('--postings');
/** The application's own import batch size, so the numbers transfer. */
const BATCH = 250;
/** Repeats per position. Twenty is what bench-sqlite uses for the same reason. */
const RUNS = 20;

/**
 * The starting position, which every game in a collection has passed through —
 * so it is both the commonest position there is and the one a player sees
 * before they have moved at all.
 */
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';

/**
 * The positions to time, discovered from the collection rather than written
 * down here.
 *
 * The first draft of this script named "after 1.e4" and "after 1.e4 e5" and
 * measured 0.0 ms against both, because the generated corpus opens 1.d4. A
 * benchmark that quietly probes an absent position reports the fastest number
 * in the run and calls it a result. So the commonest positions are read out of
 * the index, and a probe that reaches no games is an error rather than a fast
 * time.
 */
function commonestPositions(database, count) {
  const handle = database.handleForTest();
  return handle
    .prepare(
      'SELECT position_key, COUNT(*) AS occurrences FROM positions' +
        ' GROUP BY position_key ORDER BY occurrences DESC LIMIT ?',
    )
    .all(count)
    .map((row) => ['a common position', row.position_key]);
}

/**
 * A report is read while a person steps through an opening move by move, so
 * the number that matters is the one they wait for on a common position, not
 * the best case. The target is a judgement, stated so it can be disagreed
 * with: 150 ms at the 95th percentile is under the threshold where stepping
 * through a line feels like waiting for the application.
 */
const TARGET_P95_MS = 150;

const ms = (value) => `${value.toFixed(1)} ms`;
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function percentile(sorted, fraction) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[index];
}

async function measure(work) {
  const samples = [];
  for (let run = 0; run < RUNS; run += 1) {
    const started = performance.now();
    await work(run);
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  return {
    median: percentile(samples, 0.5),
    p95: percentile(samples, 0.95),
    worst: samples[samples.length - 1],
  };
}

async function main() {
  const directory = mkdtempSync(path.join(tmpdir(), 'kingfisher-report-bench-'));
  const file = path.join(directory, 'games.sqlite');
  const kit = await loadApp(['/src/companion-kit/import-kit.ts']);
  const { generateGames } = await import('./generate-pgn.mjs');

  console.log(`\nKingfisher collection Opening Report benchmark — ${COUNT.toLocaleString()} games`);
  console.log(`node ${version} · ${platform}-${arch}`);
  console.log(
    `${cpus()[0]?.model ?? 'unknown cpu'} · ${(totalmem() / 1024 ** 3).toFixed(0)} GB RAM`,
  );
  console.log(`${platform} ${release()} · layout ${POSTINGS ? 'postings' : 'rows'}`);
  console.log(`collection: ${file}\n`);

  const database = new GameDatabase(file, POSTINGS ? { layout: 'postings' } : {});
  database.useKit(kit);
  database.beginBulk();

  const pgn = generateGames(COUNT);
  const pgnBytes = Buffer.byteLength(pgn, 'utf8');
  const parseStarted = performance.now();
  const prepared = kit.preparePgnBatch(pgn, null, true, Date.UTC(2026, 0, 1));
  const parseMs = performance.now() - parseStarted;

  let imported = 0;
  for (let at = 0; at < prepared.payloads.length; at += BATCH) {
    imported += database.insertGames(prepared.payloads.slice(at, at + BATCH)).imported;
  }
  database.endBulk();
  const importMs = performance.now() - parseStarted;

  const onDisk = statSync(file).size;
  const positions = database.count();
  void positions;

  console.log(
    `parsed and indexed ${imported.toLocaleString()} games in ${(importMs / 1000).toFixed(1)} s`,
  );
  console.log(`  of which preparing took ${(parseMs / 1000).toFixed(1)} s`);
  console.log(`  ${prepared.rejected.toLocaleString()} rejected by the parser\n`);

  console.log('storage');
  console.log(`  collection on disk        ${mb(onDisk)}`);
  console.log(
    `  per game                  ${(onDisk / Math.max(1, imported) / 1024).toFixed(1)} kB`,
  );
  console.log(
    `  PGN that produced it      ${mb(pgnBytes)} (${(pgnBytes / Math.max(1, imported) / 1024).toFixed(1)} kB per game)`,
  );
  const MILLION = 1_000_000;
  console.log(
    `  arithmetic for a million  ${mb((onDisk / Math.max(1, imported)) * MILLION)} — a projection, not a measurement`,
  );
  console.log('');

  const probes = [
    ['the starting position', START],
    ...commonestPositions(database, 5)
      .filter(([, key]) => key !== START)
      .slice(0, 3),
  ];

  console.log(`the Opening Report's own read — target p95 < ${TARGET_P95_MS} ms`);
  let worstP95 = 0;
  for (const [label, key] of probes) {
    const history = database.positionHistory(key);
    if (history.sampledGames === 0) {
      throw new Error(`${label} reaches no game in this collection; the probe is wrong`);
    }
    const timing = await measure(() => database.positionHistory(key));
    worstP95 = Math.max(worstP95, timing.p95);
    console.log(
      `  ${label.padEnd(24)} ${ms(timing.median).padStart(9)} median  ` +
        `${ms(timing.p95).padStart(9)} p95  ${ms(timing.worst).padStart(9)} worst  ` +
        `(${history.sampledGames.toLocaleString()} games${history.hasMore ? ' sampled, more present' : ''})`,
    );
  }
  console.log('');

  console.log("the explorer's read at the same positions");
  let worstExplore = 0;
  for (const [label, key] of probes) {
    const timing = await measure(() => database.explore(key, 24, {}));
    worstExplore = Math.max(worstExplore, timing.p95);
    console.log(
      `  ${label.padEnd(24)} ${ms(timing.median).padStart(9)} median  ` +
        `${ms(timing.p95).padStart(9)} p95  ${ms(timing.worst).padStart(9)} worst`,
    );
  }
  console.log('');

  const verdict = worstP95 <= TARGET_P95_MS ? 'meets' : 'MISSES';
  console.log(
    `verdict: the report's worst p95 ${ms(worstP95)} ${verdict} the ${TARGET_P95_MS} ms target`,
  );
  console.log(`         the explorer's worst p95 ${ms(worstExplore)}`);
  if (imported < MILLION) {
    console.log('');
    console.log(
      `Read these as a lower bound. ${imported.toLocaleString()} games is not the million the\n` +
        'assessment asks for, and the projection above is division, not evidence. The honest\n' +
        'next step is to run this against a collection the maintainer already owns.',
    );
  }

  database.close();
  if (KEEP) console.log(`\nkept: ${file}`);
  else {
    rmSync(directory, { recursive: true, force: true });
    console.log(`\nremoved ${file}`);
  }
}

main()
  .then(closeApp)
  .catch(async (error) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    await closeApp();
    process.exitCode = 1;
  });
