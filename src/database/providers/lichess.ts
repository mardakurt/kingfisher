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
import { parseRetryAfter } from '../retry';

const ENDPOINT = 'https://explorer.lichess.org';
const REQUEST_TIMEOUT_MS = 8_000;
const START_POSITION = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' as Fen;

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
  readonly averageOpponentRating?: number | null;
  readonly game?: LichessGame | null;
  readonly opening?: { readonly eco?: string; readonly name?: string } | null;
}

interface LichessResponse {
  readonly white: number;
  readonly draws: number;
  readonly black: number;
  readonly moves?: readonly LichessMove[];
  readonly topGames?: readonly LichessGame[];
  readonly recentGames?: readonly LichessGame[];
  readonly queuePosition?: number;
  readonly opening?: { readonly eco?: string; readonly name?: string } | null;
}

export type LichessDatabase = 'masters' | 'lichess' | 'player';

const RATING_BUCKETS = [400, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500] as const;

export class LichessExplorerProvider implements ChessDatabaseProvider {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly capabilities;

  constructor(private readonly database: LichessDatabase) {
    const masters = database === 'masters';
    const player = database === 'player';
    this.id = masters ? 'lichess-masters' : player ? 'lichess-player' : 'lichess-games';
    this.name = masters ? 'Lichess Masters' : player ? 'Player' : 'Lichess';
    this.description = masters
      ? 'Over-the-board master games from the Lichess opening explorer.'
      : player
        ? 'One Lichess player, indexed on demand and streamed as results become available.'
        : 'Aggregated rated Lichess games, filterable by rating and speed.';
    this.capabilities = {
      ratingFilter: database === 'lichess',
      dateFilter: true,
      playerFilter: player,
      speedFilter: database === 'lichess',
      topGames: true,
      offline: false,
    };
  }

  async explore(query: ExplorerQuery, signal?: AbortSignal): Promise<ExplorerResult> {
    if (!hasLichessToken()) {
      throw new DatabaseError(
        'Lichess requires an API token for opening explorer requests.',
        'Connect Lichess in Settings → Database, or use a local source.',
        'authentication-required',
        401,
      );
    }
    if (this.database === 'player' && !query.filters?.player?.trim()) {
      throw new DatabaseError(
        'Choose a Lichess player before querying this source.',
        'Enter an exact username and choose the side they played.',
        'misconfigured',
      );
    }
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
          'network-error',
        );
      }
      throw new DatabaseError(
        'The Lichess explorer could not be reached.',
        'Check your connection, or switch to "My games" to work offline.',
        'network-error',
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
        'authentication-required',
        401,
      );
    }
    if (response.status === 403) {
      throw new DatabaseError(
        'Lichess denied this explorer request.',
        'Test the token in Settings. If it is valid, wait before retrying.',
        'authentication-required',
        403,
      );
    }
    if (response.status === 404) {
      throw new DatabaseError(
        this.database === 'player'
          ? 'That Lichess player was not found.'
          : 'The Lichess explorer endpoint was not found.',
        this.database === 'player'
          ? 'Check the exact username.'
          : 'Update Kingfisher before retrying.',
        this.database === 'player' ? 'misconfigured' : 'unsupported',
        404,
      );
    }
    if (response.status === 429) {
      throw new DatabaseError(
        'The Lichess explorer is rate limiting this session.',
        'Lichess recommends waiting before retrying and reducing request frequency.',
        'rate-limited',
        429,
        parseRetryAfter(response.headers.get('retry-after')),
      );
    }
    if (!response.ok) {
      throw new DatabaseError(
        `The Lichess explorer returned HTTP ${response.status}.`,
        'The service may be down, or this network may be blocking it. "My games" works offline.',
        response.status >= 500 ? 'network-error' : 'error',
        response.status,
      );
    }

    const text = await response.text();
    let payload: LichessResponse;
    try {
      payload = this.database === 'player' ? parseLastNdjson(text) : JSON.parse(text);
    } catch {
      throw new DatabaseError(
        'Lichess returned data Kingfisher could not read.',
        'Retry once. If it persists, the explorer response contract may have changed.',
        'error',
      );
    }
    if (!validResponse(payload)) {
      throw new DatabaseError(
        'Lichess returned an unexpected explorer response.',
        'Retry once. If it persists, update Kingfisher.',
        'error',
      );
    }
    return this.toResult(query.fen, payload, query.limit ?? 15);
  }

  async health(signal?: AbortSignal) {
    const started = performance.now();
    if (!hasLichessToken()) {
      return {
        state: 'authentication-required' as const,
        checkedAt: Date.now(),
        message: 'Connect a personal access token to use the explorer.',
        remedy: 'Settings → Database → Lichess',
      };
    }
    try {
      await this.explore(
        {
          fen: START_POSITION,
          ...(this.database === 'player'
            ? { filters: { player: 'lichess', playerColor: 'w' as const } }
            : {}),
          limit: 1,
        },
        signal,
      );
      return {
        state: 'ready' as const,
        checkedAt: Date.now(),
        latencyMs: Math.round(performance.now() - started),
        message: 'Authenticated and response schema validated.',
      };
    } catch (error) {
      const known = error instanceof DatabaseError ? error : null;
      return {
        state: known?.state ?? ('error' as const),
        checkedAt: Date.now(),
        latencyMs: Math.round(performance.now() - started),
        message: known?.message ?? 'The connection test failed.',
        ...(known?.remedy ? { remedy: known.remedy } : {}),
      };
    }
  }

  async game(id: string, signal?: AbortSignal): Promise<string> {
    const path = this.database === 'masters' ? `masters/pgn/${encodeURIComponent(id)}` : null;
    if (!path)
      throw new DatabaseError(
        'This source does not expose PGN by game id.',
        undefined,
        'unsupported',
      );
    /*
      No token is required here, and asking for one was withholding a capability
      Lichess gives away.

      The explorer *query* endpoints return 401 without a token — checked live
      on 2026-09-06, and the reason `hasLichessToken` guards `explore` above.
      `masters/pgn/{gameId}` does not: an unauthenticated request for the id in
      Lichess's own API specification returns the game. So this asks, sends the
      token when there is one — which spends the user's own rate limit rather
      than an anonymous pool — and reports a 401 as a 401 if Lichess ever
      changes its mind. Refusing up front would have been this application
      deciding, on Lichess's behalf, that a game it will serve cannot be read.
    */
    /*
      The same deadline the explorer query above uses. Fetching a game had only
      the caller's signal, and callers that open a model game do not pass one —
      so a stalled connection left the reader waiting on a promise that could
      never settle, with no error path downstream able to run.
    */
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const combined = signal ? anySignal([signal, timeout]) : timeout;

    let response: Response;
    try {
      response = await fetch(`${ENDPOINT}/${path}`, {
        signal: combined,
        headers: { Accept: 'application/x-chess-pgn', ...lichessAuthHeaders() },
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new DatabaseError(
        timeout.aborted
          ? 'Lichess did not respond while fetching that game.'
          : 'Lichess could not be reached to fetch that game.',
        'Check your connection, or open the game from a local collection.',
        'network-error',
      );
    }
    if (response.status === 401 || response.status === 403)
      throw new DatabaseError(
        'Lichess now requires authentication to read a master game.',
        hasLichessToken()
          ? 'The stored token was rejected. Reconnect Lichess in Settings → Database.'
          : 'Connect Lichess in Settings → Database.',
        'authentication-required',
        response.status,
      );
    if (response.status === 404)
      throw new DatabaseError(
        'The Lichess masters database has no game with that id.',
        undefined,
        'error',
        404,
      );
    if (!response.ok)
      throw new DatabaseError(
        `Lichess returned HTTP ${response.status}.`,
        undefined,
        response.status === 429 ? 'rate-limited' : 'error',
        response.status,
      );
    return response.text();
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
    if (this.database === 'player') {
      params.set('player', filters?.player?.trim() ?? '');
      params.set('color', filters?.playerColor === 'b' ? 'black' : 'white');
      params.set('recentGames', '8');
      if (filters?.speeds?.length) params.set('speeds', filters.speeds.join(','));
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
    if (this.database !== 'player') params.set('topGames', this.database === 'masters' ? '8' : '4');

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
        ...((move.averageRating ?? move.averageOpponentRating)
          ? { averageRating: move.averageRating ?? move.averageOpponentRating ?? undefined }
          : {}),
        ...(move.opening?.name
          ? {
              opening: {
                name: move.opening.name,
                ...(move.opening.eco ? { eco: move.opening.eco } : {}),
              },
            }
          : {}),
      };
      const average = move.averageRating ?? move.averageOpponentRating ?? undefined;
      const performance = average
        ? performanceRating(moveScore(base, sideToMove), average)
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
      topGames: (payload.topGames ?? payload.recentGames ?? []).map(toGameRef),
    };
  }
}

function parseLastNdjson(text: string): LichessResponse {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (rows.length === 0) throw new Error('Empty NDJSON response.');
  return JSON.parse(rows.at(-1) as string) as LichessResponse;
}

function validResponse(value: unknown): value is LichessResponse {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<LichessResponse>;
  if (![payload.white, payload.draws, payload.black].every((entry) => typeof entry === 'number')) {
    return false;
  }
  return (payload.moves ?? []).every(
    (move) =>
      typeof move.uci === 'string' &&
      typeof move.san === 'string' &&
      [move.white, move.draws, move.black].every((entry) => typeof entry === 'number'),
  );
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
