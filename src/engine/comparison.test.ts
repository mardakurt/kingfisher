import { describe, expect, it } from 'vitest';

import { cp, mate } from '@/chess/evaluation';
import { START_FEN } from '@/chess/fen';
import { asSan, asUci } from '@/chess/types';

import { compareEngines, describeComparison, type EngineReading } from './comparison';
import type { EngineAnalysis } from './types';

const analysis = (
  lines: { move: string; score: ReturnType<typeof cp>; pv?: string[] }[],
): EngineAnalysis => ({
  fen: START_FEN,
  depth: 20,
  seldepth: 24,
  nodes: 1000,
  nps: 1000,
  timeMs: 100,
  lines: lines.map((line, index) => ({
    rank: index + 1,
    score: line.score,
    depth: 20,
    moves: (line.pv ?? [line.move]).map(asUci),
    san: [asSan(line.move)],
  })),
  complete: false,
});

const reading = (
  id: string,
  family: 'alphabeta' | 'neural',
  value: EngineAnalysis | null,
): EngineReading => ({
  engineId: id,
  name: id,
  family,
  analysis: value,
});

describe('agreement on the top move', () => {
  it('reports agreement when both engines lead with the same move', () => {
    const result = compareEngines([
      reading('sf', 'alphabeta', analysis([{ move: 'e2e4', score: cp(30) }])),
      reading('lc0', 'neural', analysis([{ move: 'e2e4', score: cp(18) }])),
    ]);
    expect(result.topMove).toBe('agree');
    expect(result.evaluationGapCp).toBe(12);
  });

  it('reports a difference when they lead with different moves', () => {
    const result = compareEngines([
      reading('sf', 'alphabeta', analysis([{ move: 'g1f3', score: cp(31) }])),
      reading('lc0', 'neural', analysis([{ move: 'c2c4', score: cp(12) }])),
    ]);
    expect(result.topMove).toBe('differ');
    expect(result.topMoves).toEqual([asUci('g1f3'), asUci('c2c4')]);
  });

  it('says nothing until both engines have answered', () => {
    const result = compareEngines([
      reading('sf', 'alphabeta', analysis([{ move: 'e2e4', score: cp(30) }])),
      reading('lc0', 'neural', null),
    ]);
    expect(result.topMove).toBe('incomplete');
    expect(describeComparison(result)).toMatch(/waiting/i);
  });
});

describe('the evaluation gap', () => {
  it('refuses to subtract a mate from an evaluation', () => {
    const result = compareEngines([
      reading('sf', 'alphabeta', analysis([{ move: 'e2e4', score: mate(4) }])),
      reading('lc0', 'neural', analysis([{ move: 'e2e4', score: cp(250) }])),
    ]);
    expect(result.evaluationGapCp).toBeUndefined();
    expect(describeComparison(result)).not.toMatch(/\d+\.\d\d apart/);
  });

  it('is absolute, so the order of the engines does not change it', () => {
    const a = compareEngines([
      reading('sf', 'alphabeta', analysis([{ move: 'e2e4', score: cp(-40) }])),
      reading('lc0', 'neural', analysis([{ move: 'e2e4', score: cp(20) }])),
    ]);
    expect(a.evaluationGapCp).toBe(60);
  });
});

describe('principal variation divergence', () => {
  it('counts the plies two lines share before parting', () => {
    const result = compareEngines([
      reading(
        'sf',
        'alphabeta',
        analysis([{ move: 'e2e4', score: cp(20), pv: ['e2e4', 'e7e5', 'g1f3', 'b8c6'] }]),
      ),
      reading(
        'lc0',
        'neural',
        analysis([{ move: 'e2e4', score: cp(20), pv: ['e2e4', 'e7e5', 'f1c4'] }]),
      ),
    ]);
    expect(result.pvAgreementPlies).toBe(2);
  });

  it('is zero when the very first move differs', () => {
    const result = compareEngines([
      reading('sf', 'alphabeta', analysis([{ move: 'e2e4', score: cp(20) }])),
      reading('lc0', 'neural', analysis([{ move: 'd2d4', score: cp(20) }])),
    ]);
    expect(result.pvAgreementPlies).toBe(0);
  });
});

describe('the merged candidate list', () => {
  it('keeps a move only one engine considered, with a null for the other', () => {
    const result = compareEngines([
      reading(
        'sf',
        'alphabeta',
        analysis([
          { move: 'e2e4', score: cp(30) },
          { move: 'd2d4', score: cp(25) },
        ]),
      ),
      reading(
        'lc0',
        'neural',
        analysis([
          { move: 'e2e4', score: cp(20) },
          { move: 'c2c4', score: cp(15) },
        ]),
      ),
    ]);

    const moves = Object.fromEntries(result.moves.map((move) => [move.uci, move.ranks]));
    expect(moves[asUci('d2d4')]).toEqual({ sf: 2, lc0: null });
    expect(moves[asUci('c2c4')]).toEqual({ sf: null, lc0: 2 });
  });

  it('orders by the best placing either engine gave a move', () => {
    const result = compareEngines([
      reading(
        'sf',
        'alphabeta',
        analysis([
          { move: 'a2a3', score: cp(5) },
          { move: 'e2e4', score: cp(4) },
        ]),
      ),
      reading('lc0', 'neural', analysis([{ move: 'e2e4', score: cp(30) }])),
    ]);
    expect(result.moves[0]?.uci).toBe(asUci('a2a3'));
    expect(result.moves.map((move) => move.uci)).toContain(asUci('e2e4'));
  });

  it('describes agreement without inventing a verdict about the position', () => {
    const result = compareEngines([
      reading('sf', 'alphabeta', analysis([{ move: 'e2e4', score: cp(30) }])),
      reading('lc0', 'neural', analysis([{ move: 'e2e4', score: cp(18) }])),
    ]);
    const description = describeComparison(result);
    expect(description).toMatch(/same move/);
    expect(description).not.toMatch(/unclear|sharp|better|advantage/i);
  });
});
