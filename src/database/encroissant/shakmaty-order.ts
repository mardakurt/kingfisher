/**
 * The move order En Croissant's `Moves` blob is indexed against.
 *
 * En Croissant stores a move as a single byte: the index of that move in the
 * list its rules library, Shakmaty, generates for the position. The byte means
 * nothing on its own — decoding it requires producing the same list in the same
 * order, and a list ordered differently decodes to a *legal but wrong* move,
 * which is the worst possible failure because nothing downstream can detect it.
 *
 * So this file does one job: given the legal moves Kingfisher's own rules code
 * generated, put them in Shakmaty's order. It generates nothing and validates
 * nothing. There is still exactly one rules implementation in this codebase,
 * and it is `src/chess/position.ts`; what is reproduced here is an ordering,
 * transcribed from `shakmaty::Position::legal_moves` (v0.27.1, the version
 * En Croissant 0.15 builds against) and checked move-for-move against a real
 * En Croissant database in `decode.test.ts`.
 *
 * `legal_moves` for standard chess is, in order:
 *
 *   1. en passant                         (by origin square, ascending)
 *   2. if not in check:
 *        pawn captures toward the a-file   (by target square, ascending)
 *        pawn captures toward the h-file
 *        pawn single pushes
 *        pawn double pushes
 *        knights, bishops, rooks, queens   (by origin, then target)
 *        king moves to unattacked squares  (by target)
 *        castling kingside, then queenside
 *   3. if in check (`evasions`):
 *        king moves FIRST, then the other pieces in the same order.
 *        Castling is not generated at all.
 *
 * Promotions expand to four entries in the order queen, rook, bishop, knight,
 * immediately after the non-promoting moves of the same generator. Shakmaty
 * iterates a bitboard from its least significant bit, which is a1, so
 * "ascending" throughout means the square index a1=0, b1=1 … h8=63.
 *
 * The final `retain(is_safe)` pass in Shakmaty removes moves that would leave
 * the king in check while preserving relative order. Nothing here needs to
 * reproduce it: the moves handed in are already legal, which is the same set.
 */

import type { ChessMove, Color, Square } from '@/chess/types';

/** a1 = 0, b1 = 1 … h8 = 63, which is the order Shakmaty's bitboards yield. */
export function squareIndex(square: Square): number {
  const file = square.charCodeAt(0) - 97; // 'a'
  const rank = square.charCodeAt(1) - 49; // '1'
  return rank * 8 + file;
}

/** Where a move sits in Shakmaty's generation sequence. Lower comes first. */
const GROUP = {
  enPassant: 0,
  pawnCaptureTowardA: 1,
  pawnCaptureTowardH: 2,
  pawnSinglePush: 3,
  pawnDoublePush: 4,
  knight: 5,
  bishop: 6,
  rook: 7,
  queen: 8,
  king: 9,
  castleKingside: 10,
  castleQueenside: 11,
} as const;

/** Shakmaty pushes promotions in this order for every promoting move. */
const PROMOTION_RANK: Record<string, number> = { q: 0, r: 1, b: 2, n: 3 };

const PIECE_GROUP: Record<string, number> = {
  n: GROUP.knight,
  b: GROUP.bishop,
  r: GROUP.rook,
  q: GROUP.queen,
};

function groupOf(move: ChessMove): number {
  if (move.flags.enPassant) return GROUP.enPassant;
  if (move.flags.kingsideCastle) return GROUP.castleKingside;
  if (move.flags.queensideCastle) return GROUP.castleQueenside;
  if (move.piece === 'k') return GROUP.king;
  if (move.piece !== 'p') return PIECE_GROUP[move.piece] ?? GROUP.queen;

  if (move.flags.capture) {
    /*
      Shakmaty runs two capture passes, one per diagonal, and which pass a
      capture came from decides its place in the list. For White the first pass
      is north-west and for Black south-west; both move the pawn one file
      toward the a-file, so the direction can be read off the files alone
      without needing to know whose turn it is.
    */
    const fromFile = move.from.charCodeAt(0);
    const toFile = move.to.charCodeAt(0);
    return toFile < fromFile ? GROUP.pawnCaptureTowardA : GROUP.pawnCaptureTowardH;
  }
  return move.flags.doublePawnPush ? GROUP.pawnDoublePush : GROUP.pawnSinglePush;
}

/**
 * Sort key for one move, as a tuple flattened into a single number.
 *
 * Within a generator Shakmaty iterates origins then targets for the piece
 * moves, and targets alone for pawns and the king — but a pawn or king move's
 * origin is a function of its target, so ordering everything by
 * (group, origin, target, promotion) agrees with Shakmaty in every case while
 * needing only one comparator.
 *
 * The one place origin must *not* lead is the pawn generators, where Shakmaty
 * walks target squares across all pawns at once. Pawn moves are therefore keyed
 * by target first.
 */
function sortKey(move: ChessMove): number {
  const group = groupOf(move);
  const from = squareIndex(move.from);
  const to = squareIndex(move.to);
  const promotion = move.promotion ? (PROMOTION_RANK[move.promotion] ?? 0) : 0;

  /*
    Promotions rank above their target rather than beside it. Shakmaty runs
    each pawn pass twice — the non-promoting targets, then the promoting ones —
    and ordering by target alone would be right for White and backwards for
    Black, whose promotion square is rank 1 and therefore sorts *below* every
    ordinary target rather than above it.
  */
  const promoting = move.promotion ? 1 : 0;

  /*
    Pawn, king, en-passant and castling passes walk target squares only; the
    piece passes walk origins and then targets. Both shapes are expressed in
    the same four-component key, because a key whose radix depth changes
    between groups does not order the groups against each other — which is
    exactly the defect this replaced, where king moves sorted ahead of knights.
  */
  const walksOrigins = group >= GROUP.knight && group <= GROUP.queen;
  const primary = walksOrigins ? from : to;
  const secondary = walksOrigins ? to : 0;

  return (((group * 2 + promoting) * 64 + primary) * 64 + secondary) * 4 + promotion;
}

/**
 * The legal moves of a position, in the order Shakmaty would have listed them.
 *
 * `inCheck` reorders the list rather than changing it: Shakmaty's evasion
 * generator emits king moves before everything else, and a decoder that missed
 * that would read every move made while in check off by however many king moves
 * were available.
 */
export function shakmatyOrder(moves: readonly ChessMove[], inCheck: boolean): ChessMove[] {
  const ordered = [...moves].sort((a, b) => sortKey(a) - sortKey(b));
  if (!inCheck) return ordered;

  const isKingMove = (move: ChessMove) => move.piece === 'k' && !move.flags.enPassant;
  return [
    ...ordered.filter((move) => move.flags.enPassant),
    ...ordered.filter((move) => isKingMove(move)),
    ...ordered.filter((move) => !move.flags.enPassant && !isKingMove(move)),
  ];
}

/** Unused today, but the colour is what makes the capture rule readable. */
export type { Color };
