/**
 * Tablebase evidence.
 *
 * Deliberately a separate evidence source from the engine, and deliberately
 * *not* expressed in centipawns. A tablebase result is not an opinion that
 * happens to be very good — it is the answer. Rendering "win in 17" as "+9.5"
 * would put proof and estimate in the same column and invite the user to
 * compare them, which is the one thing they must not do.
 *
 * The categories are Syzygy's own, including the two that only exist because
 * of the fifty-move rule.
 */

import type { Fen, San, Uci } from '@/chess/types';

export type TablebaseCategory =
  /** Won, and winnable within the fifty-move rule. */
  | 'win'
  /** Won on the board, but the rule intervenes: a draw in play. */
  | 'cursed-win'
  | 'draw'
  /** Lost on the board, saved by the rule. */
  | 'blessed-loss'
  | 'loss'
  /** In the tablebase's terms, the position is already over. */
  | 'checkmate'
  | 'stalemate';

export interface TablebaseMove {
  readonly uci: Uci;
  readonly san: San;
  /** The category **from the mover's point of view after the move**. */
  readonly category: TablebaseCategory;
  /** Plies to a zeroing move (capture or pawn move), signed as Syzygy reports. */
  readonly dtz: number | null;
  /** Distance to mate, where the source knows it. */
  readonly dtm: number | null;
  readonly zeroing: boolean;
  readonly checkmate: boolean;
  readonly stalemate: boolean;
}

export interface TablebaseResult {
  readonly fen: Fen;
  /** Category for the side to move. */
  readonly category: TablebaseCategory;
  readonly dtz: number | null;
  readonly dtm: number | null;
  readonly checkmate: boolean;
  readonly stalemate: boolean;
  /** Best first: winning moves, then drawing, then losing. */
  readonly moves: readonly TablebaseMove[];
  /** Which provider answered, so the panel can say where the proof came from. */
  readonly source: string;
}

export interface TablebaseProvider {
  readonly id: string;
  readonly name: string;
  /** Largest number of pieces this source can answer for. */
  readonly maxPieces: number;
  probe(fen: Fen, signal?: AbortSignal): Promise<TablebaseResult>;
}

/**
 * Whether a position is worth asking about at all.
 *
 * Counting pieces first avoids a request for every middlegame position the
 * user walks through, which is both wasteful and rude to a free public API.
 */
export const eligibleForTablebase = (pieceCount: number, maxPieces: number): boolean =>
  pieceCount >= 2 && pieceCount <= maxPieces;

/** How a category reads for the side to move. */
export const describeCategory = (category: TablebaseCategory): string => {
  switch (category) {
    case 'win':
      return 'Win';
    case 'loss':
      return 'Loss';
    case 'draw':
      return 'Draw';
    case 'cursed-win':
      return 'Win, but drawn by the fifty-move rule';
    case 'blessed-loss':
      return 'Loss, but drawn by the fifty-move rule';
    case 'checkmate':
      return 'Checkmate';
    case 'stalemate':
      return 'Stalemate';
  }
};

/** Ordering for a move list: the good news first. */
export const moveRank = (category: TablebaseCategory): number => {
  switch (category) {
    // A move is listed from the *opponent's* point of view after it is played,
    // so the moves that lose for them are the ones that win for us.
    case 'loss':
      return 0;
    case 'blessed-loss':
      return 1;
    case 'draw':
      return 2;
    case 'stalemate':
      return 3;
    case 'cursed-win':
      return 4;
    case 'win':
      return 5;
    case 'checkmate':
      return -1;
  }
};
