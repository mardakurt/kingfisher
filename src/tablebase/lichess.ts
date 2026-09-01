/**
 * Syzygy tablebases from lichess.org's public endpoint.
 *
 * Documented at https://github.com/lichess-org/lila-tablebase and free to use
 * without a key. It answers standard chess up to seven pieces, which is every
 * tablebase that exists.
 *
 * The alternative — local Syzygy files — is 150 GB for seven pieces and is
 * supported through the companion for users who have them. This is the option
 * that works for everyone else, and it is honest about being a network call.
 */

import { asSan, asUci, type Fen } from '@/chess/types';

import {
  moveRank,
  type TablebaseCategory,
  type TablebaseMove,
  type TablebaseProvider,
  type TablebaseResult,
} from './types';

const ENDPOINT = 'https://tablebase.lichess.ovh/standard';

interface ApiMove {
  uci: string;
  san: string;
  dtz: number | null;
  dtm: number | null;
  zeroing: boolean;
  checkmate: boolean;
  stalemate: boolean;
  category: string;
}

interface ApiResponse {
  dtz: number | null;
  dtm: number | null;
  checkmate: boolean;
  stalemate: boolean;
  category: string;
  moves?: ApiMove[];
}

const CATEGORIES = new Set([
  'win',
  'cursed-win',
  'draw',
  'blessed-loss',
  'loss',
  'checkmate',
  'stalemate',
]);

/** Anything unrecognised becomes a draw rather than a crash or a guess. */
export const toCategory = (value: string): TablebaseCategory =>
  CATEGORIES.has(value) ? (value as TablebaseCategory) : 'draw';

export function normalize(fen: Fen, payload: ApiResponse, source: string): TablebaseResult {
  const moves: TablebaseMove[] = (payload.moves ?? []).map((move) => ({
    uci: asUci(move.uci),
    san: asSan(move.san),
    category: toCategory(move.category),
    dtz: move.dtz ?? null,
    dtm: move.dtm ?? null,
    zeroing: Boolean(move.zeroing),
    checkmate: Boolean(move.checkmate),
    stalemate: Boolean(move.stalemate),
  }));

  moves.sort((left, right) => {
    const byCategory = moveRank(left.category) - moveRank(right.category);
    if (byCategory !== 0) return byCategory;
    // Within a category, the faster conversion first; nulls last.
    const leftDtz = left.dtz === null ? Number.POSITIVE_INFINITY : Math.abs(left.dtz);
    const rightDtz = right.dtz === null ? Number.POSITIVE_INFINITY : Math.abs(right.dtz);
    return leftDtz - rightDtz;
  });

  return {
    fen,
    category: toCategory(payload.category),
    dtz: payload.dtz ?? null,
    dtm: payload.dtm ?? null,
    checkmate: Boolean(payload.checkmate),
    stalemate: Boolean(payload.stalemate),
    moves,
    source,
  };
}

export class LichessTablebaseProvider implements TablebaseProvider {
  readonly id = 'lichess-syzygy';
  readonly name = 'Lichess Syzygy';
  readonly maxPieces = 7;

  async probe(fen: Fen, signal?: AbortSignal): Promise<TablebaseResult> {
    const url = new URL(ENDPOINT);
    url.searchParams.set('fen', fen);
    const response = await fetch(url, { ...(signal ? { signal } : {}) });
    if (!response.ok) {
      throw new Error(
        response.status === 404
          ? 'This position is not in the tablebase.'
          : `The tablebase service answered ${response.status}.`,
      );
    }
    return normalize(fen, (await response.json()) as ApiResponse, this.name);
  }
}
