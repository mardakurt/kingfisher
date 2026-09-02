#!/usr/bin/env node
/**
 * What the SQLite companion actually costs.
 *
 * Phase 4 shipped the SQLite path and Phase 5 never measured it, so the
 * hundred-thousand-game claim rested on the shape of the schema rather than on
 * a clock. This drives the companion over its real HTTP surface, with the same
 * payloads `src/companion/import.ts` sends, so what it measures is the path
 * the application uses and not a private fast lane.
 *
 *   npm run companion                       # in another terminal
 *   npm run bench:sqlite -- 10000
 *   npm run bench:sqlite -- 100000
 *
 * The companion prints a pairing URL containing a token. Pass it as
 * KINGFISHER_COMPANION_TOKEN; it is never written to disk by this script and
 * never appears in its output.
 *
 * The generated database lands in companion/data/ and is not committed. Delete
 * it when you are done: a hundred thousand games is a few hundred megabytes.
 */

import { performance } from 'node:perf_hooks';
import { argv, env, exit } from 'node:process';

import { closeApp, loadApp } from './load-app.mjs';

const COUNT = Number(argv[2] ?? 10000);
const PORT = Number(env.KINGFISHER_COMPANION_PORT ?? 4321);
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = (env.KINGFISHER_COMPANION_TOKEN ?? '').trim();
const NAME = `Bench ${COUNT}`;
/** The same batch size the application imports with, so the numbers transfer. */
const BATCH = 250;

if (!TOKEN) {
  console.error(
    'Set KINGFISHER_COMPANION_TOKEN to the token from the companion pairing URL.\n' +
      'It is printed by `npm run companion` and changes every run.',
  );
  exit(1);
}

async function call(path, body) {
  const response = await fetch(`${BASE}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    // Deliberately does not echo the request headers: the token is in them.
    throw new Error(`${path} returned HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Timed to the median rather than the mean.
 *
 * One request in a set of twenty routinely lands on a checkpoint or a cold
 * page and costs ten times the rest; a mean reports that as the typical
 * experience, which it is not. The worst case is reported separately because
 * it is also worth knowing.
 */
async function measure(label, runs, work) {
  const samples = [];
  for (let index = 0; index < runs; index += 1) {
    const started = performance.now();
    await work(index);
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];
  return { label, runs, median, worst: samples[samples.length - 1] };
}

const ms = (value) => `${value.toFixed(1)} ms`;

async function main() {
  const { generateGames } = await import('./generate-pgn.mjs');
  const { parsePgn, serializePgn, normalizeGame, indexGame } = await loadApp([
    '/src/chess/pgn/index.ts',
    '/src/persistence/import-game.ts',
  ]);

  console.log(`\nKingfisher SQLite benchmark — ${COUNT.toLocaleString()} games`);
  console.log(`node ${process.version} · ${process.platform}-${process.arch}\n`);

  const created = await call('/db/create', { name: NAME });
  const key = created.key;

  const pgn = generateGames(COUNT);
  const parseStarted = performance.now();
  const parsed = parsePgn(pgn);
  const parseMs = performance.now() - parseStarted;

  let batch = [];
  let imported = 0;
  let duplicates = 0;
  const importStarted = performance.now();
  const flush = async () => {
    if (batch.length === 0) return;
    const result = await call('/db/import', { key, games: batch });
    imported += result.imported;
    duplicates += result.duplicates;
    batch = [];
  };
  for (const game of parsed.games) {
    const record = normalizeGame(game.tree);
    const positions = indexGame(record);
    batch.push({
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
        plyCount: positions.length,
        importedAt: record.importedAt,
      },
      pgn: serializePgn(record.tree),
      positions: positions.map((position) => ({
        positionKey: position.positionKey,
        ply: position.ply,
        moveUci: position.moveUci,
        moveSan: position.moveSan,
        mover: position.mover,
      })),
    });
    if (batch.length >= BATCH) await flush();
  }
  await flush();
  const importMs = performance.now() - importStarted;

  const status = await call('/status');
  const stored = status.databases.find((entry) => entry.key === key);

  // A position every game reaches, and one only some do, because the cost of
  // an aggregation is a function of how many rows match it.
  const afterE4 = indexGame(normalizeGame(parsed.games[0].tree))[0].positionKey;
  const deep = indexGame(normalizeGame(parsed.games[0].tree))[8]?.positionKey ?? afterE4;

  const results = [
    await measure('paged list (100)', 20, () => call('/db/search', { key, query: { limit: 100 } })),
    await measure('text search', 20, (index) =>
      call('/db/search', { key, query: { text: index % 2 ? 'Carlsen' : 'Sicilian', limit: 100 } }),
    ),
    await measure('page 20 deep', 20, () =>
      call('/db/search', { key, query: { limit: 100, offset: 2000 } }),
    ),
    await measure('player search', 20, () =>
      call('/db/search', { key, query: { player: 'carlsen, m', limit: 100 } }),
    ),
    await measure('player prefix lookup', 20, () => call('/db/players', { key, prefix: 'car' })),
    await measure('opening aggregation (common)', 20, () =>
      call('/db/explore', { key, positionKey: afterE4, limit: 24 }),
    ),
    await measure('opening aggregation (deep)', 20, () =>
      call('/db/explore', { key, positionKey: deep, limit: 24 }),
    ),
    await measure('games at position', 20, () =>
      call('/db/games-at', { key, positionKey: deep, limit: 12 }),
    ),
  ];

  console.log(`parse PGN in browser-equivalent code   ${ms(parseMs)}`);
  console.log(
    `import ${imported.toLocaleString()} games (${duplicates} duplicates)   ${ms(importMs)}` +
      `  ·  ${Math.round(imported / (importMs / 1000)).toLocaleString()} games/s`,
  );
  console.log(`stored game count reported by companion   ${stored?.games?.toLocaleString()}\n`);

  const width = Math.max(...results.map((entry) => entry.label.length));
  console.log(`${'query'.padEnd(width)}   median     worst`);
  for (const entry of results) {
    console.log(
      `${entry.label.padEnd(width)}   ${ms(entry.median).padStart(8)}  ${ms(entry.worst).padStart(9)}`,
    );
  }
  console.log(`\nDatabase left at companion/data/${NAME}.kingfisher.sqlite — delete when done.\n`);
}

main()
  .then(closeApp)
  .catch(async (error) => {
    console.error(error.message);
    await closeApp();
    exit(1);
  });
