#!/usr/bin/env node
/**
 * What player and metadata search cost, at scale, against the real schema.
 *
 * Phase 9 measured 67 ms for a player search, 95 ms for a prefix lookup and
 * 141 ms for a text search over 500,000 games, and §46 asks for these to be
 * improved measurement-first. This drives `GameDatabase` directly rather than
 * over HTTP, because the question is what the queries cost, not what the
 * network adds — and because generating half a million games through the
 * import path takes long enough to discourage running it at all.
 *
 *   node scripts/bench-player-search.mjs 500000
 *
 * It writes a temporary database, measures, and deletes it. `--keep` leaves it
 * behind for `EXPLAIN QUERY PLAN`.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { argv } from 'node:process';

import { GameDatabase } from '../companion/src/database.mjs';

const COUNT = Number(argv[2] ?? 500_000);
const KEEP = argv.includes('--keep');

/*
  Names drawn from a fixed vocabulary with a long tail, because the shape of
  the distribution is what the queries are sensitive to: a thousand players
  each with five hundred games behaves nothing like half a million players
  with one game each, and real databases are the second with a heavy head.
*/
const SURNAMES = [
  'Carlsen',
  'Caruana',
  'Kasparov',
  'Karpov',
  'Kramnik',
  'Anand',
  'Nakamura',
  'Firouzja',
  'Ding',
  'Nepomniachtchi',
  'Aronian',
  'Giri',
  'So',
  'Rapport',
  'Duda',
  'Vachier-Lagrave',
  'Grischuk',
  'Svidler',
  'Topalov',
  'Ivanchuk',
  'Cardoso',
  'Carlson',
  'Carvalho',
  'Cartwright',
  'Carrasco',
];
const EVENTS = ['Candidates', 'Olympiad', 'Tata Steel', 'Sinquefield Cup', 'World Cup'];
const OPENINGS = ['Sicilian Defence', 'Ruy Lopez', 'Catalan Opening', 'Slav Defence'];
const ECOS = ['B90', 'C65', 'E06', 'D11', 'A45'];

const nameFor = (index) => {
  const surname = SURNAMES[index % SURNAMES.length];
  // A head of well-known players plus a long tail of one-off names.
  return index % 3 === 0 ? `${surname}, M` : `${surname}, ${index % 900}`;
};

const key = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function build(database, count) {
  const started = performance.now();
  const BATCH = 5_000;
  for (let start = 0; start < count; start += BATCH) {
    const batch = [];
    for (let i = start; i < Math.min(start + BATCH, count); i += 1) {
      const white = nameFor(i);
      const black = nameFor(i * 7 + 3);
      batch.push({
        game: {
          fingerprint: `bench-${i}`,
          white,
          black,
          whiteKey: key(white),
          blackKey: key(black),
          result: ['1-0', '0-1', '1/2-1/2'][i % 3],
          date: `20${10 + (i % 15)}.01.01`,
          year: 2010 + (i % 15),
          event: EVENTS[i % EVENTS.length],
          site: 'Somewhere',
          round: '1',
          whiteRating: 2400 + (i % 400),
          blackRating: 2400 + ((i * 3) % 400),
          eco: ECOS[i % ECOS.length],
          opening: OPENINGS[i % OPENINGS.length],
          plyCount: 60,
          importedAt: Date.now(),
        },
        pgn: '1. e4 e5 *',
        positions: [],
      });
    }
    database.insertGames(batch);
  }
  return performance.now() - started;
}

const RUNS = 60;

/**
 * Time one query, reporting the cold first run apart from the warm ones.
 *
 * Both halves of that split were wrong before, and together they turned a
 * one-off cost into a reported steady-state tail.
 *
 * The first query at a given scale pays to fault the index pages it touches in
 * from a database that was just written; at 500,000 games that first call takes
 * ~390 ms and every call after it takes 18. Averaging them describes neither.
 * The cold number is real and worth knowing — it is what the first search after
 * opening a large database costs — but it is not what searching *feels* like,
 * and quoting it as a percentile of ordinary use overstates the steady state by
 * more than twenty times.
 *
 * The percentile was also not a percentile. With twenty samples,
 * `samples[floor(20 * 0.95)]` is `samples[19]` — the maximum, relabelled. So
 * the cold run *was* the reported "p95" by construction, at every scale, no
 * matter how tight the rest of the distribution was. Sixty runs and a
 * nearest-rank index fix that; `worst` is now reported in its own column
 * instead of masquerading as a percentile.
 */
function measure(label, run) {
  const cold = (() => {
    const started = performance.now();
    run(0);
    return performance.now() - started;
  })();

  const samples = [];
  for (let i = 1; i <= RUNS; i += 1) {
    const started = performance.now();
    run(i);
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  const at = (q) => samples[Math.min(samples.length - 1, Math.ceil(q * samples.length) - 1)];
  const median = at(0.5);
  const p95 = at(0.95);
  const worst = samples[samples.length - 1];
  console.log(
    `${label.padEnd(28)} cold ${cold.toFixed(1).padStart(7)} ms   ` +
      `median ${median.toFixed(1).padStart(6)} ms   ` +
      `p95 ${p95.toFixed(1).padStart(6)} ms   ` +
      `worst ${worst.toFixed(1).padStart(6)} ms`,
  );
  return median;
}

const directory = mkdtempSync(path.join(tmpdir(), 'kingfisher-bench-'));
const file = path.join(directory, 'bench.db');
const database = new GameDatabase(file);

console.log(`Building ${COUNT.toLocaleString('en-GB')} games…`);
const buildMs = build(database, COUNT);
console.log(`Built in ${(buildMs / 1000).toFixed(1)} s\n`);

measure('player prefix (car)', () => database.players('car'));
measure('player prefix (carl)', () => database.players('carl'));
measure('player prefix (empty)', () => database.players(''));
measure('player search (exact)', () => database.search({ player: key('Carlsen, M'), limit: 50 }));
measure('text search (carlsen)', () => database.search({ text: 'carlsen', limit: 50 }));
measure('text search (two terms)', () =>
  database.search({ text: 'carlsen candidates', limit: 50 }),
);
/*
  The honest comparison for the LIKE path. A common term looks fast under LIKE
  only because LIMIT short-circuits once fifty rows match; a term that matches
  little or nothing scans every row, which is the case a user hits whenever
  they type a name the database does not have.
*/
measure('text search (rare term)', () => database.search({ text: 'cartwright', limit: 50 }));
measure('text search (no match)', () => database.search({ text: 'zzzznobody', limit: 50 }));

if (KEEP) {
  console.log(`\nDatabase kept at ${file}`);
} else {
  rmSync(directory, { recursive: true, force: true });
}
