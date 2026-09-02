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
import { withTimeout } from '@/database/retry';

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

/** Long enough for a cold lookup, short enough that a stall becomes an error. */
const REQUEST_TIMEOUT_MS = 8_000;

export class LichessTablebaseProvider implements TablebaseProvider {
  readonly id = 'lichess-syzygy';
  readonly name = 'Lichess Syzygy';
  readonly maxPieces = 7;

  async probe(fen: Fen, signal?: AbortSignal): Promise<TablebaseResult> {
    const url = new URL(ENDPOINT);
    url.searchParams.set('fen', fen);

    /*
      A deadline, not just the caller's signal. This request had neither a
      timeout nor a catch: a connection that opened and then stalled — a
      captive portal, a dropped route, a service that accepted and never
      answered — left the promise unsettled forever, and the panel showing a
      loading state that no error path could ever replace.
    */
    let response: Response;
    try {
      response = await fetch(url, { signal: withTimeout(signal, REQUEST_TIMEOUT_MS) });
    } catch (error) {
      // A cancellation by the caller is not a failure; the position changed.
      if (signal?.aborted) throw error;
      throw new Error(
        error instanceof DOMException && error.name === 'TimeoutError'
          ? 'The tablebase did not answer in time.'
          : 'The tablebase could not be reached.',
      );
    }

    if (response.status === 429) {
      throw new Error('The tablebase is rate limiting this session. Wait before retrying.');
    }
    if (!response.ok) {
      throw new Error(
        response.status === 404
          ? 'This position is not in the tablebase.'
          : `The tablebase service answered ${response.status}.`,
      );
    }

    let payload: ApiResponse;
    try {
      payload = (await response.json()) as ApiResponse;
    } catch {
      throw new Error('The tablebase returned a response Kingfisher could not read.');
    }
    return normalize(fen, payload, this.name);
  }
}
