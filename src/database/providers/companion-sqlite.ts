/**
 * A SQLite game database, queried through the local companion.
 *
 * Same `ChessDatabaseProvider` interface as everything else, so the explorer,
 * the preparation report and the openings workspace use it without knowing it
 * exists. That is the entire benefit of the provider boundary: a collection ten
 * times larger than IndexedDB is comfortable with becomes another entry in the
 * source list rather than a second application.
 *
 * The provider is registered only while a companion is paired and reports at
 * least one database, because a source that cannot answer is worse than one
 * that is not offered.
 */

import { positionKey } from '@/chess/fen';
import { asSan, asUci } from '@/chess/types';

import {
  DatabaseError,
  moveScore,
  performanceRating,
  type ChessDatabaseProvider,
  type DatabaseMove,
  type ExplorerQuery,
  type ExplorerResult,
} from '../types';
import { CompanionError } from '@/companion/client';
import { companionClient } from '@/companion/session';

interface RawMove {
  uci: string;
  san: string;
  games: number;
  white: number;
  draws: number;
  black: number;
  averageRating?: number;
  lastPlayedYear?: number;
}

interface RawResult {
  moves: RawMove[];
  totalGames: number;
  white: number;
  draws: number;
  black: number;
}

export class CompanionSqliteProvider implements ChessDatabaseProvider {
  readonly capabilities = {
    ratingFilter: true,
    dateFilter: true,
    playerFilter: true,
    topGames: true,
    offline: true,
  };

  constructor(
    private readonly key: string,
    readonly name: string,
    private readonly games: number | null,
  ) {}

  get id(): string {
    return `sqlite:${this.key}`;
  }

  get description(): string {
    return this.games === null
      ? 'A SQLite collection on this machine, through the companion.'
      : `${this.games.toLocaleString()} games in SQLite, through the companion.`;
  }

  get cacheVersion(): string {
    return `${this.key}:${this.games ?? 'unknown'}`;
  }

  async health(signal?: AbortSignal) {
    const started = performance.now();
    const client = companionClient();
    if (!client) {
      return {
        state: 'companion-offline' as const,
        checkedAt: Date.now(),
        message: 'The local companion is not connected.',
        remedy: 'Start npm run companion and pair it in Settings.',
        count: this.games,
      };
    }
    try {
      await client.status(signal);
      return {
        state: 'ready' as const,
        checkedAt: Date.now(),
        latencyMs: Math.round(performance.now() - started),
        message: 'Companion and SQLite collection are available.',
        count: this.games,
      };
    } catch (error) {
      return {
        state: 'companion-offline' as const,
        checkedAt: Date.now(),
        latencyMs: Math.round(performance.now() - started),
        message: error instanceof Error ? error.message : 'The companion did not respond.',
        remedy: 'Restart the companion and pair it again if its token changed.',
        count: this.games,
      };
    }
  }

  async explore(query: ExplorerQuery, signal?: AbortSignal): Promise<ExplorerResult> {
    const client = companionClient();
    if (!client) {
      throw new DatabaseError(
        'The companion is not connected.',
        'Start it with `npm run companion` and pair it in Settings → Companion.',
        'companion-offline',
      );
    }
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');

    /*
      Translated rather than propagated. A `CompanionError` reaching the panel
      loses its state and its remedy, because the panel reads `DatabaseError`;
      the user would see "the companion is not reachable" with no hint that
      starting it is the fix.
    */
    let raw: RawResult;
    try {
      raw = await client.explore<RawResult>(
        this.key,
        positionKey(query.fen),
        query.limit ?? 20,
        query.filters,
      );
    } catch (error) {
      if (error instanceof DOMException) throw error;
      throw new DatabaseError(
        error instanceof Error ? error.message : 'The companion could not answer.',
        error instanceof CompanionError ? error.remedy : undefined,
        'companion-offline',
      );
    }

    const parsedTurn = query.fen.split(' ')[1] === 'b' ? 'b' : 'w';
    const moves: DatabaseMove[] = raw.moves.map((move) => {
      const base: DatabaseMove = {
        uci: asUci(move.uci),
        san: asSan(move.san),
        games: move.games,
        white: move.white,
        draws: move.draws,
        black: move.black,
        ...(move.averageRating ? { averageRating: move.averageRating } : {}),
        ...(move.lastPlayedYear ? { lastPlayedYear: move.lastPlayedYear } : {}),
      };
      const performance = move.averageRating
        ? performanceRating(moveScore(base, parsedTurn), move.averageRating)
        : undefined;
      return performance === undefined ? base : { ...base, performance };
    });

    return {
      fen: query.fen,
      source: { id: this.id, name: this.name },
      totalGames: raw.totalGames,
      white: raw.white,
      draws: raw.draws,
      black: raw.black,
      moves,
    };
  }
}

/** Rebuild the SQLite sources from a companion status report. */
export const sqliteProvidersFrom = (
  databases: readonly { key: string; name: string; games: number | null }[],
): readonly CompanionSqliteProvider[] =>
  databases.map((entry) => new CompanionSqliteProvider(entry.key, entry.name, entry.games));
