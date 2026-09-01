/**
 * Square arithmetic.
 *
 * Canonical index order is little-endian rank-file: a1 = 0, b1 = 1, … h8 = 63.
 * This matches the convention used by chess engines and keeps `index >> 3`
 * meaning "rank" everywhere in the codebase.
 */

import { FILES, RANKS, type FileLetter, type RankNumber, type Square } from './types';

export const SQUARES: readonly Square[] = RANKS.flatMap(
  (rank) => FILES.map((file) => `${file}${rank}` as Square) satisfies Square[],
);

const SQUARE_INDEX = new Map<string, number>(SQUARES.map((square, index) => [square, index]));

export function isSquare(value: string): value is Square {
  return SQUARE_INDEX.has(value);
}

export function squareIndex(square: Square): number {
  const index = SQUARE_INDEX.get(square);
  if (index === undefined) throw new Error(`Not a square: ${square}`);
  return index;
}

export function squareAt(index: number): Square {
  const square = SQUARES[index];
  if (square === undefined) throw new Error(`Square index out of range: ${index}`);
  return square;
}

/** 0 = a-file … 7 = h-file. */
export const fileOf = (square: Square): number => square.charCodeAt(0) - 97;
/** 0 = rank 1 … 7 = rank 8. */
export const rankOf = (square: Square): number => square.charCodeAt(1) - 49;

export const fileLetterOf = (square: Square): FileLetter => square[0] as FileLetter;
export const rankNumberOf = (square: Square): RankNumber => square[1] as RankNumber;

export function makeSquare(file: number, rank: number): Square | null {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return squareAt(rank * 8 + file);
}

/** Light squares are those where file and rank indices share parity. */
export const squareColor = (square: Square): 'light' | 'dark' =>
  (fileOf(square) + rankOf(square)) % 2 === 0 ? 'dark' : 'light';

/**
 * Squares in the order they should be painted, top-left first.
 * `orientation` is the colour sitting at the bottom of the board.
 */
export function boardSquares(orientation: Color): readonly Square[] {
  return orientation === 'w' ? WHITE_VIEW : BLACK_VIEW;
}

type Color = 'w' | 'b';

const WHITE_VIEW: readonly Square[] = Array.from({ length: 64 }, (_, i) =>
  squareAt((7 - Math.floor(i / 8)) * 8 + (i % 8)),
);

const BLACK_VIEW: readonly Square[] = [...WHITE_VIEW].reverse();
