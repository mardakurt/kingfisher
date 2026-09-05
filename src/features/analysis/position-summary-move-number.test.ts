/**
 * The move number on the workspace status line.
 *
 * `moveNumberOfPly` answers "which move was ply N?", which is what a move list
 * needs. The status line asks a different question — "which move is about to be
 * played?" — and using the first answer for the second is wrong on every White
 * move: in the position after 1.e4 e5 it read "White to play move 1", when
 * White had finished move 1 and was about to play move 2.
 */

import { describe, expect, it } from 'vitest';

import { moveNumberOfPly } from '@/chess/tree/types';

/** What PositionSummary renders beside "White to play" / "Black to play". */
const displayed = (plyOfMoveThatLedHere: number) => moveNumberOfPly(plyOfMoveThatLedHere + 1);

describe('the move number a player is about to play', () => {
  it('is the next move, not the one just made', () => {
    // After 1.e4 — Black to play, still move 1.
    expect(displayed(1)).toBe(1);
    // After 1.e4 e5 — White to play move 2. This was the defect.
    expect(displayed(2)).toBe(2);
    // After 1.e4 e5 2.Nf3 — Black to play, move 2.
    expect(displayed(3)).toBe(2);
    // After 1.e4 e5 2.Nf3 Nc6 — White to play move 3.
    expect(displayed(4)).toBe(3);
  });

  it('advances once per full move, never twice', () => {
    const seen = Array.from({ length: 21 }, (_, ply) => displayed(ply));
    // Ply 0 is the start; White is about to play move 1.
    expect(seen[0]).toBe(1);
    for (let ply = 1; ply <= 20; ply += 1) {
      const number = seen[ply] as number;
      expect(number).toBe(Math.floor(ply / 2) + 1);
      // Never goes backwards, and never jumps.
      expect(number - (seen[ply - 1] as number)).toBeLessThanOrEqual(1);
    }
  });

  it('still numbers a played move by the move list’s rule', () => {
    // The other reading is unchanged: ply 1 and ply 2 are both move 1.
    expect(moveNumberOfPly(1)).toBe(1);
    expect(moveNumberOfPly(2)).toBe(1);
    expect(moveNumberOfPly(3)).toBe(2);
  });
});
