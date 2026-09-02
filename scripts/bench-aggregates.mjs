#!/usr/bin/env node
/**
 * Does the derived explorer aggregate stay fast when it is *large*?
 *
 * `bench:sqlite` answers the question Phase 6 asked, on the same fixture, so
 * its numbers are comparable — but that fixture is eight opening lines, which
 * means its aggregate table holds about ninety rows. A real hundred-thousand
 * game archive holds millions, and a lookup that is fast only because the
 * table is tiny would be a measurement that flatters itself.
 *
 * So this builds the opposite shape deliberately: many distinct positions, and
 * one hot position that every game reaches. It writes through the companion's
 * own `GameDatabase` — the real schema, the real triggers — rather than a
 * private table, and times the same two paths the explorer uses.
 *
 *   npm run bench:aggregates
 *   npm run bench:aggregates -- 100000
 *
 * The temporary database is deleted at the end.
 */

import { performance } from 'node:perf_hooks';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { argv, exit } from 'node:process';

import { GameDatabase } from '../companion/src/database.mjs';

const GAMES = Number(argv[2] ?? 100_000);
/** Plies per game: one shared hot position plus this many unique ones. */
const UNIQUE_PER_GAME = 9;
const HOT = 'hot-position-key';
const BATCH = 500;

const ms = (value) => `${value.toFixed(1)} ms`;

/** Mulberry32, so two runs of this script measure the same database. */
function random(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function measure(runs, work) {
  const samples = [];
  for (let index = 0; index < runs; index += 1) {
    const started = performance.now();
    work(index);
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  return { median: samples[Math.floor(samples.length / 2)], worst: samples[samples.length - 1] };
}

const directory = mkdtempSync(path.join(tmpdir(), 'kingfisher-aggregates-'));
const file = path.join(directory, 'aggregates.kingfisher.sqlite');
const database = new GameDatabase(file);
const next = random(20260902);
/** Twenty candidate moves at the hot position, so the aggregation has work. */
const HOT_MOVES = ['e2e4', 'd2d4', 'g1f3', 'c2c4', 'b2b3', 'g2g3', 'f2f4', 'b1c3'];

try {
  const started = performance.now();
  let batch = [];
  for (let index = 0; index < GAMES; index += 1) {
    const positions = [
      {
        positionKey: HOT,
        ply: 1,
        moveUci: HOT_MOVES[Math.floor(next() * HOT_MOVES.length)],
        moveSan: 'x',
        mover: 'w',
      },
    ];
    for (let ply = 0; ply < UNIQUE_PER_GAME; ply += 1) {
      positions.push({
        positionKey: `k${index}-${ply}`,
        ply: ply + 2,
        moveUci: 'a2a3',
        moveSan: 'a3',
        mover: ply % 2 === 0 ? 'b' : 'w',
      });
    }
    batch.push({
      game: {
        fingerprint: `synthetic-${index}`,
        white: 'Alpha, A',
        black: 'Beta, B',
        whiteKey: 'alpha, a',
        blackKey: 'beta, b',
        result: index % 3 === 0 ? '1-0' : index % 3 === 1 ? '0-1' : '1/2-1/2',
        date: `20${10 + (index % 16)}.01.01`,
        year: 2010 + (index % 16),
        event: 'Synthetic',
        site: 'Bench',
        round: '1',
        whiteRating: 2400 + (index % 300),
        blackRating: 2400 + (index % 300),
        eco: 'B90',
        opening: 'Synthetic',
        plyCount: positions.length,
        importedAt: Date.now(),
      },
      pgn: '1. a3 a6 1-0',
      positions,
    });
    if (batch.length >= BATCH) {
      database.insertGames(batch);
      batch = [];
    }
  }
  if (batch.length > 0) database.insertGames(batch);
  const importMs = performance.now() - started;

  const integrity = database.aggregateIntegrity();

  console.log('\nKingfisher explorer-aggregate scaling benchmark');
  console.log(`node ${process.version} · ${process.platform}-${process.arch}`);
  console.log(
    `${GAMES.toLocaleString()} games · ${integrity.positions.toLocaleString()} indexed positions · ` +
      `${integrity.aggregateRows.toLocaleString()} aggregate rows\n`,
  );
  console.log(`insert with aggregate maintenance   ${ms(importMs)}`);
  console.log(
    `aggregates ${integrity.positions === integrity.aggregatedPositions ? 'consistent' : 'INCONSISTENT'}\n`,
  );

  const viaAggregates = measure(20, () => database.explore(HOT, 24));
  const viaScan = measure(20, () => database.explore(HOT, 24, { sinceYear: 1 }));
  const cold = measure(20, (index) => database.explore(`k${index * 7}-3`, 24));

  console.log(`${'query'.padEnd(38)}   median     worst`);
  console.log(
    `${'hot position via aggregates'.padEnd(38)}   ${ms(viaAggregates.median).padStart(8)}  ${ms(viaAggregates.worst).padStart(9)}`,
  );
  console.log(
    `${'hot position via normalized scan'.padEnd(38)}   ${ms(viaScan.median).padStart(8)}  ${ms(viaScan.worst).padStart(9)}`,
  );
  console.log(
    `${'a rare position via aggregates'.padEnd(38)}   ${ms(cold.median).padStart(8)}  ${ms(cold.worst).padStart(9)}`,
  );
  console.log('');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  database.close();
  rmSync(directory, { recursive: true, force: true });
  exit(1);
}

database.close();
rmSync(directory, { recursive: true, force: true });
