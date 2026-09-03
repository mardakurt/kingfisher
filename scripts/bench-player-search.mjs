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

function measure(label, runs, run) {
  const samples = [];
  for (let i = 0; i < runs; i += 1) {
    const started = performance.now();
    run(i);
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];
  const p95 = samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))];
  console.log(
    `${label.padEnd(28)} median ${median.toFixed(1).padStart(7)} ms   p95 ${p95.toFixed(1).padStart(7)} ms`,
  );
  return median;
}

const directory = mkdtempSync(path.join(tmpdir(), 'kingfisher-bench-'));
const file = path.join(directory, 'bench.db');
const database = new GameDatabase(file);

console.log(`Building ${COUNT.toLocaleString('en-GB')} games…`);
const buildMs = build(database, COUNT);
console.log(`Built in ${(buildMs / 1000).toFixed(1)} s\n`);

measure('player prefix (car)', 20, () => database.players('car'));
measure('player prefix (carl)', 20, () => database.players('carl'));
measure('player prefix (empty)', 20, () => database.players(''));
measure('player search (exact)', 20, () =>
  database.search({ player: key('Carlsen, M'), limit: 50 }),
);
measure('text search (carlsen)', 20, () => database.search({ text: 'carlsen', limit: 50 }));
measure('text search (two terms)', 20, () =>
  database.search({ text: 'carlsen candidates', limit: 50 }),
);
/*
  The honest comparison for the LIKE path. A common term looks fast under LIKE
  only because LIMIT short-circuits once fifty rows match; a term that matches
  little or nothing scans every row, which is the case a user hits whenever
  they type a name the database does not have.
*/
measure('text search (rare term)', 20, () => database.search({ text: 'cartwright', limit: 50 }));
measure('text search (no match)', 20, () => database.search({ text: 'zzzznobody', limit: 50 }));

if (KEEP) {
  console.log(`\nDatabase kept at ${file}`);
} else {
  rmSync(directory, { recursive: true, force: true });
}
