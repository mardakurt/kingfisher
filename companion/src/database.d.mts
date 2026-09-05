/**
 * Types for the companion's SQLite collection.
 *
 * The companion is plain JavaScript on purpose — it runs from `node` with no
 * build step — but the browser's round-trip tests drive the real class in
 * process, and an untyped import there would let a rename on this side pass
 * unnoticed until somebody ran a copy against a real companion.
 *
 * Only the surface the browser actually calls is declared. This file is a
 * contract, not a transcription: a method that appears here and not in
 * `database.mjs` is a bug, and so is the reverse for anything the browser uses.
 */

export interface GameDatabaseIntegrity {
  readonly positions: number;
  readonly aggregatedPositions: number;
  readonly aggregateRows: number;
  readonly filteredCacheKeys: number;
  readonly filteredAggregateRows: number;
}

export interface ExportedGame {
  readonly summary: Record<string, unknown>;
  readonly plyCount: number | null;
  readonly pgn: string | null;
  readonly positions: readonly Record<string, unknown>[];
}

export interface DuplicateKeyRow {
  readonly id: string;
  readonly fingerprint: string;
  readonly white: string;
  readonly black: string;
  readonly date?: string;
  readonly event?: string;
  readonly round?: string;
  readonly result: string;
}

export declare class GameDatabase {
  constructor(file: string);
  count(): number;
  insertGames(batch: readonly unknown[]): { imported: number; duplicates: number };
  search<T = unknown>(query?: unknown): T;
  content(id: number | string): string | null;
  explore<T = unknown>(positionKey: string, limit?: number, filters?: unknown): T;
  exportPage(
    after: string | null,
    limit: number,
    query: unknown,
  ): { games: readonly ExportedGame[]; nextAfter: string | null };
  haveFingerprints(fingerprints: readonly string[]): { present: readonly string[] };
  duplicateKeys(
    after: string | null,
    limit: number,
  ): { games: readonly DuplicateKeyRow[]; nextAfter: string | null };
  unclassifiedGames(
    digest: string,
    limit?: number,
    after?: string | null,
    maxPly?: number,
  ): {
    games: readonly {
      id: string;
      positionKeys: readonly string[];
      finalFen?: string;
      finalMoveUci?: string;
    }[];
    nextAfter: string | null;
  };
  classificationRemaining(digest: string): {
    remaining: number;
    total: number;
    classified: number;
  };
  applyClassification(entries: readonly unknown[]): { updated: number; remaining: number };
  deleteGamesByFingerprint(fingerprints: readonly string[]): {
    deleted: number;
    integrity?: GameDatabaseIntegrity;
  };
  deleteGamesMatching(query: unknown): { deleted: number; integrity?: GameDatabaseIntegrity };
  clear(): { deleted: number };
  aggregateIntegrity(): GameDatabaseIntegrity;
  rebuildAggregates(): void;
  rebuildPlayers(): void;
  players(prefix: string): readonly { name: string; games: number }[];
  gamesAtPosition<T = unknown>(positionKey: string, limit?: number): readonly T[];
  searchStructures<T = unknown>(query: unknown): readonly T[];
  unindexedPositions(limit?: number): {
    positions: readonly { positionKey: string }[];
    remaining: number;
  };
  applyStructures(entries: readonly unknown[]): { updated: number; remaining: number };
  /** Fold the write-ahead log back into the database file. */
  checkpoint(): void;
  close(): void;
}
