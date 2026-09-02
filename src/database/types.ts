/**
 * Game-database access.
 *
 * The interface is written for databases of millions of games, which means the
 * unit of work is a *query about a position*, never "load the games". A
 * provider may be a remote service, an indexed local collection, or one day a
 * SQLite file behind a worker; the UI only ever sees `ExplorerResult`.
 */

import type { Fen, San, Uci } from '@/chess/types';

export interface OpeningInfo {
  readonly eco?: string;
  readonly name: string;
  readonly variation?: string;
}

export type GameResult = '1-0' | '0-1' | '1/2-1/2' | '*';

export interface DatabaseGameRef {
  readonly id: string;
  readonly white: string;
  readonly black: string;
  readonly whiteRating?: number;
  readonly blackRating?: number;
  readonly result: GameResult;
  readonly year?: number;
  readonly event?: string;
  /** Where the full game can be opened, when the provider offers one. */
  readonly url?: string;
}

/** One candidate move at a position, with the evidence a database can offer. */
export interface DatabaseMove {
  readonly uci: Uci;
  readonly san: San;
  readonly games: number;
  readonly white: number;
  readonly draws: number;
  readonly black: number;
  readonly averageRating?: number;
  /** Performance rating of the side making the move, when computable. */
  readonly performance?: number;
  readonly opening?: OpeningInfo;
  /** Strong players who have used the move, most recent first. */
  readonly notablePlayers?: readonly string[];
  /** Most recent year the move appears, for spotting revivals. */
  readonly lastPlayedYear?: number;
}

export interface ExplorerResult {
  readonly fen: Fen;
  readonly source: { readonly id: string; readonly name: string };
  readonly totalGames: number;
  readonly white: number;
  readonly draws: number;
  readonly black: number;
  readonly moves: readonly DatabaseMove[];
  readonly opening?: OpeningInfo;
  readonly topGames?: readonly DatabaseGameRef[];
  /** True when the provider capped the result set. */
  readonly truncated?: boolean;
}

export interface ExplorerFilters {
  readonly minRating?: number;
  readonly maxRating?: number;
  readonly sinceYear?: number;
  readonly untilYear?: number;
  readonly player?: string;
  /** Which side the named player had. */
  readonly playerColor?: 'w' | 'b';
  readonly speeds?: readonly string[];
}

export interface ExplorerQuery {
  readonly fen: Fen;
  readonly filters?: ExplorerFilters;
  /** Maximum number of moves to return. */
  readonly limit?: number;
}

export interface DatabaseCapabilities {
  readonly ratingFilter: boolean;
  readonly dateFilter: boolean;
  readonly playerFilter: boolean;
  readonly topGames: boolean;
  /** True when queries do not leave the machine. */
  readonly offline: boolean;
}

export type ProviderHealthState =
  | 'ready'
  | 'loading'
  | 'authentication-required'
  | 'companion-offline'
  | 'misconfigured'
  | 'rate-limited'
  | 'network-error'
  | 'unsupported'
  | 'error';

export interface ProviderHealth {
  readonly state: ProviderHealthState;
  readonly checkedAt: number;
  readonly latencyMs?: number;
  readonly message: string;
  readonly remedy?: string;
  readonly version?: string;
  readonly count?: number | null;
}

export interface ChessDatabaseProvider {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly capabilities: DatabaseCapabilities;
  explore(query: ExplorerQuery, signal?: AbortSignal): Promise<ExplorerResult>;
  health?(signal?: AbortSignal): Promise<ProviderHealth>;
  game?(id: string, signal?: AbortSignal): Promise<string>;
}

export class DatabaseError extends Error {
  constructor(
    message: string,
    readonly remedy?: string,
    readonly state: Exclude<ProviderHealthState, 'ready' | 'loading'> = 'error',
    readonly status?: number,
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export const totalGames = (move: DatabaseMove): number => move.white + move.draws + move.black;

/** Score for the side to move, in [0, 1]. */
export function moveScore(move: DatabaseMove, sideToMove: 'w' | 'b'): number {
  const total = totalGames(move);
  if (total === 0) return 0.5;
  const wins = sideToMove === 'w' ? move.white : move.black;
  return (wins + move.draws / 2) / total;
}

/**
 * Elo performance implied by a score against an average opposition rating.
 * Undefined when the score is a whitewash, where the formula has no answer.
 */
export function performanceRating(score: number, averageRating: number): number | undefined {
  if (score <= 0 || score >= 1) return undefined;
  return Math.round(averageRating - 400 * Math.log10(1 / score - 1));
}
