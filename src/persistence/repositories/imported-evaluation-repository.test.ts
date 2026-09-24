import { describe, expect, it } from 'vitest';

import { cp } from '@/chess/evaluation';
import { START_FEN } from '@/chess/fen';
import { buildEvaluationsFile, parseEvaluationsFile } from '@/evidence/exchange';

import { createMemoryRepositories } from './index';

const file = buildEvaluationsFile(
  [
    {
      fen: START_FEN,
      engine: 'Stockfish 18',
      depth: 30,
      nodes: 1,
      timeMs: 1,
      score: cp(28),
      pv: ['e2e4'],
      analysedAt: 5,
    },
    {
      fen: START_FEN,
      engine: 'Leela 0.31',
      depth: 12,
      nodes: 1,
      timeMs: 1,
      score: cp(15),
      pv: ['d2d4'],
      analysedAt: 6,
    },
  ],
  'Coach',
  10,
);

describe('evaluations received as a file', () => {
  it('stores each once, reads them back deepest first, with where they came from', async () => {
    const repositories = createMemoryRepositories();
    const parsed = parseEvaluationsFile(JSON.parse(JSON.stringify(file)));
    const source = { file: 'coach.json', from: parsed.from, exportedAt: parsed.exportedAt };
    expect(
      await repositories.importedEvaluations.importMany(parsed.evaluations, source, 20),
    ).toEqual({
      added: 2,
      alreadyHeld: 0,
    });
    // The same file again changes nothing.
    expect(
      await repositories.importedEvaluations.importMany(parsed.evaluations, source, 30),
    ).toEqual({
      added: 0,
      alreadyHeld: 2,
    });
    const held = await repositories.importedEvaluations.atPosition(
      parsed.evaluations[0]!.positionKey,
    );
    expect(held.map((entry) => [entry.engine, entry.depth])).toEqual([
      ['Stockfish 18', 30],
      ['Leela 0.31', 12],
    ]);
    expect(held[0]!.source).toEqual({
      file: 'coach.json',
      from: 'Coach',
      exportedAt: 10,
      importedAt: 20,
    });
  });
});
