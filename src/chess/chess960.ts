/**
 * The 960 starting arrangements, and their standard numbering.
 *
 * Chess960 positions are not "a shuffle". They are an enumerated set of
 * exactly 960 arrangements, each with a number the whole chess world agrees
 * on — a Freestyle broadcast says "position 335" and every viewer can set it
 * up. Getting that numbering right is the difference between supporting
 * Chess960 and supporting something that looks like it.
 *
 * Three constraints define the set:
 *
 *   - the two bishops stand on opposite-coloured squares
 *   - the king stands strictly between the two rooks
 *   - Black mirrors White exactly
 *
 * which admit 4 × 4 × 6 × 10 = 960 arrangements: four light squares for one
 * bishop, four dark for the other, six remaining squares for the queen, ten
 * ways to choose two of the last five for the knights, and no choice at all
 * about the rest — three squares left, and rook-king-rook is the only order
 * that puts the king between the rooks.
 *
 * ## The numbering is Scharnagl's, and it is checkable
 *
 * The index is built from those same four choices, most significant last:
 *
 *     index = ((knights × 6 + queen) × 4 + darkBishop) × 4 + lightBishop
 *
 * The anchor that proves this is the world's numbering rather than a
 * self-consistent invention of Kingfisher's own is that it puts the ordinary
 * chess position — RNBQKBNR — at **518**, which is what every other
 * implementation and every Chess960 tournament calls it. The test asserts that
 * directly rather than deriving it from this file.
 *
 * ## Scope
 *
 * This module is arrangements and numbering. It has no move generation, makes
 * no legality claim, and does not decide whether Kingfisher can *play* the
 * positions it can name — see `docs/adr/0048-chess960-needs-a-rules-decision-first.md` for
 * where that stands. Nothing here imports chess.js, and nothing here needs to.
 */

import type { FileLetter } from './types';

/** Back-rank piece letters, a-file first, in lower case as FEN writes Black. */
export type Chess960Arrangement = readonly [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
];

/** How many arrangements there are. Not a limit — the complete set. */
export const CHESS960_COUNT = 960;

/**
 * The ordinary chess position's number.
 *
 * Not a convenience constant: it is the value that makes this numbering the
 * standard one, and the test that checks it is the test that would catch an
 * off-by-one in any of the four digits.
 */
export const STANDARD_CHESS960_INDEX = 518;

const FILES: readonly FileLetter[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

/**
 * The ten ways to put two knights in five squares, in the standard order.
 *
 * Pairs of indices into the squares still free, ascending — (0,1), (0,2) …
 * (3,4). Written out rather than generated so that the order is visible: it is
 * part of the numbering, and a different order would produce a different index
 * for the same position while still passing every structural test.
 */
const KNIGHT_PAIRS: readonly (readonly [number, number])[] = [
  [0, 1],
  [0, 2],
  [0, 3],
  [0, 4],
  [1, 2],
  [1, 3],
  [1, 4],
  [2, 3],
  [2, 4],
  [3, 4],
];

/** Dark squares on the first rank are the a, c, e and g files. */
const DARK_FILES = [0, 2, 4, 6];
/** Light squares on the first rank are b, d, f and h. */
const LIGHT_FILES = [1, 3, 5, 7];

const isIndex = (value: number): boolean =>
  Number.isInteger(value) && value >= 0 && value < CHESS960_COUNT;

/**
 * The back-rank arrangement for a position number.
 *
 * Returns null rather than throwing for a number outside 0–959, because the
 * numbers reaching this come from a text field somebody typed and "there is no
 * position 1000" is an answer, not an exception.
 */
export function chess960Arrangement(index: number): Chess960Arrangement | null {
  if (!isIndex(index)) return null;

  const lightBishop = index % 4;
  const afterLight = Math.floor(index / 4);
  const darkBishop = afterLight % 4;
  const afterDark = Math.floor(afterLight / 4);
  const queen = afterDark % 6;
  const knights = Math.floor(afterDark / 6);

  const board: (string | null)[] = Array.from({ length: 8 }, () => null);
  board[LIGHT_FILES[lightBishop] as number] = 'b';
  board[DARK_FILES[darkBishop] as number] = 'b';

  const free = () => board.flatMap((piece, file) => (piece === null ? [file] : []));

  const queenFile = free()[queen];
  if (queenFile === undefined) return null;
  board[queenFile] = 'q';

  const remaining = free();
  const pair = KNIGHT_PAIRS[knights];
  if (!pair) return null;
  board[remaining[pair[0]] as number] = 'n';
  board[remaining[pair[1]] as number] = 'n';

  // Three squares left, and only one order puts the king between the rooks.
  const last = free();
  board[last[0] as number] = 'r';
  board[last[1] as number] = 'k';
  board[last[2] as number] = 'r';

  return board as unknown as Chess960Arrangement;
}

/**
 * The position number for an arrangement, or null if it is not one of the 960.
 *
 * The inverse of `chess960Arrangement`, and written as an inverse rather than
 * as a second derivation: it recovers the four choices the index was built
 * from. An arrangement that does not satisfy the constraints has no number and
 * is told so — an invalid back rank is not position zero.
 */
export function chess960Index(arrangement: readonly string[]): number | null {
  if (arrangement.length !== 8) return null;
  const board = arrangement.map((piece) => piece.toLowerCase());

  const files = (piece: string) => board.flatMap((entry, file) => (entry === piece ? [file] : []));
  const bishops = files('b');
  const knights = files('n');
  const rooks = files('r');
  const queens = files('q');
  const kings = files('k');
  if (
    bishops.length !== 2 ||
    knights.length !== 2 ||
    rooks.length !== 2 ||
    queens.length !== 1 ||
    kings.length !== 1
  ) {
    return null;
  }

  const lightFile = bishops.find((file) => LIGHT_FILES.includes(file));
  const darkFile = bishops.find((file) => DARK_FILES.includes(file));
  // Two bishops on the same colour is not a Chess960 position, whatever else
  // is true of it.
  if (lightFile === undefined || darkFile === undefined) return null;

  const king = kings[0] as number;
  if (!(rooks[0] !== undefined && rooks[1] !== undefined)) return null;
  if (!(king > (rooks[0] as number) && king < (rooks[1] as number))) return null;

  const lightBishop = LIGHT_FILES.indexOf(lightFile);
  const darkBishop = DARK_FILES.indexOf(darkFile);

  const afterBishops = [...Array(8).keys()].filter(
    (file) => file !== lightFile && file !== darkFile,
  );
  const queen = afterBishops.indexOf(queens[0] as number);
  if (queen < 0) return null;

  const afterQueen = afterBishops.filter((file) => file !== queens[0]);
  const knightSlots = knights.map((file) => afterQueen.indexOf(file)).sort((a, b) => a - b);
  if (knightSlots.some((slot) => slot < 0)) return null;
  const knightCode = KNIGHT_PAIRS.findIndex(
    (pair) => pair[0] === knightSlots[0] && pair[1] === knightSlots[1],
  );
  if (knightCode < 0) return null;

  return ((knightCode * 6 + queen) * 4 + darkBishop) * 4 + lightBishop;
}

/**
 * The starting FEN for a position number, with Shredder castling rights.
 *
 * Shredder-FEN — the rook files as letters, `HAha` rather than `KQkq` — is
 * used because in Chess960 "kingside" is not a square, it is whichever rook is
 * to the king's right, and a castling right is a claim about where two pieces
 * stand. That is the same reasoning `src/chess/fen.ts` already applies to
 * standard chess; here there is no shorthand that could stand in for it.
 *
 * Position 518 comes back with `HAha`, which is the ordinary start written the
 * long way, and is exactly equivalent to `KQkq`.
 */
export function chess960Fen(index: number): string | null {
  const arrangement = chess960Arrangement(index);
  if (!arrangement) return null;
  const black = arrangement.join('');
  const white = black.toUpperCase();
  const rooks = arrangement.flatMap((piece, file) => (piece === 'r' ? [file] : []));
  const queenside = FILES[rooks[0] as number] as string;
  const kingside = FILES[rooks[1] as number] as string;
  const castling = `${kingside.toUpperCase()}${queenside.toUpperCase()}${kingside}${queenside}`;
  return `${black}/pppppppp/8/8/8/8/PPPPPPPP/${white} w ${castling} - 0 1`;
}

/**
 * Every arrangement, in index order.
 *
 * Materialised rather than generated lazily because 960 eight-character
 * strings is nothing, and having the whole set is what lets a test assert
 * things about all of them rather than about a sample.
 */
export function allChess960Arrangements(): readonly Chess960Arrangement[] {
  const all: Chess960Arrangement[] = [];
  for (let index = 0; index < CHESS960_COUNT; index += 1) {
    const arrangement = chess960Arrangement(index);
    if (arrangement) all.push(arrangement);
  }
  return all;
}

/**
 * Where the two rooks and the king stand, for a Chess960 back rank.
 *
 * The three squares castling is defined in terms of. Castling *destinations*
 * are the same as standard chess — the king finishes on g1 or c1 and the rook
 * on f1 or d1 — so what varies between the 960 positions is entirely where the
 * pieces set off from, which is what this returns.
 */
export function castlingSquares(
  arrangement: readonly string[],
): { king: number; kingsideRook: number; queensideRook: number } | null {
  const kingFile = arrangement.findIndex((piece) => piece.toLowerCase() === 'k');
  const rooks = arrangement.flatMap((piece, file) => (piece.toLowerCase() === 'r' ? [file] : []));
  if (kingFile < 0 || rooks.length !== 2) return null;
  const queensideRook = rooks[0] as number;
  const kingsideRook = rooks[1] as number;
  if (!(queensideRook < kingFile && kingFile < kingsideRook)) return null;
  return { king: kingFile, kingsideRook, queensideRook };
}
