/**
 * All 960, not a sample.
 *
 * There are exactly 960 arrangements and the suite is cheap, so every
 * structural claim is asserted over the whole set rather than over a handful
 * of interesting ones. A generator that is right for 959 positions and wrong
 * for one is a generator that produces an illegal position in a tournament.
 *
 * The one assertion that is not structural is that position 518 is the
 * ordinary chess start. That is the anchor: every structural property here
 * would still hold under a numbering Kingfisher had invented for itself, and
 * only agreement with the world's numbering makes "position 335" mean the same
 * thing here as it does in a broadcast.
 */

import { describe, expect, it } from 'vitest';

import {
  allChess960Arrangements,
  castlingSquares,
  CHESS960_COUNT,
  chess960Arrangement,
  chess960Fen,
  chess960Index,
  STANDARD_CHESS960_INDEX,
} from './chess960';
import { parseFen } from './fen';

const all = allChess960Arrangements();

describe('the numbering is the standard one', () => {
  it('puts ordinary chess at 518', () => {
    // The anchor. Every other test here would pass under a numbering invented
    // for this file; this one only passes under the world's.
    expect(chess960Arrangement(STANDARD_CHESS960_INDEX)?.join('')).toBe('rnbqkbnr');
    expect(STANDARD_CHESS960_INDEX).toBe(518);
  });

  it('recovers the number from the arrangement', () => {
    expect(chess960Index(['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'])).toBe(518);
  });

  it('round-trips every position through its number', () => {
    for (let index = 0; index < CHESS960_COUNT; index += 1) {
      const arrangement = chess960Arrangement(index);
      expect(arrangement, `no arrangement for ${index}`).not.toBeNull();
      expect(chess960Index(arrangement!), `index ${index}`).toBe(index);
    }
  });

  it('has no number for an arrangement outside the set', () => {
    // Bishops on the same colour — a and c are both dark. A legal-looking
    // back rank that is not one of the 960, and must not be quietly numbered.
    expect(chess960Index(['b', 'r', 'b', 'q', 'k', 'n', 'n', 'r'])).toBeNull();
    // King not between the rooks.
    expect(chess960Index(['k', 'r', 'b', 'q', 'n', 'b', 'n', 'r'])).toBeNull();
    // Wrong pieces entirely.
    expect(chess960Index(['r', 'n', 'b', 'q', 'q', 'b', 'n', 'r'])).toBeNull();
    expect(chess960Index(['r', 'n', 'b', 'q', 'k', 'b', 'n'])).toBeNull();
  });

  it('has no arrangement for a number outside 0–959', () => {
    for (const index of [-1, 960, 1000, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(chess960Arrangement(index), String(index)).toBeNull();
    }
  });
});

describe('the set is exactly the 960', () => {
  it('produces 960 arrangements', () => {
    expect(all).toHaveLength(CHESS960_COUNT);
  });

  it('produces no two the same', () => {
    expect(new Set(all.map((entry) => entry.join(''))).size).toBe(CHESS960_COUNT);
  });

  it('gives every one the right pieces', () => {
    for (const arrangement of all) {
      const counted = arrangement.reduce<Record<string, number>>((tally, piece) => {
        tally[piece] = (tally[piece] ?? 0) + 1;
        return tally;
      }, {});
      expect(counted, arrangement.join('')).toEqual({ r: 2, n: 2, b: 2, q: 1, k: 1 });
    }
  });

  it('puts the bishops on opposite colours, in every one', () => {
    for (const arrangement of all) {
      const bishops = arrangement.flatMap((piece, file) => (piece === 'b' ? [file] : []));
      // On the first rank, a/c/e/g are dark and b/d/f/h are light.
      expect(bishops[0]! % 2, arrangement.join('')).not.toBe(bishops[1]! % 2);
    }
  });

  it('puts the king strictly between the rooks, in every one', () => {
    for (const arrangement of all) {
      const squares = castlingSquares(arrangement);
      expect(squares, arrangement.join('')).not.toBeNull();
      expect(squares!.queensideRook).toBeLessThan(squares!.king);
      expect(squares!.king).toBeLessThan(squares!.kingsideRook);
    }
  });

  it('contains every arrangement that satisfies the constraints, and nothing else', () => {
    /*
      Enumerated independently of the generator: place the bishops on opposite
      colours, the queen anywhere free, the knights in any two of the rest, and
      rook-king-rook in what is left. If the two sets differ, one of them is
      wrong, and the disagreement says which position.
    */
    const enumerated = new Set<string>();
    for (const light of [1, 3, 5, 7]) {
      for (const dark of [0, 2, 4, 6]) {
        const afterBishops = [...Array(8).keys()].filter((file) => file !== light && file !== dark);
        for (const queen of afterBishops) {
          const afterQueen = afterBishops.filter((file) => file !== queen);
          for (let a = 0; a < afterQueen.length; a += 1) {
            for (let b = a + 1; b < afterQueen.length; b += 1) {
              const board = Array.from({ length: 8 }, () => '');
              board[light] = 'b';
              board[dark] = 'b';
              board[queen] = 'q';
              board[afterQueen[a]!] = 'n';
              board[afterQueen[b]!] = 'n';
              const rest = board.flatMap((piece, file) => (piece === '' ? [file] : []));
              board[rest[0]!] = 'r';
              board[rest[1]!] = 'k';
              board[rest[2]!] = 'r';
              enumerated.add(board.join(''));
            }
          }
        }
      }
    }
    expect(enumerated.size).toBe(CHESS960_COUNT);
    expect(new Set(all.map((entry) => entry.join('')))).toEqual(enumerated);
  });
});

describe('the starting FEN for a position', () => {
  it('writes castling rights as the files the rooks stand on', () => {
    /*
      Shredder-FEN. In Chess960 "kingside" is not a square, it is whichever
      rook is to the king's right, so the right has to name the rook — the same
      reasoning src/chess/fen.ts already applies to standard chess.
    */
    expect(chess960Fen(STANDARD_CHESS960_INDEX)).toBe(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w HAha - 0 1',
    );
  });

  it('names the right rooks for a shuffled position', () => {
    // Bishops on a (dark) and d (light), king on e, rooks on b and h.
    const index = chess960Index(['b', 'r', 'q', 'b', 'k', 'n', 'n', 'r'])!;
    // The rights are H for the kingside rook and B for the queenside one —
    // not K and Q, which would name squares neither rook is on.
    expect(chess960Fen(index)).toBe('brqbknnr/pppppppp/8/8/8/8/PPPPPPPP/BRQBKNNR w HBhb - 0 1');
  });

  it('mirrors Black onto White in every one', () => {
    for (let index = 0; index < CHESS960_COUNT; index += 1) {
      const fen = chess960Fen(index)!;
      const ranks = fen.split(' ')[0]!.split('/');
      expect(ranks[7], String(index)).toBe(ranks[0]!.toUpperCase());
      expect(ranks[1]).toBe('pppppppp');
      expect(ranks[6]).toBe('PPPPPPPP');
    }
  });

  it('gives every position a board Kingfisher can already read', () => {
    // The board itself is ordinary. With no castling rights claimed, every one
    // of the 960 parses today.
    for (let index = 0; index < CHESS960_COUNT; index += 1) {
      const board = chess960Fen(index)!.replace(/ [A-Ha-h]{4} /, ' - ');
      expect(parseFen(board).ok, `${index}: ${board}`).toBe(true);
    }
  });

  it('is rejected today for its castling rights, which is the parser being right', () => {
    /*
      Two findings, and neither is a defect in this module.

      Kingfisher's FEN parser does not understand the Shredder castling field.
      It has never had to: standard chess has one spelling of a castling right
      and this is the other one. That is the first thing full Chess960 support
      needs, and ADR 0048 records it.

      More interestingly, the parser *also* rejects a shuffled position whose
      rights are written the standard way — `KQkq` on a board with the king on
      g and the rooks on f and h. It is right to. ADR 0047 established that a
      castling right is a claim about where two pieces stand and that an
      unchecked claim produced an illegal move offered as legal, so the parser
      checks it, and for 959 of the 960 positions the standard spelling is a
      false claim. There is no shortcut here: Chess960 needs the rights to name
      the rooks, because in Chess960 that is what a castling right is.
    */
    // Position 0 is BBQNNRKR: king on g, rooks on f and h.
    const shuffled = chess960Fen(0)!;
    expect(shuffled).toContain(' HFhf ');
    expect(parseFen(shuffled).ok).toBe(false);
    expect(parseFen(shuffled.replace(' HFhf ', ' KQkq ')).ok).toBe(false);

    // The ordinary position is the one case where the standard spelling is
    // true, and it parses.
    const standard = chess960Fen(STANDARD_CHESS960_INDEX)!;
    expect(parseFen(standard.replace(' HAha ', ' KQkq ')).ok).toBe(true);
  });

  it('has no FEN for a number outside the set', () => {
    expect(chess960Fen(-1)).toBeNull();
    expect(chess960Fen(960)).toBeNull();
  });
});

describe('where castling starts from', () => {
  it('reports the king and both rooks', () => {
    expect(castlingSquares(['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'])).toEqual({
      king: 4,
      queensideRook: 0,
      kingsideRook: 7,
    });
  });

  it('reports a back rank where the king and a rook are adjacent', () => {
    // The case standard chess never produces, and the one where castling
    // moves a piece zero squares: king on g, rook on h.
    const arrangement = chess960Arrangement(
      chess960Index(['r', 'q', 'n', 'b', 'b', 'n', 'k', 'r'])!,
    )!;
    expect(castlingSquares(arrangement)).toEqual({
      king: 6,
      queensideRook: 0,
      kingsideRook: 7,
    });
  });

  it('reports nothing for a back rank that is not one of the 960', () => {
    expect(castlingSquares(['k', 'r', 'b', 'q', 'n', 'b', 'n', 'r'])).toBeNull();
    expect(castlingSquares(['r', 'n', 'b', 'q', 'q', 'b', 'n', 'r'])).toBeNull();
  });
});
