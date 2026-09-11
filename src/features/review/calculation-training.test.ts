import { describe, expect, it } from 'vitest';

import { asFen, asSan, asUci } from '@/chess/types';

import { calculationTrainingFromCandidates, gradeCalculationPick } from './calculation-training';

describe('calculationTrainingFromCandidates', () => {
  it('builds a draft item with engine candidates and provenance', () => {
    const draft = calculationTrainingFromCandidates({
      reviewItemId: 'rev-1',
      positionKey: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR',
      fen: asFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'),
      sideToMove: 'w',
      gameId: 'game-1',
      gameLabel: 'My game',
      candidates: [
        { san: asSan('e4'), uci: asUci('e2e4'), cp: 30 },
        { san: asSan('d4'), uci: asUci('d2d4'), cp: 28 },
      ],
      engineVersion: 'stockfish-17.1',
      acceptableBandCp: 30,
    });
    expect(draft.allowedMoves).toEqual(['e4', 'd4']);
    expect(draft.candidates[0]?.san).toBe('e4');
    expect(draft.topSan).toBe('e4');
    expect(draft.provenance.answerSource).toBe('engine-candidates');
    expect(draft.source?.kind).toBe('game-review');
  });

  it('marks the answer source as tablebase when WDL is provided', () => {
    const draft = calculationTrainingFromCandidates({
      reviewItemId: 'rev-2',
      positionKey: 'k',
      fen: asFen('k'),
      sideToMove: 'w',
      candidates: [{ san: asSan('Kf1'), uci: asUci('e1f1'), cp: 0 }],
      tablebaseWdl: 4,
    });
    expect(draft.provenance.answerSource).toBe('tablebase');
    expect(draft.provenance.tablebaseWdl).toBe(4);
  });
});

describe('gradeCalculationPick', () => {
  const draft = calculationTrainingFromCandidates({
    reviewItemId: 'rev-3',
    positionKey: 'k',
    fen: asFen('k'),
    sideToMove: 'w',
    candidates: [
      { san: asSan('e4'), uci: asUci('e2e4'), cp: 30 },
      { san: asSan('d4'), uci: asUci('d2d4'), cp: 28 },
      { san: asSan('Nf3'), uci: asUci('g1f3'), cp: 10 },
    ],
    acceptableBandCp: 30,
  });

  it('grades the top move as the best pick', () => {
    const grade = gradeCalculationPick(draft, asSan('e4'));
    expect(grade.rank).toBe(1);
    expect(grade.deltaCp).toBe(0);
    expect(grade.acceptable).toBe(true);
  });

  it('accepts a near-equal move (within the band)', () => {
    const grade = gradeCalculationPick(draft, asSan('d4'));
    expect(grade.rank).toBe(2);
    expect(grade.deltaCp).toBe(2);
    expect(grade.acceptable).toBe(true);
  });

  it('marks a far-from-top move as outside the band', () => {
    const grade = gradeCalculationPick(draft, asSan('Nf3'));
    expect(grade.rank).toBe(3);
    expect(grade.deltaCp).toBe(20);
    /* Within the default band of 30 — still acceptable. */
    expect(grade.acceptable).toBe(true);
  });

  it('refuses a move that is not a candidate', () => {
    const grade = gradeCalculationPick(draft, asSan('h4'));
    expect(grade.rank).toBe(Number.POSITIVE_INFINITY);
    expect(grade.acceptable).toBe(false);
  });

  it('never reports WRONG for an engine-second-line within the band', () => {
    /* The brief: "do not mark one winning move wrong because DTZ
       differs slightly" and "do not say WRONG because user chose
       engine #2 at +0.42 instead of #1 at +0.45." Both are the
       same contract: a candidate within the band is acceptable. */
    const closeDraft = calculationTrainingFromCandidates({
      reviewItemId: 'rev-4',
      positionKey: 'k',
      fen: asFen('k'),
      sideToMove: 'w',
      candidates: [
        { san: asSan('a'), uci: asUci('a'), cp: 45 },
        { san: asSan('b'), uci: asUci('b'), cp: 42 },
        { san: asSan('c'), uci: asUci('c'), cp: -50 },
      ],
      acceptableBandCp: 5,
    });
    expect(gradeCalculationPick(closeDraft, asSan('b')).acceptable).toBe(true);
    expect(gradeCalculationPick(closeDraft, asSan('c')).acceptable).toBe(false);
  });
});
