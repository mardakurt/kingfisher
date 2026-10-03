import { describe, expect, it } from 'vitest';

import { START_FEN } from '@/chess/fen';

import { computeReferenceArrows } from './reference-arrows';

const moves = [
  { uci: 'e2e4', san: 'e4', share: 0.48 },
  { uci: 'd2d4', san: 'd4', share: 0.32 },
  { uci: 'g1f3', san: 'Nf3', share: 0.11 },
  { uci: 'c2c4', san: 'c4', share: 0.07 },
  { uci: 'b2b3', san: 'b3', share: 0.01 },
];

describe('computeReferenceArrows', () => {
  it('draws the common moves, widest for the most played', () => {
    const arrows = computeReferenceArrows({
      fen: START_FEN,
      boardFen: START_FEN,
      moves,
      hovered: null,
      show: true,
    });
    expect(arrows.map((arrow) => arrow.san)).toEqual(['e4', 'd4', 'Nf3', 'c4']);
    expect(arrows[0]!.width).toBeGreaterThan(arrows[3]!.width);
    expect(arrows[0]).toMatchObject({ from: 'e2', to: 'e4' });
  });

  it('draws only the hovered move when the setting is off, rare or not', () => {
    const arrows = computeReferenceArrows({
      fen: START_FEN,
      boardFen: START_FEN,
      moves,
      hovered: 'b2b3',
      show: false,
    });
    expect(arrows).toEqual([expect.objectContaining({ san: 'b3', hovered: true })]);
  });

  it('draws nothing for an answer about another position', () => {
    const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    expect(
      computeReferenceArrows({
        fen: START_FEN,
        boardFen: afterE4,
        moves,
        hovered: 'e2e4',
        show: true,
      }),
    ).toEqual([]);
  });
});
