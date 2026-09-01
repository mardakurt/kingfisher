import { describe, expect, it } from 'vitest';

import { formatFen, parseFen, positionKey, START_FEN } from './fen';
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
    const parts = unwrap(parseFen('8/8/8/8/8/8/4K3/4k3 w - -'));
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
