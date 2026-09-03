/**
 * Shared vocabulary for pulling games from a linked online account.
 *
 * Reuses `ProviderHealthState` from the database layer rather than inventing
 * a second status vocabulary: "rate limited", "network error" and so on mean
 * the same thing here as they do for a database provider, and the Settings
 * panel can report both the same way.
 */

import type { ProviderHealthState } from '@/database/types';

export class SyncFetchError extends Error {
  constructor(
    message: string,
    readonly state: ProviderHealthState,
    readonly remedy?: string,
  ) {
    super(message);
    this.name = 'SyncFetchError';
  }
}

/** What a provider fetch produced, before it reaches the shared import pipeline. */
export interface FetchedGames {
  /** Concatenated PGN, ready for the existing `importGames` pipeline. Empty when there is nothing new. */
  readonly pgn: string;
  /** The cursor to persist for next time, if the fetch reached the end of what it asked for. */
  readonly cursor: SyncCursor;
}

export type SyncCursor =
  | { readonly kind: 'lichess'; readonly lastGameTimestamp: number | undefined }
  | { readonly kind: 'chess.com'; readonly lastSyncedMonth: string | undefined };
