#!/usr/bin/env node
/**
 * What it costs to assemble what the companion is shown.
 *
 * The assistant's answer time is dominated by the model, which is not
 * Kingfisher's to measure and varies by three orders of magnitude between a
 * hosted endpoint and a laptop. What *is* Kingfisher's is the work done before
 * the request leaves: gathering engine lines, database counts, repertoire
 * decisions, structural features, tablebase results and notes into one packet,
 * and rendering it as the text the model receives.
 *
 * That is pure local computation, so it is measurable and worth keeping
 * honest. If it ever becomes the reason asking a question feels slow, this is
 * the script that says so.
 *
 *   npm run bench:evidence
 *
 * Needs no companion, no network and no token.
 */

import { performance } from 'node:perf_hooks';
import { exit } from 'node:process';

import { closeApp, loadApp } from './load-app.mjs';

const RUNS = 200;

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const ms = (value) => `${value.toFixed(3)} ms`;

function measure(label, work) {
  // A discarded warm-up so the first sample is not also measuring the JIT.
  for (let index = 0; index < 20; index += 1) work();
  const samples = [];
  for (let index = 0; index < RUNS; index += 1) {
    const started = performance.now();
    const result = work();
    samples.push(performance.now() - started);
    if (result === undefined) throw new Error(`${label} produced nothing`);
  }
  return { label, median: median(samples), worst: Math.max(...samples) };
}

async function main() {
  const { buildEvidencePacket, renderPacket, START_FEN, parseFen, positionFeatures } =
    await loadApp(['/src/assistant/evidence.ts', '/src/chess/fen.ts', '/src/chess/features.ts']);

  // `positionFeatures` takes parsed FEN parts, the same as the panels do.
  const parsed = parseFen(START_FEN);
  const features = parsed.ok ? positionFeatures(parsed.value) : null;

  const fen = START_FEN;
  const formatScore = (score) => (score.kind === 'cp' ? `${score.cp / 100}` : `#${score.moves}`);

  const engineLines = (count) => ({
    depth: 30,
    lines: Array.from({ length: count }, (_, rank) => ({
      rank: rank + 1,
      score: { kind: 'cp', cp: 20 - rank * 5 },
      san: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6'],
    })),
  });

  const databaseMoves = (count) =>
    Array.from({ length: count }, (_, index) => ({
      uci: 'e2e4',
      san: `m${index}`,
      white: 1200 - index,
      draws: 900,
      black: 700,
      averageRating: 2500,
    }));

  const ordinary = {
    fen,
    sideToMove: 'w',
    line: ['e4', 'e5'],
    engines: [{ name: 'Stockfish', analysis: engineLines(3) }],
    databaseName: 'Masters',
    databaseTotal: 12_000,
    databaseMoves: databaseMoves(6),
    formatScore,
  };

  const large = {
    ...ordinary,
    databaseTotal: 4_100_000,
    databaseMoves: databaseMoves(40),
  };

  const everything = {
    ...large,
    engines: [
      { name: 'Stockfish', analysis: engineLines(5) },
      { name: 'Lc0', analysis: engineLines(5) },
    ],
    features,
    repertoire: {
      title: 'White repertoire',
      color: 'w',
      record: {
        id: 'rp',
        repertoireId: 'r',
        positionKey: 'k',
        fen,
        sideToMove: 'w',
        depth: 2,
        createdAt: 0,
        updatedAt: 0,
        moves: [{ uci: 'e2e4', san: 'e4', role: 'main', updatedAt: 0, note: 'Main choice' }],
      },
    },
    personal: { games: 41, score: 0.58 },
    notes: ['A long note about the structure.'.repeat(4)],
    modelGames: ['Kasparov–Topalov, Wijk aan Zee 1999', 'Fischer–Spassky, Reykjavik 1972'],
  };

  console.log(`\nKingfisher evidence packet — ${RUNS} runs each`);
  console.log(`node ${process.version} · ${process.platform}-${process.arch}`);
  console.log('Local assembly only. Model response time is not measured here.\n');

  const rows = [
    measure('ordinary position', () => renderPacket(buildEvidencePacket(ordinary))),
    measure('large explorer result', () => renderPacket(buildEvidencePacket(large))),
    measure('every source present', () => renderPacket(buildEvidencePacket(everything))),
    measure('build only (no render)', () => buildEvidencePacket(everything)),
  ];

  const width = Math.max(...rows.map((row) => row.label.length));
  console.log(`${'case'.padEnd(width)}     median      worst`);
  for (const row of rows) {
    console.log(
      `${row.label.padEnd(width)}  ${ms(row.median).padStart(9)}  ${ms(row.worst).padStart(9)}`,
    );
  }

  const rendered = renderPacket(buildEvidencePacket(everything));
  console.log(`\nfull packet renders to ${rendered.length.toLocaleString()} characters\n`);
}

main()
  .then(closeApp)
  .catch(async (error) => {
    console.error(error.message);
    await closeApp();
    exit(1);
  });
