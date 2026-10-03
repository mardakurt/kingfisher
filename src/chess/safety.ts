/**
 * Which pieces can be won, and what the side not to move threatens.
 *
 * ChessBase and Fritz colour the pieces that are in danger and can show "the
 * threat" — the move the opponent would play if it were their turn. Both are
 * cheap to compute and easy to state falsely, so this module says exactly what
 * it computes:
 *
 * - **Static exchange evaluation** on one square: both sides capture there
 *   with their least valuable attacker, in turn, either side free to stop when
 *   continuing would lose material. Attackers revealed behind a capturing
 *   slider (an x-ray: a rook behind a rook, a bishop behind a queen) join the
 *   exchange. Pins and checks are **not** considered — a pinned piece is
 *   counted as an attacker — so the result is a material count over one
 *   square, never an evaluation of the position, and it is labelled that way.
 * - **En prise**: a piece the opponent wins material by capturing (exchange
 *   value above zero). **Loose**: a piece nobody defends, attacked or not.
 * - **The threat** is not computed here at all. `nullMoveFen` gives the
 *   position with the turn passed, and an engine is asked what it would play;
 *   a position in which the side to move is in check has no such position,
 *   and the function says so by returning null.
 *
 * Values are the conventional 1/3/3/5/9. The king never "loses" an exchange:
 * it may take only when nothing defends the square, and is never taken.
 */

import { SQUARES, squareIndex } from './board';
import { formatFen, type FenParts } from './fen';
import { attackedSquares } from './relations';
import type { Color, Fen, Piece, PieceType, Square } from './types';

export const PIECE_VALUES: Readonly<Record<PieceType, number>> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 1000,
};

const opposite = (color: Color): Color => (color === 'w' ? 'b' : 'w');

/** A copy of the board with one piece removed, for the next round of an exchange. */
const without = (parts: FenParts, square: Square): FenParts => {
  const board = [...parts.board];
  board[squareIndex(square)] = null;
  return { ...parts, board };
};

const withPiece = (parts: FenParts, square: Square, piece: Piece): FenParts => {
  const board = [...parts.board];
  board[squareIndex(square)] = piece;
  return { ...parts, board };
};

/** Every square holding a `color` piece that attacks `target` on this board. */
export function attackersOf(parts: FenParts, target: Square, color: Color): Square[] {
  const result: Square[] = [];
  for (const square of SQUARES) {
    const piece = parts.board[squareIndex(square)];
    if (!piece || piece.color !== color) continue;
    if (attackedSquares(parts, square).includes(target)) result.push(square);
  }
  return result;
}

const leastValuable = (parts: FenParts, squares: readonly Square[]): Square | null => {
  let best: Square | null = null;
  let value = Infinity;
  for (const square of squares) {
    const piece = parts.board[squareIndex(square)]!;
    if (PIECE_VALUES[piece.type] < value) {
      value = PIECE_VALUES[piece.type];
      best = square;
    }
  }
  return best;
};

/**
 * Material `by` gains, in pawns, by starting an exchange on `target` with its
 * least valuable attacker (0 when it has none, or when starting would lose).
 * The piece on `target` must belong to the other side.
 */
export function staticExchange(parts: FenParts, target: Square, by: Color): number {
  const victim = parts.board[squareIndex(target)];
  if (!victim || victim.color === by) return 0;
  // gains[i]: the value captured by the i-th capture, from that capturer's side.
  const gains: number[] = [];
  let board = parts;
  let side = by;
  let onSquare: Piece = victim;
  for (;;) {
    const attackers = attackersOf(board, target, side);
    const from = leastValuable(board, attackers);
    if (!from) break;
    const attacker = board.board[squareIndex(from)]!;
    // A king may take only when nothing would recapture.
    if (attacker.type === 'k') {
      const after = withPiece(without(board, from), target, attacker);
      if (attackersOf(after, target, opposite(side)).length > 0) break;
    }
    gains.push(PIECE_VALUES[onSquare.type]);
    if (onSquare.type === 'k') break;
    board = withPiece(without(board, from), target, attacker);
    onSquare = attacker;
    side = opposite(side);
  }
  // Fold back from the end: each side takes only if it does not lose by it.
  let value = 0;
  for (let i = gains.length - 1; i >= 0; i -= 1) value = Math.max(0, gains[i]! - value);
  return value;
}

export interface PieceSafety {
  readonly square: Square;
  readonly piece: Piece;
  readonly attackers: readonly Square[];
  readonly defenders: readonly Square[];
  /** Material the opponent wins by starting an exchange here; 0 when it cannot. */
  readonly exchange: number;
}

export interface SafetyReport {
  /** Pieces the opponent wins material by capturing, most valuable first. */
  readonly enPrise: readonly PieceSafety[];
  /** Undefended pieces other than the king and pawns, attacked or not. */
  readonly loose: readonly PieceSafety[];
}

/** Every non-king piece of `color`, judged as if the opponent were to capture. */
export function safetyOf(parts: FenParts, color: Color): SafetyReport {
  const enPrise: PieceSafety[] = [];
  const loose: PieceSafety[] = [];
  for (const square of SQUARES) {
    const piece = parts.board[squareIndex(square)];
    if (!piece || piece.color !== color || piece.type === 'k') continue;
    const attackers = attackersOf(parts, square, opposite(color));
    const defenders = attackersOf(parts, square, color);
    const exchange = attackers.length > 0 ? staticExchange(parts, square, opposite(color)) : 0;
    const entry = { square, piece, attackers, defenders, exchange };
    if (exchange > 0) enPrise.push(entry);
    else if (defenders.length === 0 && piece.type !== 'p') loose.push(entry);
  }
  enPrise.sort(
    (a, b) => b.exchange - a.exchange || PIECE_VALUES[b.piece.type] - PIECE_VALUES[a.piece.type],
  );
  return { enPrise, loose };
}

/**
 * The position with the turn passed to the other side, for asking an engine
 * what that side threatens. En passant is cleared (the right lapses with the
 * pass). Null when the side to move is in check — passing would leave its king
 * capturable, and no engine answer about that position means anything.
 */
export function nullMoveFen(parts: FenParts): Fen | null {
  const mover = parts.turn;
  const king = SQUARES.find((square) => {
    const piece = parts.board[squareIndex(square)];
    return piece?.type === 'k' && piece.color === mover;
  });
  if (!king) return null;
  if (attackersOf(parts, king, opposite(mover)).length > 0) return null;
  return formatFen({
    ...parts,
    turn: opposite(mover),
    epSquare: null,
    fullmoveNumber: parts.fullmoveNumber + (mover === 'b' ? 1 : 0),
  });
}
