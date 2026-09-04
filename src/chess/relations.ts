/**
 * Deterministic attack geometry for position study.
 *
 * "Attacks" here means pseudo-legal reach: king safety, pins and whose turn it
 * is are intentionally ignored. Pawns attack diagonally, sliders stop at the
 * first occupied square (and attack that square), and kings attack adjacent
 * squares. This is descriptive geometry, never an evaluation.
 */
import { fileOf, makeSquare, rankOf, squareAt, squareIndex } from './board';
import type { FenParts } from './fen';
import type { Color, Piece, Square } from './types';

export interface SquareRelations {
  readonly square: Square;
  readonly piece: Piece | null;
  readonly attackedBy: readonly Square[];
  readonly defendedBy: readonly Square[];
  readonly piecesAttacked: readonly Square[];
  readonly piecesDefended: readonly Square[];
}

const KNIGHT_STEPS = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
] as const;
const KING_STEPS = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const;
const BISHOP_STEPS = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
] as const;
const ROOK_STEPS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;

export function attackedSquares(parts: FenParts, from: Square): readonly Square[] {
  const piece = parts.board[squareIndex(from)];
  if (!piece) return [];
  const file = fileOf(from);
  const rank = rankOf(from);

  if (piece.type === 'p') {
    const direction = piece.color === 'w' ? 1 : -1;
    return [-1, 1]
      .map((delta) => makeSquare(file + delta, rank + direction))
      .filter((square): square is Square => square !== null);
  }

  const steps =
    piece.type === 'n'
      ? KNIGHT_STEPS
      : piece.type === 'k'
        ? KING_STEPS
        : piece.type === 'b'
          ? BISHOP_STEPS
          : piece.type === 'r'
            ? ROOK_STEPS
            : [...BISHOP_STEPS, ...ROOK_STEPS];
  const sliding = piece.type === 'b' || piece.type === 'r' || piece.type === 'q';
  const result: Square[] = [];

  for (const [dx, dy] of steps) {
    let distance = 1;
    while (true) {
      const square = makeSquare(file + dx * distance, rank + dy * distance);
      if (!square) break;
      result.push(square);
      if (parts.board[squareIndex(square)] || !sliding) break;
      distance += 1;
    }
  }
  return result;
}

export function relationsFor(parts: FenParts, square: Square): SquareRelations {
  const piece = parts.board[squareIndex(square)] ?? null;
  const attackers: { square: Square; color: Color }[] = [];
  for (let index = 0; index < 64; index += 1) {
    const candidate = parts.board[index];
    if (!candidate) continue;
    const from = squareAt(index);
    if (attackedSquares(parts, from).includes(square)) {
      attackers.push({ square: from, color: candidate.color });
    }
  }

  if (!piece) {
    return {
      square,
      piece,
      attackedBy: attackers.map((entry) => entry.square),
      defendedBy: [],
      piecesAttacked: [],
      piecesDefended: [],
    };
  }

  const reachedPieces = attackedSquares(parts, square).filter(
    (target) => parts.board[squareIndex(target)] !== null,
  );
  return {
    square,
    piece,
    attackedBy: attackers
      .filter((entry) => entry.color !== piece.color)
      .map((entry) => entry.square),
    defendedBy: attackers
      .filter((entry) => entry.color === piece.color)
      .map((entry) => entry.square),
    piecesAttacked: reachedPieces.filter(
      (target) => parts.board[squareIndex(target)]?.color !== piece.color,
    ),
    piecesDefended: reachedPieces.filter(
      (target) => parts.board[squareIndex(target)]?.color === piece.color,
    ),
  };
}
