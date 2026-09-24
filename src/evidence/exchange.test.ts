import { describe, expect, it } from 'vitest';

import { cp, mate } from '@/chess/evaluation';
import { positionKey, START_FEN } from '@/chess/fen';

import {
  buildEvaluationsFile,
  EvaluationsFileError,
  parseEvaluationsFile,
  type LocalEvaluation,
} from './exchange';

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

const local = (overrides: Partial<LocalEvaluation> = {}): LocalEvaluation => ({
  fen: START_FEN,
  engine: 'Stockfish 18',
  depth: 24,
  nodes: 5_000_000,
  timeMs: 3_000,
  score: cp(31),
  pv: ['e2e4', 'e7e5', 'g1f3'],
  analysedAt: 1_000,
  ...overrides,
});

describe('evaluations as a file', () => {
  it('keeps the deepest evaluation per position and engine, with its provenance', () => {
    const file = buildEvaluationsFile(
      [
        local({ depth: 20 }),
        local({ depth: 30, analysedAt: 2_000 }),
        local({ depth: 30, analysedAt: 1_500 }),
        local({ engine: 'Leela 0.31', depth: 12, score: cp(20) }),
        local({ fen: AFTER_E4, pv: ['c7c5'], score: cp(35) }),
      ],
      '  Coach Ana  ',
      5_000,
    );
    expect(file.from).toBe('Coach Ana');
    expect(file.evaluations).toHaveLength(3);
    const stockfish = file.evaluations.find(
      (entry) => entry.engine === 'Stockfish 18' && entry.positionKey === positionKey(START_FEN),
    )!;
    expect(stockfish).toMatchObject({ depth: 30, analysedAt: 2_000 });
    // Round trip through JSON, as a file travels.
    const parsed = parseEvaluationsFile(JSON.parse(JSON.stringify(file)));
    expect(parsed).toMatchObject({ from: 'Coach Ana', exportedAt: 5_000, refused: 0 });
    expect(parsed.evaluations).toEqual(file.evaluations);
  });

  it('trusts nothing in a received file: the key is recomputed and lines are replayed', () => {
    const forged = {
      format: 'kingfisher-evaluations',
      version: 1,
      exportedAt: 1,
      from: null,
      evaluations: [
        // A key that does not belong to the FEN is replaced by the real one.
        { ...local(), positionKey: 'forged' },
        // A line that turns illegal is cut where it does.
        local({ fen: AFTER_E4, pv: ['c7c5', 'a1a8', 'g1f3'] }),
        // A line illegal from the first move is refused entirely.
        local({ pv: ['e2e5'] }),
        // A position Kingfisher's parser refuses.
        local({ fen: '8/8/8/8/8/8/8/8 w - - 0 1' }),
        // A score that is not one.
        local({ score: { kind: 'cp', cp: Number.NaN } as never }),
        local({ score: mate(0) }),
        // A missing engine name.
        local({ engine: '   ' }),
      ],
    };
    const parsed = parseEvaluationsFile(forged);
    expect(parsed.refused).toBe(5);
    expect(parsed.evaluations).toHaveLength(2);
    expect(parsed.evaluations[0]!.positionKey).toBe(positionKey(START_FEN));
    expect(parsed.evaluations[1]!.pv).toEqual(['c7c5']);
  });

  it('refuses a file that is not one, or is from a version it cannot read', () => {
    expect(() => parseEvaluationsFile({ format: 'kingfisher-team' })).toThrow(EvaluationsFileError);
    expect(() =>
      parseEvaluationsFile({ format: 'kingfisher-evaluations', version: 2, evaluations: [] }),
    ).toThrow(/version 2/);
    expect(() => parseEvaluationsFile(null)).toThrow(EvaluationsFileError);
  });
});
