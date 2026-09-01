/**
 * The Lichess opening explorer, exposed through the provider interface.
 *
 * Two databases are offered: `masters`, an over-the-board collection of strong
 * tournament games, and `lichess`, millions of online games filterable by
 * rating and time control. Both are real evidence about what people play —
 * this application never invents database numbers.
 *
 * https://lichess.org/api#tag/Opening-Explorer
 */

import { asSan, asUci, type Fen } from '@/chess/types';
import { parseFen } from '@/chess/fen';

import { hasLichessToken, lichessAuthHeaders } from './lichess-auth';

import {
  DatabaseError,
  moveScore,
  performanceRating,
  type ChessDatabaseProvider,
  type DatabaseGameRef,
  type DatabaseMove,
  type ExplorerQuery,
  type ExplorerResult,
  type GameResult,
} from '../types';

const ENDPOINT = 'https://explorer.lichess.ovh';
const REQUEST_TIMEOUT_MS = 8_000;

/** `AbortSignal.any` is not available everywhere yet; this is the same idea. */
function anySignal(signals: readonly AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([...signals]);
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

interface LichessPlayer {
  readonly name?: string;
  readonly rating?: number;
}

interface LichessGame {
  readonly id?: string;
  readonly winner?: 'white' | 'black' | null;
  readonly white?: LichessPlayer;
  readonly black?: LichessPlayer;
  readonly year?: number;
  readonly month?: string;
}

interface LichessMove {
  readonly uci: string;
  readonly san: string;
  readonly white: number;
  readonly draws: number;
  readonly black: number;
  readonly averageRating?: number;
  readonly game?: LichessGame | null;
}

interface LichessResponse {
  readonly white: number;
  readonly draws: number;
  readonly black: number;
  readonly moves?: readonly LichessMove[];
  readonly topGames?: readonly LichessGame[];
  readonly opening?: { readonly eco?: string; readonly name?: string } | null;
}

export type LichessDatabase = 'masters' | 'lichess';

const RATING_BUCKETS = [400, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500] as const;

export class LichessExplorerProvider implements ChessDatabaseProvider {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly capabilities;

  constructor(private readonly database: LichessDatabase) {
    const masters = database === 'masters';
    this.id = masters ? 'lichess-masters' : 'lichess-players';
    this.name = masters ? 'Masters' : 'Lichess players';
    this.description = masters
      ? 'Over-the-board games between titled players, from the Lichess opening explorer.'
      : 'Rated online games, filterable by rating band.';
    this.capabilities = {
      ratingFilter: !masters,
      dateFilter: true,
      playerFilter: false,
      topGames: true,
      offline: false,
    };
  }

  async explore(query: ExplorerQuery, signal?: AbortSignal): Promise<ExplorerResult> {
    const url = this.buildUrl(query);

    // A request that never settles would leave the panel spinning forever;
    // network filtering and captive portals both produce exactly that.
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const combined = signal ? anySignal([signal, timeout]) : timeout;

    let response: Response;
    try {
      response = await fetch(url, {
        signal: combined,
        headers: { Accept: 'application/json', ...lichessAuthHeaders() },
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      if (timeout.aborted) {
        throw new DatabaseError(
          'The Lichess explorer did not respond.',
          'Check your connection, or switch to "My games" to work offline.',
        );
      }
      throw new DatabaseError(
        'The Lichess explorer could not be reached.',
        'Check your connection, or switch to "My games" to work offline.',
      );
    }

    if (response.status === 401) {
      throw new DatabaseError(
        hasLichessToken()
          ? 'Lichess rejected the configured API token.'
          : 'Lichess requires an API token for opening explorer requests.',
        hasLichessToken()
          ? 'Create a fresh token and paste it into Settings → Database. No scopes are needed.'
          : 'Add your own token in Settings → Database, or use "My games", which works offline.',
      );
    }
    if (response.status === 429) {
      throw new DatabaseError(
        'The Lichess explorer is rate limiting this session.',
        'Wait a few seconds before exploring further.',
      );
    }
    if (!response.ok) {
      throw new DatabaseError(
        `The Lichess explorer returned HTTP ${response.status}.`,
        'The service may be down, or this network may be blocking it. "My games" works offline.',
      );
    }

    const payload = (await response.json()) as LichessResponse;
    return this.toResult(query.fen, payload, query.limit ?? 15);
  }

  private buildUrl(query: ExplorerQuery): string {
    const params = new URLSearchParams({ fen: query.fen });
    const filters = query.filters;

    if (this.database === 'lichess') {
      params.set('variant', 'standard');
      const speeds = filters?.speeds?.length ? filters.speeds : ['blitz', 'rapid', 'classical'];
      params.set('speeds', speeds.join(','));
      params.set('ratings', ratingBuckets(filters?.minRating, filters?.maxRating).join(','));
    }
    if (filters?.sinceYear) {
      params.set(
        'since',
        this.database === 'masters' ? String(filters.sinceYear) : `${filters.sinceYear}-01`,
      );
    }
    if (filters?.untilYear) {
      params.set(
        'until',
        this.database === 'masters' ? String(filters.untilYear) : `${filters.untilYear}-12`,
      );
    }
    params.set('moves', String(query.limit ?? 15));
    params.set('topGames', this.database === 'masters' ? '8' : '4');

    return `${ENDPOINT}/${this.database}?${params.toString()}`;
  }

  private toResult(fen: Fen, payload: LichessResponse, limit: number): ExplorerResult {
    const parsed = parseFen(fen);
    const sideToMove = parsed.ok ? parsed.value.turn : 'w';

    const moves: DatabaseMove[] = (payload.moves ?? []).slice(0, limit).map((move) => {
      const base: DatabaseMove = {
        uci: asUci(move.uci),
        san: asSan(move.san),
        games: move.white + move.draws + move.black,
        white: move.white,
        draws: move.draws,
        black: move.black,
        ...(move.averageRating ? { averageRating: move.averageRating } : {}),
      };
      const performance = move.averageRating
        ? performanceRating(moveScore(base, sideToMove), move.averageRating)
        : undefined;
      const notable = move.game?.white?.name ?? move.game?.black?.name;
      return {
        ...base,
        ...(performance !== undefined ? { performance } : {}),
        ...(move.game?.year ? { lastPlayedYear: move.game.year } : {}),
        ...(notable ? { notablePlayers: [notable] } : {}),
      };
    });

    const opening = payload.opening?.name
      ? {
          name: payload.opening.name,
          ...(payload.opening.eco ? { eco: payload.opening.eco } : {}),
        }
      : undefined;

    return {
      fen,
      source: { id: this.id, name: this.name },
      totalGames: payload.white + payload.draws + payload.black,
      white: payload.white,
      draws: payload.draws,
      black: payload.black,
      moves,
      ...(opening ? { opening } : {}),
      topGames: (payload.topGames ?? []).map(toGameRef),
    };
  }
}

function toGameRef(game: LichessGame): DatabaseGameRef {
  const result: GameResult =
    game.winner === 'white' ? '1-0' : game.winner === 'black' ? '0-1' : '1/2-1/2';
  return {
    id: game.id ?? crypto.randomUUID(),
    white: game.white?.name ?? 'Unknown',
    black: game.black?.name ?? 'Unknown',
    ...(game.white?.rating ? { whiteRating: game.white.rating } : {}),
    ...(game.black?.rating ? { blackRating: game.black.rating } : {}),
    result,
    ...(game.year ? { year: game.year } : {}),
    ...(game.id ? { url: `https://lichess.org/${game.id}` } : {}),
  };
}

/** Lichess accepts a fixed set of rating bands rather than arbitrary bounds. */
function ratingBuckets(min?: number, max?: number): number[] {
  const lower = min ?? 0;
  const upper = max ?? Number.POSITIVE_INFINITY;
  const selected = RATING_BUCKETS.filter((bucket) => bucket >= lower - 200 && bucket <= upper);
  return selected.length > 0 ? [...selected] : [1600, 1800, 2000, 2200, 2500];
}
