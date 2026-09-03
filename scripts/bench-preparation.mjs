#!/usr/bin/env node
/**
 * What Phase 9's workflows cost.
 *
 * Every path here runs while a player is waiting: opening a dossier, walking
 * into a position and reading its move orders, switching a period on the
 * journal analytics. None of them is a background job, so the budget is
 * "before the next click", not "before the import finishes".
 *
 * The fixtures are the same deterministic generator the other benchmarks use,
 * so the numbers are comparable run to run — and the shapes are chosen to be
 * unflattering: one opponent who has played every game in the collection, and
 * a repertoire whose positions converge heavily.
 *
 *   npm run bench:preparation
 *   npm run bench:preparation -- 50000
 */

import { performance } from 'node:perf_hooks';
import { argv, exit } from 'node:process';

import { generateGames } from './generate-pgn.mjs';
import { closeApp, loadApp } from './load-app.mjs';

const COUNT = Number(argv[2] ?? 20_000);
/** Distinct opening lines to build the repertoire graph from. */
const REPERTOIRE_LINES = 600;

async function main() {
  const { parsePgn } = await loadApp(['/src/chess/pgn/index.ts']);
  const { normalizeGame } = await loadApp(['/src/persistence/import-game.ts']);
  const dossier = await loadApp(['/src/preparation/dossier.ts']);
  const radar = await loadApp(['/src/theory/radar.ts']);
  const transpositions = await loadApp(['/src/repertoire/transpositions.ts']);
  const analytics = await loadApp(['/src/features/review/analytics.ts']);
  const { Position } = await loadApp(['/src/chess/position.ts']);
  const { positionKey } = await loadApp(['/src/chess/fen.ts']);

  const games = parsePgn(generateGames(COUNT)).games.map((game) => normalizeGame(game.tree));
  const opponent = games[0].white;

  console.log('\nKingfisher preparation and research benchmark');
  console.log(`node ${process.version} · ${process.platform}-${process.arch}`);
  console.log(`${games.length.toLocaleString()} games, all by one opponent\n`);

  const row = (label, value) =>
    console.log(`${label.padEnd(38)} ${`${value.toFixed(1)} ms`.padStart(9)}`);

  row(
    'opponent dossier',
    median(10, () => dossier.buildDossier(opponent, games, { recentFromYear: 2024 })),
  );
  row(
    'recent versus historical',
    median(10, () => dossier.comparePeriods(games, opponent, 'w', 2024)),
  );
  row(
    'move-order fingerprints',
    median(10, () => dossier.moveOrderFingerprints(games, opponent, 'w', 2024)),
  );

  const positions = buildRepertoire(games, Position, positionKey);
  console.log(`\nrepertoire from the corpus: ${positions.length.toLocaleString()} positions`);
  const target = positions.at(-1).positionKey;
  row(
    'transposition routes to one position',
    median(10, () => transpositions.routesToPosition(positions, target)),
  );
  row(
    'convergence points',
    median(10, () => transpositions.convergencePoints(positions)),
  );

  /*
    The corpus has few distinct openings, so the repertoire above is small and
    its timing is a floor rather than a scaling measurement. This one is built
    by branching through the real rules to a real size — the graph cost is one
    `advanceSan` per stored move, so it is the move count that matters.
  */
  const large = branchedRepertoire(Position, positionKey, 4_000);
  console.log(`\nsynthetic repertoire: ${large.length.toLocaleString()} positions`);
  const deep = large.at(-1).positionKey;
  row(
    'transposition routes to one position',
    median(5, () => transpositions.routesToPosition(large, deep)),
  );
  row(
    'convergence points',
    median(5, () => transpositions.convergencePoints(large)),
  );

  const window = (total) => ({
    fen: 'x',
    source: { id: 'local', name: 'Local' },
    totalGames: total,
    white: 0,
    draws: total,
    black: 0,
    moves: Array.from({ length: 30 }, (_, index) => ({
      uci: `m${index}`,
      san: `m${index}`,
      games: Math.max(1, 100 - index * 3),
      white: 0,
      draws: 1,
      black: 0,
    })),
  });
  console.log('');
  row(
    'theory radar over three windows',
    median(50, () =>
      radar.buildRadar(window(5000), window(1500), window(400), { currentYear: 2026 }),
    ),
  );

  const entries = journalEntries(2_000);
  console.log(`\njournal: ${entries.length.toLocaleString()} decisions`);
  row(
    'evaluation calibration',
    median(50, () => analytics.evaluationCalibration(entries)),
  );
  row(
    'candidate coverage',
    median(50, () => analytics.candidateCoverage(entries)),
  );
  row(
    'divergence clusters',
    median(50, () => analytics.themesBehindLargestGaps(entries)),
  );
  console.log('');
}

/**
 * A repertoire graph from the corpus's own opening lines.
 *
 * Built by replaying real moves rather than by inventing keys, so the
 * convergence the benchmark measures is convergence the rules actually
 * produce.
 */
function buildRepertoire(games, Position, positionKey) {
  const byKey = new Map();
  for (const game of games.slice(0, REPERTOIRE_LINES)) {
    let position = Position.fromTrustedFen(game.tree.startFen);
    let nodeId = game.tree.rootId;
    for (let ply = 0; ply < 12; ply += 1) {
      const node = game.tree.nodes[nodeId];
      const childId = node?.children?.[0];
      const child = childId ? game.tree.nodes[childId] : null;
      if (!child?.move) break;
      const key = positionKey(position.fen);
      const existing = byKey.get(key);
      const move = { uci: child.move.uci, san: child.move.san, role: 'main', updatedAt: 0 };
      byKey.set(key, {
        id: `p-${key}`,
        repertoireId: 'r',
        positionKey: key,
        fen: position.fen,
        sideToMove: position.fen.split(' ')[1] === 'b' ? 'b' : 'w',
        moves: existing?.moves.some((entry) => entry.uci === move.uci)
          ? existing.moves
          : [...(existing?.moves ?? []), move],
        depth: ply,
        createdAt: 0,
        updatedAt: 0,
        revision: 0,
      });
      const played = position.advanceSan(String(child.move.san));
      if (!played.ok) break;
      position = played.value.next;
      nodeId = childId;
    }
  }
  return [...byKey.values()];
}

/**
 * A repertoire of a realistic size, branched through the real rules.
 *
 * Breadth-first from the start, taking the first few legal moves at each
 * position, until the target size is reached. Every edge is a legal move, so
 * the graph the benchmark walks is the shape the graph builder actually has to
 * handle rather than a synthetic adjacency list.
 */
function branchedRepertoire(Position, positionKey, size) {
  const byKey = new Map();
  const queue = [
    Position.fromTrustedFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'),
  ];
  let depth = 0;

  while (queue.length > 0 && byKey.size < size && depth < 4_000) {
    depth += 1;
    const position = queue.shift();
    const key = positionKey(position.fen);
    if (byKey.has(key)) continue;
    // Three replies per position: enough branching to make convergence real,
    // few enough that the graph stays a repertoire rather than a game tree.
    const legal = position.legalMoves().slice(0, 3);
    const moves = [];
    for (const candidate of legal) {
      const played = position.advanceSan(String(candidate.san));
      if (!played.ok) continue;
      moves.push({ uci: candidate.uci, san: candidate.san, role: 'main', updatedAt: 0 });
      queue.push(played.value.next);
    }
    byKey.set(key, {
      id: `p-${key}`,
      repertoireId: 'r',
      positionKey: key,
      fen: position.fen,
      sideToMove: position.fen.split(' ')[1] === 'b' ? 'b' : 'w',
      moves,
      depth: 0,
      createdAt: 0,
      updatedAt: 0,
      revision: 0,
    });
  }
  return [...byKey.values()];
}

function journalEntries(count) {
  return Array.from({ length: count }, (_, index) => ({
    decision: {
      id: `d${index}`,
      positionKey: `k${index % 50}`,
      fen: 'f',
      sideToMove: index % 2 ? 'b' : 'w',
      candidates: [
        { uci: 'e2e4', san: 'e4' },
        { uci: 'd2d4', san: 'd4' },
      ],
      estimate: { band: 'equal', pawns: (index % 13) / 10 },
      themes: [index % 3 ? 'calculation' : 'trade-decision'],
      createdAt: index,
      updatedAt: index,
      revision: 0,
    },
    evidence: { id: `e${index}`, score: { kind: 'cp', cp: (index % 17) * 10 }, pv: ['e2e4'] },
  }));
}

function median(runs, run) {
  const samples = [];
  for (let index = 0; index < runs; index += 1) {
    const started = performance.now();
    run(index);
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

main()
  .then(closeApp)
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await closeApp();
    exit(1);
  });
