/**
 * Turning the local helper's raw Syzygy values into tablebase evidence.
 *
 * The helper reports what Fathom reports: a WDL code, a DTZ, and one code per
 * legal move in UCI. Everything chess-shaped about the answer is added here,
 * in the browser, where the rules already live — SAN, whether a move zeroes the
 * clock, whether it mates. The helper computes none of that, and so cannot
 * disagree with the rest of the application about it.
 *
 * Two conversions matter and are easy to get backwards:
 *
 * **Perspective.** Fathom reports every move's WDL from the point of view of
 * the side to move at the root: a winning move reads `TB_WIN`. The tablebase
 * vocabulary this application uses — and that the public Lichess endpoint uses
 * — reports a move from the point of view of the player who moves *next*, so
 * the same move reads `loss`. They are inverted, and a panel that showed the
 * uninverted value would list every winning move as a loss.
 *
 * **Sign.** DTZ is unsigned in Fathom's result. Syzygy's own convention, which
 * the remote provider follows, is negative when the side to move is losing. The
 * sign is restored from the category so that a local answer and a remote answer
 * about the same position print the same number.
 *
 * There is no DTM. Syzygy does not contain distance-to-mate, and inventing one
 * from DTZ would be a fabricated proof.
 */

import { Position } from '@/chess/position';
import { asSan, asUci, type Fen } from '@/chess/types';

import type { TablebaseCategory, TablebaseMove, TablebaseResult } from './types';
import { moveRank } from './types';

/** Fathom's WDL codes, from the point of view of the side to move. */
export const TB_LOSS = 0;
export const TB_BLESSED_LOSS = 1;
export const TB_DRAW = 2;
export const TB_CURSED_WIN = 3;
export const TB_WIN = 4;

export interface HelperMove {
  readonly uci: string;
  readonly wdl: number;
  readonly dtz: number;
}

export interface HelperResult {
  readonly ok: boolean;
  readonly reason?: string;
  readonly wdl?: number;
  readonly dtz?: number;
  readonly checkmate?: boolean;
  readonly stalemate?: boolean;
  readonly moves?: readonly HelperMove[];
}

/** A WDL code as the category for the side whose perspective it is. */
export function categoryOfWdl(wdl: number): TablebaseCategory {
  switch (wdl) {
    case TB_WIN:
      return 'win';
    case TB_CURSED_WIN:
      return 'cursed-win';
    case TB_BLESSED_LOSS:
      return 'blessed-loss';
    case TB_LOSS:
      return 'loss';
    default:
      return 'draw';
  }
}

/** The same result seen from the other side of the board. */
export function invertCategory(category: TablebaseCategory): TablebaseCategory {
  switch (category) {
    case 'win':
      return 'loss';
    case 'loss':
      return 'win';
    case 'cursed-win':
      return 'blessed-loss';
    case 'blessed-loss':
      return 'cursed-win';
    default:
      // Draw, checkmate and stalemate are the same fact from either side.
      return category;
  }
}

/** Syzygy's sign convention: negative when the side to move is losing. */
export function signDtz(magnitude: number, category: TablebaseCategory): number {
  if (magnitude === 0) return 0;
  return category === 'loss' || category === 'blessed-loss' ? -magnitude : magnitude;
}

/**
 * Build a full result from the helper's answer and the position it is about.
 *
 * The position is replayed here for each move, which is the only way to get SAN
 * and terminal state without the helper knowing any chess. It is bounded work:
 * a tablebase position has a few dozen legal moves at most.
 *
 * A move the rules reject is dropped rather than shown. That can only happen if
 * the helper and this application disagree about legality, which would be a bug
 * worth not papering over with a move nobody can play.
 */
export function fromHelper(fen: Fen, payload: HelperResult, source: string): TablebaseResult {
  const rootCategory: TablebaseCategory = payload.checkmate
    ? 'checkmate'
    : payload.stalemate
      ? 'stalemate'
      : categoryOfWdl(payload.wdl ?? TB_DRAW);

  const position = Position.fromTrustedFen(fen);
  const moves: TablebaseMove[] = [];

  for (const entry of payload.moves ?? []) {
    const played = position.playUci(entry.uci);
    if (!played.ok) continue;
    const move = played.value;
    const after = Position.fromTrustedFen(move.after);
    const checkmate = after.isCheckmate();
    const stalemate = after.isStalemate();
    /*
      A mate is reported as a mate rather than as "a loss for the opponent",
      because that is the stronger and more useful statement and because it is
      what the remote provider says about the same move.
    */
    const category: TablebaseCategory = checkmate
      ? 'checkmate'
      : stalemate
        ? 'stalemate'
        : invertCategory(categoryOfWdl(entry.wdl));

    moves.push({
      uci: asUci(move.uci),
      san: asSan(move.san),
      category,
      dtz: signDtz(entry.dtz, category),
      // Syzygy has no distance to mate. Reported as absent, never derived.
      dtm: null,
      // A move zeroes the fifty-move counter when it captures or moves a pawn,
      // which the rules layer already decided when it played the move.
      zeroing: move.piece === 'p' || move.captured !== undefined,
      checkmate,
      stalemate,
    });
  }

  moves.sort((left, right) => {
    const byCategory = moveRank(left.category) - moveRank(right.category);
    if (byCategory !== 0) return byCategory;
    const leftDtz = left.dtz === null ? Number.POSITIVE_INFINITY : Math.abs(left.dtz);
    const rightDtz = right.dtz === null ? Number.POSITIVE_INFINITY : Math.abs(right.dtz);
    return leftDtz - rightDtz;
  });

  return {
    fen,
    category: rootCategory,
    dtz: signDtz(payload.dtz ?? 0, rootCategory),
    dtm: null,
    checkmate: Boolean(payload.checkmate),
    stalemate: Boolean(payload.stalemate),
    moves,
    source,
  };
}
