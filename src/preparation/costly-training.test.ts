import { describe, expect, it } from 'vitest';

import { positionKey, START_FEN } from '@/chess/fen';
import type { Fen } from '@/chess/types';

import type { CostlyMove } from './costly-moves';
import { drillsFromCostlyMoves } from './costly-training';

// After 1.e4 e5 2.Nf3 Nc6 3.Bc4: Black to move.
const ITALIAN = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3' as Fen;

const move = (overrides: Partial<CostlyMove>): CostlyMove => ({
  gameId: 'game-1',
  white: 'Anand',
  black: 'Carlsen',
  date: '2013.11.12',
  event: 'World Championship',
  nodeId: 'n1',
  ply: 5,
  label: '3...',
  playedSan: 'd6',
  bestSan: 'Nf6',
  before: { kind: 'cp', cp: 20 },
  after: { kind: 'cp', cp: 60 },
  cost: 0.12,
  phase: 'opening',
  colour: 'b',
  fenBefore: ITALIAN,
  depth: 22,
  ...overrides,
});

describe('drillsFromCostlyMoves', () => {
  it('puts the position before the mistake on the board and accepts the engine’s move', () => {
    const [drill] = drillsFromCostlyMoves([move({})]);
    expect(drill).toMatchObject({
      positionKey: positionKey(ITALIAN),
      fen: ITALIAN,
      sideToMove: 'b',
      solutionUci: ['g8f6'],
      solutionSan: ['Nf6'],
      tags: ['costly-move', 'opening'],
      source: { kind: 'game', id: 'game-1', nodeId: 'n1' },
    });
    expect(drill!.explanation).toBe(
      'In Anand – Carlsen, World Championship, 2013, d6 was played here. The engine preferred Nf6 at depth 22; the move played gave up about 12 percentage points of winning chances.',
    );
  });

  it('makes no drill where there is nothing better to find', () => {
    expect(drillsFromCostlyMoves([move({ bestSan: undefined })])).toEqual([]);
    expect(drillsFromCostlyMoves([move({ bestSan: 'd6' })])).toEqual([]);
    expect(drillsFromCostlyMoves([move({ fenBefore: undefined })])).toEqual([]);
  });

  it('refuses an engine move that is not legal in the position', () => {
    expect(drillsFromCostlyMoves([move({ bestSan: 'Qxf7' })])).toEqual([]);
  });

  it('keeps one drill per position, the costlier occasion, and orders by cost', () => {
    const drills = drillsFromCostlyMoves([
      move({ gameId: 'a', cost: 0.11 }),
      move({ gameId: 'b', cost: 0.3 }),
      move({
        gameId: 'c',
        fenBefore: START_FEN,
        colour: 'w',
        playedSan: 'a4',
        bestSan: 'e4',
        cost: 0.05,
      }),
    ]);
    expect(drills.map((drill) => drill.source.id)).toEqual(['b', 'c']);
  });
});
