import { describe, expect, it } from 'vitest';

import { START_FEN, formatFen, parseFen, positionKey, withoutImpossibleCastling } from './fen';
import { expect as unwrap } from './result';
import { squareIndex } from './board';

describe('parseFen', () => {
  it('reads the start position', () => {
    const parts = unwrap(parseFen(START_FEN));
    expect(parts.turn).toBe('w');
    expect(parts.fullmoveNumber).toBe(1);
    expect(parts.halfmoveClock).toBe(0);
    expect(parts.epSquare).toBeNull();
    expect(parts.castling).toEqual({
      whiteKing: true,
      whiteQueen: true,
      blackKing: true,
      blackQueen: true,
    });
    expect(parts.board[squareIndex('e1')]).toEqual({ color: 'w', type: 'k' });
    expect(parts.board[squareIndex('d8')]).toEqual({ color: 'b', type: 'q' });
    expect(parts.board[squareIndex('e4')]).toBeNull();
  });

  it('accepts a four-field FEN and defaults the counters', () => {
    const parts = unwrap(parseFen('4k3/8/8/8/8/8/8/4K3 w - -'));
    expect(parts.halfmoveClock).toBe(0);
    expect(parts.fullmoveNumber).toBe(1);
  });

  it.each([
    ['', 'empty'],
    ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP w KQkq - 0 1', 'seven ranks'],
    ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNX w KQkq - 0 1', 'unknown piece'],
    ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBN w KQkq - 0 1', 'short rank'],
    ['4k3/8/8/8/8/8/8/8 w - - 0 1', 'missing white king'],
    ['4k3/8/8/8/8/8/8/4K2K w - - 0 1', 'two white kings'],
    ['4k3/8/8/8/8/8/8/P3K3 w - - 0 1', 'pawn on the first rank'],
    ['4k3/8/8/8/8/8/8/4K3 x - - 0 1', 'bad side to move'],
    ['4k3/8/8/8/8/8/8/4K3 w KQxq - 0 1', 'bad castling field'],
    ['4k3/8/8/8/8/8/8/4K3 w - e4 0 1', 'impossible en passant square'],
    ['4k3/8/8/8/8/8/8/4K3 w - - x 1', 'non-numeric halfmove clock'],
    ['44p/8/8/8/8/8/8/4K2k w - - 0 1', 'a ninth square after eight empties'],
    ['8K/8/8/8/8/8/8/4K2k w - - 0 1', 'a ninth square after a full rank'],
    ['rnbqkbnrp/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'nine pieces on one rank'],
  ])('rejects %s (%s)', (fen) => {
    expect(parseFen(fen).ok).toBe(false);
  });

  it('accepts an en passant square only on the right rank', () => {
    expect(parseFen('4k3/8/8/8/4p3/8/8/4K3 w - e6 0 1').ok).toBe(true);
    expect(parseFen('4k3/8/8/8/4p3/8/8/4K3 b - e6 0 1').ok).toBe(false);
  });
});

describe('formatFen', () => {
  it('round-trips every field', () => {
    const samples = [
      START_FEN,
      'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
      '8/8/8/3k4/8/3K4/8/8 w - - 12 45',
      'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2',
    ];
    for (const fen of samples) {
      expect(formatFen(unwrap(parseFen(fen)))).toBe(fen);
    }
  });
});

describe('positionKey', () => {
  it('ignores the move counters so transpositions match', () => {
    expect(positionKey('8/8/8/3k4/8/3K4/8/8 w - - 12 45')).toBe(
      positionKey('8/8/8/3k4/8/3K4/8/8 w - - 0 1'),
    );
  });
});

describe('withoutImpossibleCastling', () => {
  it('drops only the rights the pieces cannot support, and names them', () => {
    expect(withoutImpossibleCastling('4k3/8/8/8/8/8/8/4K2R w KQ - 0 1')).toEqual({
      fen: '4k3/8/8/8/8/8/8/4K2R w K - 0 1',
      removed: 'Q',
    });
    expect(withoutImpossibleCastling('r3k3/8/8/8/8/8/8/4K3 w KQkq - 0 1')).toEqual({
      fen: 'r3k3/8/8/8/8/8/8/4K3 w q - 0 1',
      removed: 'KQk',
    });
    expect(withoutImpossibleCastling('4k3/8/8/8/8/8/8/R3K3 b Kk - 3 40')).toEqual({
      fen: '4k3/8/8/8/8/8/8/R3K3 b - - 3 40',
      removed: 'Kk',
    });
  });

  it('offers nothing when the rights are possible or the FEN is wrong for another reason', () => {
    expect(withoutImpossibleCastling('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')).toBeNull();
    expect(withoutImpossibleCastling('4k3/8/8/8/8/8/8/4K2R w KQ - 0 1 extra field')).toBeNull();
    // Two white kings are not cured by removing a castling right.
    expect(withoutImpossibleCastling('4k3/8/8/8/8/8/8/K3K2R w KQ - 0 1')).toBeNull();
  });
});
