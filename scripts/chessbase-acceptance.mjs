#!/usr/bin/env node
/** Generate a small, reproducible handoff for an independent licensed ChessBase check. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { loadApp, closeApp } from './load-app.mjs';
const output = process.argv[2];
if (!output) throw new Error('Usage: node scripts/chessbase-acceptance.mjs <new output directory>');
mkdirSync(output, { recursive: false });
try {
  const { parsePgn, writeChessBase, serializePgn } = await loadApp([
    '/src/chess/pgn/index.ts',
    '/src/database/chessbase/write.ts',
  ]);
  const cases = [
    '[Event "KF mainline and annotations"]\n[White "A"]\n[Black "B"]\n[Result "*"]\n\n1. e4! { Before the reply. [%clk 0:09:58] [%eval 0.20] [%csl Ge4] } (1. d4 d5 (1... Nf6)) e5 2. Nf3 {Develop. [%kfquestion Find the move.] } *',
    '[Event "KF set-up position"]\n[White "Setup"]\n[Black "Test"]\n[SetUp "1"]\n[FEN "7k/5Q2/6K1/8/8/8/8/8 w - - 0 1"]\n[Result "1-0"]\n\n1. Qg7# 1-0',
  ];
  const trees = cases.map((pgn) => {
    const parsed = parsePgn(pgn);
    if (!parsed.games[0] || parsed.games[0].issues.some((issue) => issue.severity === 'error'))
      throw new Error('Invalid acceptance fixture.');
    return parsed.games[0].tree;
  });
  const files = writeChessBase(trees);
  const hashes = {};
  for (const [extension, bytes] of files.files) {
    const name = `Kingfisher Acceptance.${extension}`;
    writeFileSync(path.join(output, name), bytes);
    hashes[name] = createHash('sha256').update(bytes).digest('hex');
  }
  writeFileSync(
    path.join(output, 'source.pgn'),
    trees.map((tree) => serializePgn(tree)).join('\n'),
  );
  writeFileSync(
    path.join(output, 'acceptance.json'),
    JSON.stringify(
      {
        format: 'kingfisher-independent-acceptance',
        generatedAt: new Date().toISOString(),
        status: 'not-run-in-chessbase',
        hashes,
        writerLossReport: files.report,
        chessbaseVersion: null,
        operatingSystem: null,
        tester: null,
        fieldChecks: [
          'mainline',
          'nested-variations',
          'comments',
          'NAGs',
          'clock',
          'green-square',
          'set-up-FEN',
          'result',
        ].map((field) => ({ field, status: 'not-run', evidence: null })),
        knownUnsupported: ['engine evaluations', 'Kingfisher training questions'],
        tasks: [
          'Find a player and filter their games',
          'Find a position reached by transposition',
          'Generate a source-specific opening survey',
          'Save intended moves and rehearse questions',
          'Resume an interrupted engine analysis',
          'Export an annotated chapter and open it in the other program',
        ].map((task) => ({
          task,
          kingfisherSeconds: null,
          chessbaseSeconds: null,
          participantRating: null,
          errors: null,
          evidence: null,
        })),
      },
      null,
      2,
    ),
  );
  console.log(
    `Wrote independent acceptance kit to ${path.resolve(output)}. No ChessBase or human timing checks have been run.`,
  );
} finally {
  await closeApp();
}
