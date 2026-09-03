/**
 * Strategic themes, each with a definition you can check against the board.
 *
 * Kingfisher's structural search already answers "where else have I had this
 * pawn skeleton". It could not answer the questions a player actually phrases
 * strategically — "opposite-coloured bishops", "a rook ending", "an isolated
 * queen's pawn" — because those are about pieces and material rather than
 * pawns alone.
 *
 * The bar for admitting a theme here is that it can be decided by counting.
 * Every theme below has a definition written in the same terms the code
 * checks, that definition is carried into the interface, and the version
 * string changes if the rule changes so a stored match can never be silently
 * reinterpreted.
 *
 * Themes that were deliberately **not** implemented, because no definition
 * survives contact with a real position: "good bishop", "bad bishop",
 * "initiative", "attack", "weak squares", "space advantage". Each is a
 * judgement, and a search that claimed to find them would be inventing
 * evidence — which is the one thing this application does not do.
 */

import { fileOf, rankOf, squareColor } from './board';
import { parseFen, type FenParts } from './fen';
import { isOk } from './result';
import type { Color, Piece, PieceType, Square } from './types';

/** Bump when any definition below changes, so stored matches stay honest. */
export const THEME_VERSION = 't1';

export interface StrategicTheme {
  readonly id: string;
  readonly name: string;
  /**
   * The rule, in the terms the code checks. Shown in the interface, because a
   * theme whose definition the user cannot read is a label they have to trust.
   */
  readonly definition: string;
  readonly matches: (board: BoardView) => boolean;
}

// --- A small board view the definitions are written against -----------------

export interface BoardView {
  readonly parts: FenParts;
  /** Squares occupied by each piece type and colour. */
  pieces(color: Color, type: PieceType): readonly Square[];
  count(color: Color, type: PieceType): number;
  /** Pawns of one colour, as `[file, rank]` index pairs. */
  pawnSquares(color: Color): readonly Square[];
  kingSquare(color: Color): Square | null;
}

export function boardView(parts: FenParts): BoardView {
  const located: { square: Square; piece: Piece }[] = [];
  for (let index = 0; index < 64; index += 1) {
    const piece = parts.board[index];
    if (!piece) continue;
    const file = index % 8;
    const rank = Math.floor(index / 8);
    located.push({
      square: `${'abcdefgh'[file]}${rank + 1}` as Square,
      piece,
    });
  }

  const pieces = (color: Color, type: PieceType) =>
    located
      .filter((entry) => entry.piece.color === color && entry.piece.type === type)
      .map((entry) => entry.square);

  return {
    parts,
    pieces,
    count: (color, type) => pieces(color, type).length,
    pawnSquares: (color) => pieces(color, 'p'),
    kingSquare: (color) => pieces(color, 'k')[0] ?? null,
  };
}

// --- Helpers shared by several definitions ----------------------------------

const minors = (board: BoardView, color: Color): number =>
  board.count(color, 'n') + board.count(color, 'b');

const queenless = (board: BoardView): boolean =>
  board.count('w', 'q') === 0 && board.count('b', 'q') === 0;

const pawnsOnFile = (board: BoardView, color: Color, file: number): readonly Square[] =>
  board.pawnSquares(color).filter((square) => fileOf(square) === file);

const hasPawnOn = (board: BoardView, color: Color, square: string): boolean =>
  board.pawnSquares(color).some((entry) => entry === square);

/** Pawns on files a–c for one colour. */
const queensidePawns = (board: BoardView, color: Color): number =>
  board.pawnSquares(color).filter((square) => fileOf(square) <= 2).length;

/** Pawns on files f–h for one colour. */
const kingsidePawns = (board: BoardView, color: Color): number =>
  board.pawnSquares(color).filter((square) => fileOf(square) >= 5).length;

/** A pawn with no friendly pawn on either adjacent file. */
const isIsolated = (board: BoardView, color: Color, square: Square): boolean => {
  const file = fileOf(square);
  return (
    pawnsOnFile(board, color, file - 1).length === 0 &&
    pawnsOnFile(board, color, file + 1).length === 0
  );
};

/** Which third of the board a king stands in, or null when it is absent. */
const kingWing = (board: BoardView, color: Color): 'queenside' | 'centre' | 'kingside' | null => {
  const square = board.kingSquare(color);
  if (!square) return null;
  const file = fileOf(square);
  if (file <= 2) return 'queenside';
  if (file >= 5) return 'kingside';
  return 'centre';
};

// --- The themes -------------------------------------------------------------

export const STRATEGIC_THEMES: readonly StrategicTheme[] = [
  {
    id: 'opposite-coloured-bishops',
    name: 'Opposite-coloured bishops',
    definition:
      'Each side has exactly one bishop, and the two bishops stand on squares of different colours.',
    matches: (board) => {
      const white = board.pieces('w', 'b');
      const black = board.pieces('b', 'b');
      if (white.length !== 1 || black.length !== 1) return false;
      return squareColor(white[0] as Square) !== squareColor(black[0] as Square);
    },
  },
  {
    id: 'same-coloured-bishops',
    name: 'Same-coloured bishops',
    definition:
      'Each side has exactly one bishop, and both bishops stand on squares of the same colour.',
    matches: (board) => {
      const white = board.pieces('w', 'b');
      const black = board.pieces('b', 'b');
      if (white.length !== 1 || black.length !== 1) return false;
      return squareColor(white[0] as Square) === squareColor(black[0] as Square);
    },
  },
  {
    id: 'bishop-versus-knight',
    name: 'Bishop against knight',
    definition:
      'One side has exactly one bishop and no knight; the other has exactly one knight and no bishop.',
    matches: (board) => {
      const whiteIsBishop = board.count('w', 'b') === 1 && board.count('w', 'n') === 0;
      const blackIsKnight = board.count('b', 'n') === 1 && board.count('b', 'b') === 0;
      const whiteIsKnight = board.count('w', 'n') === 1 && board.count('w', 'b') === 0;
      const blackIsBishop = board.count('b', 'b') === 1 && board.count('b', 'n') === 0;
      return (whiteIsBishop && blackIsKnight) || (whiteIsKnight && blackIsBishop);
    },
  },
  {
    id: 'bishop-pair',
    name: 'Bishop pair against bishop and knight',
    definition:
      'One side has two bishops on squares of different colours; the other has exactly one bishop, or none.',
    matches: (board) => {
      const pair = (color: Color) => {
        const bishops = board.pieces(color, 'b');
        return (
          bishops.length === 2 &&
          squareColor(bishops[0] as Square) !== squareColor(bishops[1] as Square)
        );
      };
      return (pair('w') && !pair('b')) || (pair('b') && !pair('w'));
    },
  },
  {
    id: 'rook-versus-minor',
    name: 'Rook against a minor piece',
    definition:
      'One side has exactly one rook and no minor piece; the other has exactly one minor piece and no rook. Neither side has a queen.',
    matches: (board) => {
      if (!queenless(board)) return false;
      const whiteRook = board.count('w', 'r') === 1 && minors(board, 'w') === 0;
      const blackMinor = minors(board, 'b') === 1 && board.count('b', 'r') === 0;
      const blackRook = board.count('b', 'r') === 1 && minors(board, 'b') === 0;
      const whiteMinor = minors(board, 'w') === 1 && board.count('w', 'r') === 0;
      return (whiteRook && blackMinor) || (blackRook && whiteMinor);
    },
  },
  {
    id: 'queenless-middlegame',
    name: 'Queenless middlegame',
    definition:
      'Neither side has a queen, and both sides still have at least three non-pawn pieces — enough material that the position is not yet an endgame.',
    matches: (board) =>
      queenless(board) &&
      minors(board, 'w') + board.count('w', 'r') >= 3 &&
      minors(board, 'b') + board.count('b', 'r') >= 3,
  },
  {
    id: 'rook-ending',
    name: 'Rook ending',
    definition:
      'Neither side has a queen or a minor piece, and at least one rook remains on the board.',
    matches: (board) =>
      queenless(board) &&
      minors(board, 'w') === 0 &&
      minors(board, 'b') === 0 &&
      board.count('w', 'r') + board.count('b', 'r') > 0,
  },
  {
    id: 'minor-piece-ending',
    name: 'Minor-piece ending',
    definition:
      'Neither side has a queen or a rook, and at least one minor piece remains on the board.',
    matches: (board) =>
      queenless(board) &&
      board.count('w', 'r') === 0 &&
      board.count('b', 'r') === 0 &&
      minors(board, 'w') + minors(board, 'b') > 0,
  },
  {
    id: 'isolated-queen-pawn',
    name: "Isolated queen's pawn",
    definition:
      'One side has exactly one pawn on the d-file, standing on its own fourth rank, with no friendly pawn on the c- or e-file.',
    matches: (board) => {
      const iqp = (color: Color) => {
        const dPawns = pawnsOnFile(board, color, 3);
        if (dPawns.length !== 1) return false;
        const pawn = dPawns[0] as Square;
        const onFourth = color === 'w' ? rankOf(pawn) === 3 : rankOf(pawn) === 4;
        return onFourth && isIsolated(board, color, pawn);
      };
      return iqp('w') || iqp('b');
    },
  },
  {
    id: 'hanging-pawns',
    name: 'Hanging pawns',
    definition:
      'One side has pawns on the c- and d-files only among the b-, c-, d- and e-files, both on its own fourth rank.',
    matches: (board) => {
      const hanging = (color: Color) => {
        const rank = color === 'w' ? 3 : 4;
        const onFile = (file: number) => pawnsOnFile(board, color, file);
        const c = onFile(2);
        const d = onFile(3);
        return (
          c.length === 1 &&
          d.length === 1 &&
          rankOf(c[0] as Square) === rank &&
          rankOf(d[0] as Square) === rank &&
          onFile(1).length === 0 &&
          onFile(4).length === 0
        );
      };
      return hanging('w') || hanging('b');
    },
  },
  {
    id: 'carlsbad',
    name: 'Carlsbad pawn skeleton',
    definition:
      'White pawns on c3, d4 and e3 with no pawn on the c2 or e4 squares; Black pawns on c6, d5 and e6. The structure of the Exchange Queen’s Gambit, checked by square rather than inferred from an opening name.',
    matches: (board) =>
      hasPawnOn(board, 'w', 'c3') &&
      hasPawnOn(board, 'w', 'd4') &&
      hasPawnOn(board, 'w', 'e3') &&
      !hasPawnOn(board, 'w', 'c2') &&
      !hasPawnOn(board, 'w', 'e4') &&
      hasPawnOn(board, 'b', 'c6') &&
      hasPawnOn(board, 'b', 'd5') &&
      hasPawnOn(board, 'b', 'e6'),
  },
  {
    id: 'symmetrical-pawns',
    name: 'Symmetrical pawn structure',
    definition:
      'Every White pawn has a Black pawn mirroring it: a White pawn on a file and rank implies a Black pawn on the same file, the same distance from its own back rank.',
    matches: (board) => {
      const white = board.pawnSquares('w');
      const black = board.pawnSquares('b');
      if (white.length === 0 || white.length !== black.length) return false;
      const mirrored = new Set(black.map((square) => `${fileOf(square)}:${7 - rankOf(square)}`));
      return white.every((square) => mirrored.has(`${fileOf(square)}:${rankOf(square)}`));
    },
  },
  {
    id: 'open-central-file',
    name: 'Open central file',
    definition:
      'The d-file or the e-file carries no pawn of either colour, and at least four pawns remain on the board. The pawn count is what stops a bare-kings position counting as an open file, where every file is empty and the term means nothing.',
    matches: (board) => {
      const pawns = board.pawnSquares('w').length + board.pawnSquares('b').length;
      if (pawns < 4) return false;
      return [3, 4].some(
        (file) =>
          pawnsOnFile(board, 'w', file).length === 0 && pawnsOnFile(board, 'b', file).length === 0,
      );
    },
  },
  {
    id: 'opposite-side-castling',
    name: 'Opposite-side castling',
    definition:
      'One king stands on the queenside (files a–c) and the other on the kingside (files f–h).',
    matches: (board) => {
      const white = kingWing(board, 'w');
      const black = kingWing(board, 'b');
      return (
        (white === 'queenside' && black === 'kingside') ||
        (white === 'kingside' && black === 'queenside')
      );
    },
  },
  {
    id: 'queenside-majority',
    name: 'Queenside pawn majority',
    definition: 'One side has more pawns on files a–c than the other, and at least two there.',
    matches: (board) => {
      const white = queensidePawns(board, 'w');
      const black = queensidePawns(board, 'b');
      return (white > black && white >= 2) || (black > white && black >= 2);
    },
  },
  {
    id: 'kingside-majority',
    name: 'Kingside pawn majority',
    definition: 'One side has more pawns on files f–h than the other, and at least two there.',
    matches: (board) => {
      const white = kingsidePawns(board, 'w');
      const black = kingsidePawns(board, 'b');
      return (white > black && white >= 2) || (black > white && black >= 2);
    },
  },
];

export const themeById = (id: string): StrategicTheme | undefined =>
  STRATEGIC_THEMES.find((theme) => theme.id === id);

/**
 * Every theme that holds in a position.
 *
 * Returns ids, versioned by `THEME_VERSION`. A position matching nothing
 * returns an empty list, which is a fact about the position rather than a
 * failure to analyse it.
 */
export function strategicThemes(fen: string): readonly string[] {
  const parsed = parseFen(fen);
  if (!isOk(parsed)) return [];
  return themesFromParts(parsed.value);
}

/** The same answer for a position already parsed, so indexing parses once. */
export function themesFromParts(parts: FenParts): readonly string[] {
  const board = boardView(parts);
  return STRATEGIC_THEMES.filter((theme) => theme.matches(board)).map((theme) => theme.id);
}

/**
 * Theme ids as they appear in the position index.
 *
 * Prefixed, so a strategic theme and a pawn-structure claim can share one
 * multi-entry index without either ever being mistaken for the other — and so
 * a stored claim list can be read years later and still say which kind of
 * statement each entry is.
 */
export const THEME_CLAIM_PREFIX = 'theme:';

export const themeClaimIds = (parts: FenParts): readonly string[] =>
  themesFromParts(parts).map((id) => `${THEME_CLAIM_PREFIX}${id}`);

/** The theme behind an indexed claim, or undefined when it is not a theme claim. */
export const themeFromClaim = (claim: string): StrategicTheme | undefined =>
  claim.startsWith(THEME_CLAIM_PREFIX)
    ? themeById(claim.slice(THEME_CLAIM_PREFIX.length))
    : undefined;
