import { describe, expect, it } from 'vitest';

import { START_FEN } from './fen';
import { Position } from './position';
import { isOk } from './result';
import { asFen } from './types';

/**
 * `advanceSan` exists for speed, so the only thing worth testing is that it
 * bought speed and nothing else: the same move, the same resulting position,
 * and a position that is still able to answer questions after giving its rules
 * engine away.
 */
const advance = (position: Position, san: string) => {
  const played = position.advanceSan(san);
  if (!isOk(played)) throw new Error(`${san} was refused`);
  return played.value;
};

describe('Position.advanceSan', () => {
  it('agrees with playSan on move, SAN, UCI and resulting FEN', () => {
    let carried = Position.fromTrustedFen(START_FEN);
    let rebuilt = Position.fromTrustedFen(START_FEN);
    const line = ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'];

    for (const san of line) {
      const viaAdvance = advance(carried, san);
      const viaPlay = rebuilt.playSan(san);
      if (!isOk(viaPlay)) throw new Error(`${san} was refused by playSan`);

      expect(viaAdvance.move).toEqual(viaPlay.value);
      expect(viaAdvance.next.fen).toBe(viaPlay.value.after);
      carried = viaAdvance.next;
      rebuilt = Position.fromTrustedFen(viaPlay.value.after);
    }

    expect(carried.fen).toBe(rebuilt.fen);
    // The carried position gave its engine away eight times over; it must still
    // be able to build a new one on demand.
    expect(carried.legalMoves().length).toBe(rebuilt.legalMoves().length);
    expect(carried.turn).toBe('w');
  });

  it('keeps castling, en passant and promotion identical to playSan', () => {
    const cases = [
      { fen: asFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'), san: 'O-O-O' },
      {
        fen: asFen('rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3'),
        san: 'exf6',
      },
      { fen: asFen('8/P7/8/8/8/8/7k/K7 w - - 0 1'), san: 'a8=Q' },
    ] as const;

    for (const { fen, san } of cases) {
      const source = Position.fromTrustedFen(fen);
      const expected = source.playSan(san);
      if (!isOk(expected)) throw new Error(`${san} was refused by playSan in ${fen}`);
      const actual = advance(Position.fromTrustedFen(fen), san);
      expect(actual.move).toEqual(expected.value);
      expect(actual.next.fen).toBe(expected.value.after);
    }
  });

  it('refuses an illegal move and leaves the position usable', () => {
    const position = Position.fromTrustedFen(START_FEN);
    // Warm the engine first, so the failure path has one to hand back.
    expect(position.legalMoves()).toHaveLength(20);

    const refused = position.advanceSan('e5');
    expect(refused.ok).toBe(false);

    expect(position.fen).toBe(START_FEN);
    expect(position.legalMoves()).toHaveLength(20);
    expect(advance(position, 'e4').next.fen).toBe(
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    );
  });
});
