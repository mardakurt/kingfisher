import { describe, expect, it } from 'vitest';

import { comparePositions } from './compare';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
// 1.d4 d5 2.c4 dxc4 3.e4 — Black has taken on c4.
const QGA = 'rnbqkbnr/ppp1pppp/8/8/2pPP3/8/PP3PPP/RNBQKBNR b KQkq - 0 3';
// 1.d4 d5 2.c4 e6 3.cxd5 exd5 — the Carlsbad structure.
const CARLSBAD = 'rnbqkbnr/ppp2ppp/8/3p4/3P4/8/PP2PPPP/RNBQKBNR w KQkq - 0 4';

describe('comparePositions', () => {
  it('finds nothing different between a position and itself', () => {
    const same = comparePositions(START, START)!;
    expect(same.samePosition).toBe(true);
    expect(same.differingSquares).toEqual([]);
    expect(same.onlyFirst).toEqual([]);
    expect(same.onlySecond).toEqual([]);
  });

  it('names every square whose occupant differs', () => {
    const result = comparePositions(START, QGA)!;
    expect(result.samePosition).toBe(false);
    expect(result.sameSideToMove).toBe(false);
    // c2, d2 and e2 emptied; c4, d4 and e4 filled; d7 emptied.
    expect([...result.differingSquares].sort()).toEqual(['c2', 'c4', 'd2', 'd4', 'd7', 'e2', 'e4']);
  });

  it('splits the structural facts into shared and one-sided', () => {
    const result = comparePositions(QGA, CARLSBAD)!;
    // White's c-pawn is gone in both, so that half-open file is shared.
    expect(result.shared).toContain('White semi-open c-file');
    // Only the accepted gambit has Black's pawns on c7 and c4; only the
    // Carlsbad has Black's e-file half-open, after ...exd5.
    expect(result.onlyFirst).toContain('Black doubled c-pawns');
    expect(result.onlySecond).toEqual(['Black semi-open e-file']);
    // Nothing is listed twice: a fact is shared, or it belongs to one side.
    for (const fact of result.shared) {
      expect(result.onlyFirst).not.toContain(fact);
      expect(result.onlySecond).not.toContain(fact);
    }
  });

  it('refuses a position it cannot read', () => {
    expect(comparePositions(START, 'not a fen')).toBeNull();
  });
});
