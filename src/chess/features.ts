/**
 * Deterministic structural features of a position.
 *
 * Pure functions over a `FenParts` board. No engine, no database, no React, no
 * heuristics with a number attached: every field here is something two people
 * with a board in front of them would agree on, and every one of them is
 * counted from the position rather than estimated.
 *
 * That constraint is the point. Kingfisher already separates engine evidence
 * from database evidence from repertoire decisions; structural features are a
 * fourth kind of evidence, and they are only worth having if they are *facts*.
 * "White has a bad bishop" is a judgement and does not belong here. "White has
 * an isolated pawn on d4, and the c- and e-files are open" is a fact, and the
 * user can do the judging.
 *
 * Where a term has more than one reasonable definition in the literature, the
 * one used is written down next to the code that implements it, because a
 * feature nobody can reproduce is worse than no feature at all.
 */

import { fileOf, rankOf } from './board';
import type { FenParts } from './fen';
import type { Color, FileLetter, Piece, Square } from './types';
import { FILES } from './types';

export interface PawnStructure {
  /** Files carrying at least one pawn, with how many. */
  readonly byFile: Readonly<Record<FileLetter, number>>;
  /** No friendly pawn on either adjacent file. */
  readonly isolated: readonly Square[];
  /** Two or more friendly pawns on one file; every such pawn is listed. */
  readonly doubled: readonly Square[];
  /**
   * No enemy pawn ahead on its own or an adjacent file.
   *
   * "Ahead" is strict and colour-relative, and the pawn's own file is included
   * because a blocked pawn is not passed.
   */
  readonly passed: readonly Square[];
  /** Passed pawns with a friendly passed pawn on an adjacent file. */
  readonly connectedPassed: readonly Square[];
  /**
   * Behind every friendly pawn on adjacent files, not defensible by one, and
   * with its advance square controlled by an enemy pawn.
   *
   * The last clause is what separates a backward pawn from a merely rearward
   * one, and it is why this is safe to report as a fact.
   */
  readonly backward: readonly Square[];
  /** Groups of pawns on consecutive files; the count is the island count. */
  readonly islands: number;
}

export interface FileState {
  /** No pawns of either colour. */
  readonly open: readonly FileLetter[];
  /** No friendly pawns, but at least one enemy pawn. */
  readonly semiOpen: readonly FileLetter[];
}

export interface ColorFeatures {
  readonly pawns: PawnStructure;
  readonly files: FileState;
  readonly bishopPair: boolean;
  /** Rooks (and queens are excluded) standing on a file with no pawns at all. */
  readonly rooksOnOpenFiles: readonly Square[];
  /** Rooks on a file carrying no friendly pawn but at least one enemy pawn. */
  readonly rooksOnSemiOpenFiles: readonly Square[];
  readonly canCastleKingside: boolean;
  readonly canCastleQueenside: boolean;
  /**
   * The king stands on a castled square with a rook beside it, and has no
   * castling rights left — i.e. it got there by castling rather than by walking.
   */
  readonly castled: boolean;
  readonly kingSquare: Square | null;
  /** Friendly pawns on the king's file and the two beside it, within 3 ranks. */
  readonly kingShieldPawns: number;
}

export interface MaterialCount {
  readonly p: number;
  readonly n: number;
  readonly b: number;
  readonly r: number;
  readonly q: number;
}

export interface PositionFeatures {
  readonly white: ColorFeatures;
  readonly black: ColorFeatures;
  readonly material: {
    readonly white: MaterialCount;
    readonly black: MaterialCount;
    /**
     * Per-piece-type differences, White minus Black. An imbalance is any
     * non-zero entry; the classic "two minor pieces for a rook" shows up as
     * `{ n: 1, b: 1, r: -1 }` without anything having to name it.
     */
    readonly difference: MaterialCount;
    /** Standard 1/3/3/5/9 valuation, White minus Black. Reported, not judged. */
    readonly balance: number;
  };
  /** Total non-king pieces on the board, for endgame/tablebase eligibility. */
  readonly pieceCount: number;
}

const PIECE_VALUE: Record<keyof MaterialCount, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };

interface Located {
  readonly square: Square;
  readonly piece: Piece;
  readonly file: number;
  readonly rank: number;
}

const locate = (board: readonly (Piece | null)[]): Located[] => {
  const found: Located[] = [];
  for (let index = 0; index < 64; index += 1) {
    const piece = board[index];
    if (!piece) continue;
    const square = (FILES[index % 8] + String(Math.floor(index / 8) + 1)) as Square;
    found.push({ square, piece, file: fileOf(square), rank: rankOf(square) });
  }
  return found;
};

/** Forward is up the board for White and down for Black. */
const forward = (color: Color): number => (color === 'w' ? 1 : -1);

function pawnStructure(own: Located[], enemy: Located[]): PawnStructure {
  const ownPawns = own.filter((entry) => entry.piece.type === 'p');
  const enemyPawns = enemy.filter((entry) => entry.piece.type === 'p');
  const color = ownPawns[0]?.piece.color ?? 'w';
  const step = forward(color);

  const byFile = Object.fromEntries(FILES.map((file) => [file, 0])) as Record<FileLetter, number>;
  for (const pawn of ownPawns) byFile[FILES[pawn.file] as FileLetter] += 1;

  const onFile = (file: number, pawns: Located[]) => pawns.filter((pawn) => pawn.file === file);

  const isolated = ownPawns
    .filter(
      (pawn) =>
        onFile(pawn.file - 1, ownPawns).length === 0 &&
        onFile(pawn.file + 1, ownPawns).length === 0,
    )
    .map((pawn) => pawn.square);

  const doubled = ownPawns
    .filter((pawn) => onFile(pawn.file, ownPawns).length > 1)
    .map((pawn) => pawn.square);

  const passed = ownPawns
    .filter(
      (pawn) =>
        !enemyPawns.some(
          (other) => Math.abs(other.file - pawn.file) <= 1 && (other.rank - pawn.rank) * step > 0,
        ),
    )
    .map((pawn) => pawn.square);

  const passedSet = new Set(passed);
  const connectedPassed = ownPawns
    .filter(
      (pawn) =>
        passedSet.has(pawn.square) &&
        ownPawns.some(
          (other) => passedSet.has(other.square) && Math.abs(other.file - pawn.file) === 1,
        ),
    )
    .map((pawn) => pawn.square);

  const backward = ownPawns
    .filter((pawn) => {
      const neighbours = ownPawns.filter((other) => Math.abs(other.file - pawn.file) === 1);
      if (neighbours.length === 0) return false; // isolated, reported as such
      // Strictly behind every neighbour, so no friendly pawn can defend it.
      const behindAll = neighbours.every((other) => (other.rank - pawn.rank) * step > 0);
      if (!behindAll) return false;
      // And the square in front is covered by an enemy pawn.
      const aheadRank = pawn.rank + step;
      return enemyPawns.some(
        (other) => Math.abs(other.file - pawn.file) === 1 && other.rank - aheadRank === step,
      );
    })
    .map((pawn) => pawn.square);

  const occupiedFiles = [...new Set(ownPawns.map((pawn) => pawn.file))].sort((a, b) => a - b);
  let islands = 0;
  for (let index = 0; index < occupiedFiles.length; index += 1) {
    if (
      index === 0 ||
      (occupiedFiles[index] as number) - (occupiedFiles[index - 1] as number) > 1
    ) {
      islands += 1;
    }
  }

  return { byFile, isolated, doubled, passed, connectedPassed, backward, islands };
}

function fileState(own: Located[], enemy: Located[]): FileState {
  const ownPawnFiles = new Set(
    own.filter((entry) => entry.piece.type === 'p').map((entry) => entry.file),
  );
  const enemyPawnFiles = new Set(
    enemy.filter((entry) => entry.piece.type === 'p').map((entry) => entry.file),
  );

  const open: FileLetter[] = [];
  const semiOpen: FileLetter[] = [];
  for (let file = 0; file < 8; file += 1) {
    const letter = FILES[file] as FileLetter;
    if (!ownPawnFiles.has(file) && !enemyPawnFiles.has(file)) open.push(letter);
    else if (!ownPawnFiles.has(file) && enemyPawnFiles.has(file)) semiOpen.push(letter);
  }
  return { open, semiOpen };
}

function colorFeatures(color: Color, all: Located[], parts: FenParts): ColorFeatures {
  const own = all.filter((entry) => entry.piece.color === color);
  const enemy = all.filter((entry) => entry.piece.color !== color);
  const pawns = pawnStructure(own, enemy);
  const files = fileState(own, enemy);

  const openFiles = new Set(files.open.map((letter) => FILES.indexOf(letter)));
  const semiOpenFiles = new Set(files.semiOpen.map((letter) => FILES.indexOf(letter)));
  const rooks = own.filter((entry) => entry.piece.type === 'r');

  const king = own.find((entry) => entry.piece.type === 'k') ?? null;
  const kingside = color === 'w' ? parts.castling.whiteKing : parts.castling.blackKing;
  const queenside = color === 'w' ? parts.castling.whiteQueen : parts.castling.blackQueen;

  /*
    "Castled" is inferred, because FEN does not record history. The test is the
    conjunction of three things a castled king satisfies and a walking king
    almost never does: it stands on g1/c1 (or g8/c8), a friendly rook is on the
    square it would have jumped to, and no castling right remains. A king that
    merely walked to g1 will normally have lost its rights too, but will not
    have a rook on f1 — so the rook is what carries the claim.
  */
  const homeRank = color === 'w' ? 0 : 7;
  const castled = (() => {
    if (!king || king.rank !== homeRank || kingside || queenside) return false;
    const rookOn = (file: number) =>
      own.some(
        (entry) => entry.piece.type === 'r' && entry.rank === homeRank && entry.file === file,
      );
    if (king.file === 6 && rookOn(5)) return true;
    if (king.file === 2 && rookOn(3)) return true;
    return false;
  })();

  const step = forward(color);
  const kingShieldPawns = king
    ? own.filter(
        (entry) =>
          entry.piece.type === 'p' &&
          Math.abs(entry.file - king.file) <= 1 &&
          (entry.rank - king.rank) * step > 0 &&
          (entry.rank - king.rank) * step <= 3,
      ).length
    : 0;

  return {
    pawns,
    files,
    bishopPair: own.filter((entry) => entry.piece.type === 'b').length >= 2,
    rooksOnOpenFiles: rooks.filter((rook) => openFiles.has(rook.file)).map((rook) => rook.square),
    rooksOnSemiOpenFiles: rooks
      .filter((rook) => semiOpenFiles.has(rook.file))
      .map((rook) => rook.square),
    canCastleKingside: kingside,
    canCastleQueenside: queenside,
    castled,
    kingSquare: king?.square ?? null,
    kingShieldPawns,
  };
}

const countMaterial = (located: Located[], color: Color): MaterialCount => {
  const count: MaterialCount = { p: 0, n: 0, b: 0, r: 0, q: 0 };
  const mutable = count as { -readonly [K in keyof MaterialCount]: number };
  for (const entry of located) {
    if (entry.piece.color !== color || entry.piece.type === 'k') continue;
    mutable[entry.piece.type] += 1;
  }
  return count;
};

export function positionFeatures(parts: FenParts): PositionFeatures {
  const located = locate(parts.board);
  const white = countMaterial(located, 'w');
  const black = countMaterial(located, 'b');

  const difference: MaterialCount = {
    p: white.p - black.p,
    n: white.n - black.n,
    b: white.b - black.b,
    r: white.r - black.r,
    q: white.q - black.q,
  };

  const balance = (Object.keys(PIECE_VALUE) as (keyof MaterialCount)[]).reduce(
    (total, type) => total + difference[type] * PIECE_VALUE[type],
    0,
  );

  return {
    white: colorFeatures('w', located, parts),
    black: colorFeatures('b', located, parts),
    material: { white, black, difference, balance },
    pieceCount: located.length,
  };
}

/** Whether any entry of a material difference is non-zero. */
export const hasImbalance = (difference: MaterialCount): boolean =>
  (Object.keys(PIECE_VALUE) as (keyof MaterialCount)[]).some((type) => difference[type] !== 0);
