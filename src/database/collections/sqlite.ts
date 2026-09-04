/**
 * A companion SQLite collection, behind the collection port.
 *
 * Every method is one bounded companion request. The interesting asymmetry with
 * the IndexedDB side is what travels: SQLite stores movetext rather than a game
 * tree, so a game read from here has no `tree` and the destination parses one
 * if it needs one — which only the browser's collection does.
 */

import { asFen, asSan, asUci } from '@/chess/types';
import type { CompanionClient, CompanionExportedGame } from '@/companion/client';
import type { GameSearchQuery, GameSummary, PositionRecord } from '@/persistence/types';

import type {
  DuplicateKeyPage,
  GameCollection,
  GameCollectionRef,
  TransferGame,
  TransferPage,
  WriteOutcome,
} from './types';

/** Fingerprints per probe. Small enough to stay inside one SQL statement. */
const PROBE_CHUNK = 500;

export const sqliteCollectionId = (key: string) => `sqlite:${key}`;

export class SqliteGameCollection implements GameCollection {
  readonly ref: GameCollectionRef;

  constructor(
    private readonly client: CompanionClient,
    private readonly key: string,
    name: string,
  ) {
    this.ref = { id: sqliteCollectionId(key), kind: 'sqlite', name };
  }

  async count(): Promise<number> {
    const status = await this.client.status();
    return status.databases.find((entry) => entry.key === this.key)?.games ?? 0;
  }

  async read(
    query: GameSearchQuery | null,
    after: string | null,
    limit: number,
  ): Promise<TransferPage> {
    const page = await this.client.exportPage(this.key, after, limit, sqliteQuery(query));
    return {
      games: page.games.flatMap((game) => {
        const transfer = toTransfer(game);
        return transfer ? [transfer] : [];
      }),
      nextAfter: page.nextAfter,
    };
  }

  async have(fingerprints: readonly string[]): Promise<ReadonlySet<string>> {
    const present = new Set<string>();
    for (let i = 0; i < fingerprints.length; i += PROBE_CHUNK) {
      const chunk = fingerprints.slice(i, i + PROBE_CHUNK);
      const answer = await this.client.haveFingerprints(this.key, chunk);
      for (const fingerprint of answer.present) present.add(fingerprint);
    }
    return present;
  }

  /**
   * Write games into the SQLite collection.
   *
   * Reuses the import route, which already enforces fingerprint uniqueness and
   * maintains the explorer aggregates, the player table and the metadata index
   * in the same transaction. A copy that wrote rows directly would be a second
   * way for a collection's derived tables to be built, and eventually a second
   * way for them to be wrong.
   */
  async write(games: readonly TransferGame[]): Promise<WriteOutcome> {
    if (games.length === 0) return { written: 0, duplicates: 0, present: [] };
    const payload = games.map((game) => ({
      game: {
        fingerprint: game.summary.fingerprint,
        white: game.summary.white,
        black: game.summary.black,
        whiteKey: game.summary.whiteKey,
        blackKey: game.summary.blackKey,
        result: game.summary.result,
        date: game.summary.date,
        year: game.summary.year,
        event: game.summary.event,
        site: game.summary.site,
        round: game.summary.round,
        whiteRating: game.summary.whiteRating,
        blackRating: game.summary.blackRating,
        eco: game.summary.eco,
        opening: game.summary.opening,
        classification: game.summary.classification,
        classifiedWith: game.summary.classifiedWith,
        plyCount: game.positions.length,
        importedAt: game.summary.importedAt,
      },
      pgn: game.pgn,
      positions: game.positions,
    }));
    const result = await this.client.importGames(this.key, payload);
    return {
      written: result.imported,
      duplicates: result.duplicates,
      present: games.map((game) => game.summary.fingerprint),
    };
  }

  async removeByFingerprint(fingerprints: readonly string[]): Promise<number> {
    if (fingerprints.length === 0) return 0;
    let deleted = 0;
    for (let i = 0; i < fingerprints.length; i += PROBE_CHUNK) {
      const chunk = fingerprints.slice(i, i + PROBE_CHUNK);
      const result = await this.client.deleteGames(this.key, { fingerprints: chunk });
      deleted += result.deleted;
    }
    return deleted;
  }

  async duplicateKeys(after: string | null, limit: number): Promise<DuplicateKeyPage> {
    const page = await this.client.duplicateKeys(this.key, after, limit);
    return { games: page.games, nextAfter: page.nextAfter };
  }
}

/** Only the filters the SQLite matcher actually implements. */
function sqliteQuery(query: GameSearchQuery | null): Record<string, unknown> | null {
  if (!query) return null;
  const built: Record<string, unknown> = {};
  if (query.text?.trim()) built.text = query.text.trim();
  if (query.player?.trim()) {
    built.player = query.player.trim().toLowerCase().replace(/\s+/g, ' ');
    if (query.playerColor) built.playerColor = query.playerColor;
  }
  if (query.result) built.result = query.result;
  if (query.fromYear) built.fromYear = query.fromYear;
  if (query.toYear) built.toYear = query.toYear;
  if (query.minRating) built.minRating = query.minRating;
  if (query.eco) built.eco = query.eco;
  if (query.opening) built.opening = query.opening;
  return Object.keys(built).length > 0 ? built : null;
}

/**
 * A companion row turned into a transferable game.
 *
 * A row whose movetext is missing is dropped rather than sent: the destination
 * cannot store a game with no moves, and inventing an empty one would produce a
 * fingerprint that matches nothing and a row that looks like a real game in a
 * game list.
 */
function toTransfer(game: CompanionExportedGame): TransferGame | null {
  if (!game.pgn) return null;
  const summary = game.summary as unknown as Omit<GameSummary, 'id'> & { id?: string };
  if (!summary?.fingerprint) return null;
  return {
    summary,
    pgn: game.pgn,
    positions: game.positions.map(
      (position) =>
        ({
          positionKey: String(position.positionKey ?? ''),
          ply: Number(position.ply ?? 0),
          moveUci: asUci(String(position.moveUci ?? '')),
          moveSan: asSan(String(position.moveSan ?? '')),
          mover: position.mover === 'b' ? 'b' : 'w',
          ...(position.fen ? { fen: asFen(String(position.fen)) } : {}),
          ...(position.nodeId ? { nodeId: String(position.nodeId) } : {}),
          ...(position.pawnSkeleton ? { pawnSkeleton: String(position.pawnSkeleton) } : {}),
          ...(position.structureSignature
            ? { structureSignature: String(position.structureSignature) }
            : {}),
          ...(Array.isArray(position.structureClaims)
            ? { structureClaims: position.structureClaims.map(String) }
            : {}),
        }) satisfies Omit<PositionRecord, 'id' | 'gameId'>,
    ),
  };
}
