import { describe, expect, it } from 'vitest';

import type { ChessMove, Piece, Square } from '@/chess/types';

import { EMPTY_TRACKER, squareFromPoint, squareOffset, trackPieces } from './layout';

describe('board coordinate conversion', () => {
  it('places corner squares for White orientation', () => {
    expect(squareOffset('a1', 'w')).toEqual({ x: 0, y: 700 });
    expect(squareOffset('h8', 'w')).toEqual({ x: 700, y: 0 });
  });

  it('places corner squares for Black orientation', () => {
    expect(squareOffset('a1', 'b')).toEqual({ x: 700, y: 0 });
    expect(squareOffset('h8', 'b')).toEqual({ x: 0, y: 700 });
  });

  it('maps pointer positions through both orientations', () => {
    expect(squareFromPoint(0.06, 0.06, 'w')).toBe('a8');
    expect(squareFromPoint(0.06, 0.06, 'b')).toBe('h1');
    expect(squareFromPoint(0.56, 0.81, 'w')).toBe('e2');
    expect(squareFromPoint(0.56, 0.81, 'b')).toBe('d7');
  });

  it('accepts exact board edges and rejects points outside', () => {
    expect(squareFromPoint(1, 1, 'w')).toBe('h1');
    expect(squareFromPoint(-0.001, 0.5, 'w')).toBeNull();
    expect(squareFromPoint(0.5, 1.001, 'b')).toBeNull();
  });
});

describe('piece identity tracking', () => {
  it('preserves the moving piece identity', () => {
    const initial = trackPieces(EMPTY_TRACKER, boardWith(['e2', { color: 'w', type: 'p' }]), null);
    const moved = trackPieces(
      initial,
      boardWith(['e4', { color: 'w', type: 'p' }]),
      move({ from: 'e2', to: 'e4' }),
    );

    expect(moved.pieces[0]?.key).toBe(initial.pieces[0]?.key);
    expect(moved.pieces[0]?.square).toBe('e4');
  });

  it('preserves the pawn identity through promotion', () => {
    const initial = trackPieces(EMPTY_TRACKER, boardWith(['a7', { color: 'w', type: 'p' }]), null);
    const promoted = trackPieces(
      initial,
      boardWith(['a8', { color: 'w', type: 'q' }]),
      move({ from: 'a7', to: 'a8' }),
    );

    expect(promoted.pieces[0]).toMatchObject({ key: initial.pieces[0]?.key, square: 'a8' });
  });

  it('moves king and rook identities together when castling', () => {
    const initial = trackPieces(
      EMPTY_TRACKER,
      boardWith(['e1', { color: 'w', type: 'k' }], ['h1', { color: 'w', type: 'r' }]),
      null,
    );
    const castled = trackPieces(
      initial,
      boardWith(['g1', { color: 'w', type: 'k' }], ['f1', { color: 'w', type: 'r' }]),
      move({ from: 'e1', to: 'g1', kingsideCastle: true }),
    );

    const originalKing = initial.pieces.find((placed) => placed.piece.type === 'k');
    const originalRook = initial.pieces.find((placed) => placed.piece.type === 'r');
    expect(castled.pieces.find((placed) => placed.square === 'g1')?.key).toBe(originalKing?.key);
    expect(castled.pieces.find((placed) => placed.square === 'f1')?.key).toBe(originalRook?.key);
  });
});

function boardWith(...entries: readonly [Square, Piece][]): readonly (Piece | null)[] {
  const board: (Piece | null)[] = Array.from({ length: 64 }, () => null);
  for (const [square, piece] of entries) {
    const file = square.charCodeAt(0) - 97;
    const rank = square.charCodeAt(1) - 49;
    board[rank * 8 + file] = piece;
  }
  return board;
}

function move({
  from,
  to,
  kingsideCastle = false,
}: {
  from: Square;
  to: Square;
  kingsideCastle?: boolean;
}): ChessMove {
  return {
    from,
    to,
    color: 'w',
    flags: {
      kingsideCastle,
      queensideCastle: false,
    },
  } as ChessMove;
}
