import { describe, expect, it } from 'vitest';

import { asFen } from '@/chess/types';

import { normalize, toCategory } from './lichess';
import { describeCategory, eligibleForTablebase, moveRank } from './types';

const FEN = asFen('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1');

describe('eligibility', () => {
  it('asks only about positions the source can answer', () => {
    expect(eligibleForTablebase(3, 7)).toBe(true);
    expect(eligibleForTablebase(7, 7)).toBe(true);
    expect(eligibleForTablebase(8, 7)).toBe(false);
    expect(eligibleForTablebase(32, 7)).toBe(false);
  });

  it('rejects a board with fewer than two pieces', () => {
    expect(eligibleForTablebase(1, 7)).toBe(false);
  });
});

describe('categories', () => {
  it('keeps the two the fifty-move rule creates as distinct results', () => {
    expect(describeCategory('cursed-win')).toMatch(/fifty-move/);
    expect(describeCategory('blessed-loss')).toMatch(/fifty-move/);
    expect(describeCategory('win')).toBe('Win');
  });

  it('falls back to a draw rather than inventing a category', () => {
    expect(toCategory('something-new')).toBe('draw');
    expect(toCategory('cursed-win')).toBe('cursed-win');
  });
});

describe('normalising a response', () => {
  const payload = {
    category: 'win',
    dtz: 9,
    dtm: 43,
    checkmate: false,
    stalemate: false,
    moves: [
      {
        uci: 'e1d2',
        san: 'Kd2',
        category: 'draw',
        dtz: 0,
        dtm: null,
        zeroing: false,
        checkmate: false,
        stalemate: false,
      },
      {
        uci: 'e2e4',
        san: 'e4',
        category: 'loss',
        dtz: -20,
        dtm: -41,
        zeroing: true,
        checkmate: false,
        stalemate: false,
      },
      {
        uci: 'e1e2',
        san: 'Ke2',
        category: 'loss',
        dtz: -8,
        dtm: -39,
        zeroing: false,
        checkmate: false,
        stalemate: false,
      },
    ],
  };

  it('reports the result for the side to move', () => {
    const result = normalize(FEN, payload, 'test');
    expect(result.category).toBe('win');
    expect(result.dtz).toBe(9);
    expect(result.dtm).toBe(43);
    expect(result.source).toBe('test');
  });

  /**
   * A move's category is stated from the *opponent's* view after it is played,
   * so the moves that lose for them are the winning moves. Getting this
   * backwards would recommend the worst move on the board.
   */
  it('puts the moves that lose for the opponent first', () => {
    const result = normalize(FEN, payload, 'test');
    expect(result.moves.map((move) => move.san)).toEqual(['Ke2', 'e4', 'Kd2']);
  });

  it('breaks ties inside a category by the faster conversion', () => {
    const result = normalize(FEN, payload, 'test');
    expect(result.moves[0]?.dtz).toBe(-8);
    expect(result.moves[1]?.dtz).toBe(-20);
  });

  it('never converts a result into centipawns', () => {
    const result = normalize(FEN, payload, 'test');
    expect(Object.keys(result)).not.toContain('score');
    expect(Object.keys(result)).not.toContain('centipawns');
  });

  it('survives a response with no moves', () => {
    const result = normalize(FEN, { ...payload, moves: undefined }, 'test');
    expect(result.moves).toEqual([]);
  });

  it('orders checkmate ahead of everything', () => {
    expect(moveRank('checkmate')).toBeLessThan(moveRank('loss'));
  });
});
