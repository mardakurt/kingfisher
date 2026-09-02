#!/usr/bin/env node

import { performance } from 'node:perf_hooks';
import { argv, exit } from 'node:process';

import { generateGames } from './generate-pgn.mjs';
import { closeApp, loadApp } from './load-app.mjs';

const count = Number(argv[2] ?? 100_000);

async function main() {
  const { parsePgn } = await loadApp(['/src/chess/pgn/index.ts']);
  const pgn = generateGames(count);
  const started = performance.now();
  const result = parsePgn(pgn);
  const elapsed = performance.now() - started;
  console.log(`Kingfisher PGN parser benchmark`);
  console.log(`node ${process.version} · ${process.platform}-${process.arch}`);
  console.log(`${pgn.length.toLocaleString()} UTF-16 characters · ${count.toLocaleString()} games`);
  console.log(`parsed ${result.games.length.toLocaleString()} games in ${elapsed.toFixed(1)} ms`);
  console.log(`parser throughput ${Math.round(count / (elapsed / 1000)).toLocaleString()} games/s`);
}

main()
  .then(closeApp)
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await closeApp();
    exit(1);
  });
