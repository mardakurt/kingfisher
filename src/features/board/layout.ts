/**
 * Piece placement and identity tracking for the board.
 *
 * A chess position is a set of squares, but an *animated* board needs to know
 * which piece on the new board is the same piece as one on the old board.
 * Matching by square alone would make every move a disappear-and-reappear; this
 * carries identity across a move, including the rook in a castle and the pawn
 * that becomes a queen.
 */

import { squareAt } from '@/chess/board';
import type { ChessMove, Piece, Square } from '@/chess/types';

export interface PlacedPiece {
  /** Stable across positions for as long as the piece stays on the board. */
  readonly key: string;
  readonly piece: Piece;
  readonly square: Square;
}

export interface TrackerState {
  readonly pieces: readonly PlacedPiece[];
  readonly nextKey: number;
}

export const EMPTY_TRACKER: TrackerState = { pieces: [], nextKey: 1 };

/** Where the rook starts and ends when the king castles. */
function castlingRook(move: ChessMove): { from: Square; to: Square } | null {
  if (!move.flags.kingsideCastle && !move.flags.queensideCastle) return null;
  const rank = move.color === 'w' ? '1' : '8';
  return move.flags.kingsideCastle
    ? { from: `h${rank}` as Square, to: `f${rank}` as Square }
    : { from: `a${rank}` as Square, to: `d${rank}` as Square };
}

export function trackPieces(
  previous: TrackerState,
  board: readonly (Piece | null)[],
  move: ChessMove | null,
): TrackerState {
  const bySquare = new Map(previous.pieces.map((placed) => [placed.square, placed]));
  const used = new Set<string>();
  const pieces: PlacedPiece[] = [];
  const pending: { piece: Piece; square: Square }[] = [];
  let nextKey = previous.nextKey;

  for (let index = 0; index < 64; index += 1) {
    const piece = board[index];
    if (!piece) continue;
    const square = squareAt(index);
    const existing = bySquare.get(square);

    if (existing && existing.piece.color === piece.color && existing.piece.type === piece.type) {
      pieces.push({ key: existing.key, piece, square });
      used.add(existing.key);
    } else {
      pending.push({ piece, square });
    }
  }

  const rook = move ? castlingRook(move) : null;

  for (const { piece, square } of pending) {
    let origin: Square | null = null;
    if (move && square === move.to) origin = move.from;
    else if (rook && square === rook.to) origin = rook.from;

    const source = origin ? bySquare.get(origin) : undefined;
    if (source && !used.has(source.key) && source.piece.color === piece.color) {
      pieces.push({ key: source.key, piece, square });
      used.add(source.key);
      continue;
    }

    const key = `p${nextKey++}`;
    pieces.push({ key, piece, square });
  }

  return { pieces, nextKey };
}

/** Percentage offsets for a square, given the side shown at the bottom. */
export function squareOffset(square: Square, orientation: 'w' | 'b'): { x: number; y: number } {
  const file = square.charCodeAt(0) - 97;
  const rank = square.charCodeAt(1) - 49;
  return orientation === 'w'
    ? { x: file * 100, y: (7 - rank) * 100 }
    : { x: (7 - file) * 100, y: rank * 100 };
}

/** Which square a pointer at (0…1, 0…1) board coordinates is over. */
export function squareFromPoint(x: number, y: number, orientation: 'w' | 'b'): Square | null {
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  const column = Math.min(7, Math.max(0, Math.floor(x * 8)));
  const row = Math.min(7, Math.max(0, Math.floor(y * 8)));
  const file = orientation === 'w' ? column : 7 - column;
  const rank = orientation === 'w' ? 7 - row : row;
  return `${'abcdefgh'[file]}${rank + 1}` as Square;
}
