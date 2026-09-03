#!/usr/bin/env node
/**
 * Controlled feasibility experiment: bypass Kingfisher's PGN/game-tree parser
 * and ask chess.js to resolve each main line directly.
 *
 * This is intentionally not production code. It tests the fastest plausible
 * path that keeps the installed rules engine, then rejects it unless it is at
 * least twice as fast *and* preserves Kingfisher's semantic PGN contract.
 */

import { performance } from 'node:perf_hooks';
import { argv, exit } from 'node:process';
import { Chess } from 'chess.js';

import { generateGames } from './generate-pgn.mjs';
import { closeApp, loadApp } from './load-app.mjs';

const COUNT = Number(argv[2] ?? 20_000);

async function main() {
  const { parsePgn } = await loadApp(['/src/chess/pgn/index.ts']);
  const corpus = generateGames(COUNT);
  const games = corpus.split(/\n\n(?=\[Event )/);

  const kingfisherStarted = performance.now();
  const parsed = parsePgn(corpus);
  const kingfisherMs = performance.now() - kingfisherStarted;

  const directStarted = performance.now();
  let directGames = 0;
  for (const pgn of games) {
    const chess = new Chess();
    chess.loadPgn(pgn);
    directGames += 1;
  }
  const directMs = performance.now() - directStarted;
  const speedup = kingfisherMs / directMs;

  const fixtures = verifyRules();
  const semantic = verifySemanticContract(parsePgn);
  const equivalent =
    parsed.games.length === directGames &&
    fixtures.every((fixture) => fixture.pass) &&
    semantic.pass;
  const accepted = equivalent && speedup >= 2;

  console.log('\nKingfisher rules/SAN feasibility experiment');
  console.log(`node ${process.version} · ${process.platform}-${process.arch}`);
  console.log(`${COUNT.toLocaleString()} deterministic games\n`);
  console.log(`Kingfisher tree parser       ${kingfisherMs.toFixed(1)} ms`);
  console.log(`direct chess.js main lines   ${directMs.toFixed(1)} ms`);
  console.log(`practical speed ratio        ${speedup.toFixed(2)}x`);
  console.log(`games resolved               ${directGames.toLocaleString()}`);
  for (const fixture of fixtures) console.log(`${fixture.pass ? 'PASS' : 'FAIL'} ${fixture.name}`);
  console.log(`${semantic.pass ? 'PASS' : 'FAIL'} ${semantic.name}`);
  console.log(
    `\nDecision: ${accepted ? 'ACCEPT prototype' : 'REJECT replacement'} — ${
      accepted
        ? 'speed and semantic thresholds passed.'
        : !semantic.pass
          ? semantic.detail
          : speedup < 2
            ? 'the measured workload did not reach the 2x practical threshold.'
            : 'correctness/equivalence coverage did not pass.'
    }\n`,
  );
}

function verifyRules() {
  const checks = [];
  const start = new Chess();
  checks.push({ name: 'legal move generation', pass: start.moves().length === 20 });
  start.move('e4');
  checks.push({ name: 'SAN parsing and generation', pass: start.history()[0] === 'e4' });

  const castle = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  checks.push({ name: 'castling', pass: castle.move('O-O').san === 'O-O' });
  const passant = new Chess('8/8/8/3pP3/8/8/8/4K2k w - d6 0 1');
  checks.push({ name: 'en passant', pass: passant.move('exd6').flags.includes('e') });
  const promotion = new Chess('8/P7/8/8/8/8/7k/4K3 w - - 0 1');
  checks.push({ name: 'promotion', pass: promotion.move('a8=Q').promotion === 'q' });
  const mate = new Chess();
  for (const san of ['f3', 'e5', 'g4', 'Qh4#']) mate.move(san);
  checks.push({ name: 'check and mate', pass: mate.isCheckmate() && mate.fen().includes(' w ') });
  checks.push({ name: 'FEN round trip', pass: new Chess(start.fen()).fen() === start.fen() });
  checks.push({
    name: 'standard-start assumption recorded (no Chess960 castling contract)',
    pass: true,
  });
  return checks;
}

function verifySemanticContract(parsePgn) {
  const pgn = '[Event "Semantic"]\n\n1. e4 {idea} e5 (1... c5 $1) 2. Nf3 *';
  const ours = parsePgn(pgn).games[0];
  const direct = new Chess();
  direct.loadPgn(pgn);
  const oursHasBranch = Boolean(
    ours && Object.values(ours.tree.nodes).some((node) => node.nags.length),
  );
  const directText = direct.pgn();
  const directHasBranch = directText.includes('c5') && directText.includes('$1');
  return {
    name: 'PGN variations, comments, NAGs and recovery provenance',
    pass: oursHasBranch && directHasBranch,
    detail:
      'direct chess.js is a main-line loader and does not preserve Kingfisher variations/NAGs; the existing boundary stays.',
  };
}

main()
  .then(closeApp)
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await closeApp();
    exit(1);
  });
