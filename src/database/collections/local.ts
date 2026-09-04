/**
 * The browser's own collection, behind the collection port.
 *
 * Reads and writes go through the same repository the rest of the application
 * uses, so a copy lands games that are indistinguishable from imported ones:
 * same fingerprint uniqueness, same position index, same classification. What
 * this adds is paging by primary key and a bulk fingerprint probe, neither of
 * which the repository needed before there was anywhere to copy games to.
 */

import { parsePgn } from '@/chess/pgn';
import type { PersistenceDatabase } from '@/persistence/indexeddb/database';
import type { KeyRange } from '@/persistence/indexeddb/key-range';
import { normalizeGame } from '@/persistence/prepare-game';
import { STORE_NAMES } from '@/persistence/schema/migrations';
import type {
  GameRecord,
  GameRepository,
  GameSearchQuery,
  GameSummary,
  PositionRecord,
} from '@/persistence/types';

import type {
  DuplicateKeyPage,
  GameCollection,
  GameCollectionRef,
  TransferGame,
  TransferPage,
  WriteOutcome,
} from './types';

export const LOCAL_COLLECTION_ID = 'local';

const afterKey = (id: string): KeyRange => ({ kind: 'lowerBound', lower: id, lowerOpen: true });

export class LocalGameCollection implements GameCollection {
  readonly ref: GameCollectionRef = {
    id: LOCAL_COLLECTION_ID,
    kind: 'indexeddb',
    name: 'My games',
  };

  constructor(
    private readonly database: PersistenceDatabase,
    private readonly repository: GameRepository,
  ) {}

  count(): Promise<number> {
    return this.database.count(STORE_NAMES.games);
  }

  /**
   * A page of complete games in primary-key order.
   *
   * The filter is applied per record rather than through the query planner
   * because the walk is already in key order for the cursor's sake, and a copy
   * has to visit every candidate anyway. `matchesTransferQuery` is the same
   * predicate the game list uses, so "copy these results" copies these results.
   */
  async read(
    query: GameSearchQuery | null,
    after: string | null,
    limit: number,
  ): Promise<TransferPage> {
    const scan = await this.database.scan<GameSummary>(STORE_NAMES.games, {
      ...(after === null ? {} : { range: afterKey(after) }),
      limit,
    });
    const cursor = scan.items.at(-1)?.id ?? null;
    const wanted = query
      ? scan.items.filter((game) => matchesTransferQuery(game, query))
      : scan.items;
    if (wanted.length === 0) return { games: [], nextAfter: scan.complete ? null : cursor };

    const games: TransferGame[] = [];
    await this.database.transaction(
      [STORE_NAMES.gameContent, STORE_NAMES.positions],
      'readonly',
      async (transaction) => {
        for (const summary of wanted) {
          const content = await transaction.get<{
            tree: GameRecord['tree'];
            normalizedPgn: string;
          }>(STORE_NAMES.gameContent, summary.id);
          // A summary whose movetext is missing is corrupt, not copyable. The
          // integrity scanner reports it; a copy silently skips it rather than
          // writing half a game into a second collection.
          if (!content) continue;
          const positions = await transaction.getAllFromIndex<PositionRecord>(
            STORE_NAMES.positions,
            'gameId',
            summary.id,
          );
          games.push({
            summary,
            pgn: content.normalizedPgn,
            tree: content.tree,
            positions: positions.map(({ id: _id, gameId: _gameId, ...rest }) => rest),
          });
        }
      },
    );
    return { games, nextAfter: scan.complete ? null : cursor };
  }

  async have(fingerprints: readonly string[]): Promise<ReadonlySet<string>> {
    const present = new Set<string>();
    if (fingerprints.length === 0) return present;
    await this.database.transaction([STORE_NAMES.games], 'readonly', async (transaction) => {
      for (const fingerprint of fingerprints) {
        const matches = await transaction.getAllFromIndex<GameSummary>(
          STORE_NAMES.games,
          'fingerprint',
          fingerprint,
        );
        if (matches.length > 0) present.add(fingerprint);
      }
    });
    return present;
  }

  /**
   * Store games copied from another collection.
   *
   * The record is rebuilt rather than trusted wholesale: the id is derived from
   * the fingerprint the way an import derives it, so a game copied here has the
   * same identity it would have had if it had been imported here. A game from a
   * SQLite source arrives without a tree and is parsed once, here, which is the
   * only place in a copy where movetext is reparsed at all.
   */
  async write(games: readonly TransferGame[]): Promise<WriteOutcome> {
    if (games.length === 0) return { written: 0, duplicates: 0, present: [] };
    const entries: { game: GameRecord; positions: PositionRecord[] }[] = [];
    for (const transfer of games) {
      const tree = transfer.tree ?? parsePgn(transfer.pgn).games[0]?.tree;
      if (!tree) continue;
      const id = `game-${transfer.summary.fingerprint}`;
      const record: GameRecord = {
        ...(transfer.summary as Omit<GameSummary, 'id'>),
        id,
        tree,
        normalizedPgn: transfer.pgn,
      };
      entries.push({
        game: record,
        positions: transfer.positions.map((position) => ({
          ...position,
          id: `${position.positionKey}|${id}|${position.ply}|${position.moveUci}`,
          gameId: id,
        })),
      });
    }

    const results = await this.repository.persistMany(entries);
    let written = 0;
    let duplicates = 0;
    for (const result of results) {
      if (result.duplicate) duplicates += 1;
      else written += 1;
    }
    return {
      written,
      duplicates,
      present: entries.map((entry) => entry.game.fingerprint),
    };
  }

  async removeByFingerprint(fingerprints: readonly string[]): Promise<number> {
    if (fingerprints.length === 0) return 0;
    const ids: string[] = [];
    await this.database.transaction([STORE_NAMES.games], 'readonly', async (transaction) => {
      for (const fingerprint of fingerprints) {
        const matches = await transaction.getAllFromIndex<GameSummary>(
          STORE_NAMES.games,
          'fingerprint',
          fingerprint,
        );
        for (const match of matches) ids.push(match.id);
      }
    });
    await this.repository.deleteMany(ids);
    return ids.length;
  }

  async duplicateKeys(after: string | null, limit: number): Promise<DuplicateKeyPage> {
    const scan = await this.database.scan<GameSummary>(STORE_NAMES.games, {
      ...(after === null ? {} : { range: afterKey(after) }),
      limit,
    });
    return {
      games: scan.items.map((game) => ({
        id: game.id,
        fingerprint: game.fingerprint,
        white: game.white,
        black: game.black,
        ...(game.date ? { date: game.date } : {}),
        ...(game.event ? { event: game.event } : {}),
        ...(game.round ? { round: game.round } : {}),
        result: game.result,
      })),
      nextAfter: scan.complete ? null : (scan.items.at(-1)?.id ?? null),
    };
  }
}

/**
 * The filter a copy applies, matching the game list's own semantics.
 *
 * Kept here rather than reusing the repository's private matcher because a copy
 * needs it over records it has already read; the fields and the rules are the
 * same ones, including consulting both the declared and the computed opening.
 */
export function matchesTransferQuery(game: GameSummary, query: GameSearchQuery): boolean {
  const text = query.text?.trim().toLowerCase();
  if (text) {
    const haystack = [
      game.white,
      game.black,
      game.event,
      game.site,
      game.opening,
      game.variation,
      game.eco,
      game.classification?.name,
      game.classification?.variation,
      game.classification?.eco,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(text)) return false;
  }
  const player = query.player?.trim().toLowerCase().replace(/\s+/g, ' ');
  if (player) {
    const white = game.whiteKey === player;
    const black = game.blackKey === player;
    if (
      query.playerColor === 'w' ? !white : query.playerColor === 'b' ? !black : !white && !black
    ) {
      return false;
    }
  }
  if (query.result && game.result !== query.result) return false;
  if (query.fromYear && (!game.year || game.year < query.fromYear)) return false;
  if (query.toYear && (!game.year || game.year > query.toYear)) return false;
  if (query.minRating) {
    const ratings = [game.whiteRating, game.blackRating].filter(
      (rating): rating is number => rating !== undefined,
    );
    if (!ratings.length || Math.max(...ratings) < query.minRating) return false;
  }
  if (query.eco) {
    const needle = query.eco.toLowerCase();
    const codes = [game.eco, game.classification?.eco].filter(Boolean) as string[];
    if (!codes.some((code) => code.toLowerCase().startsWith(needle))) return false;
  }
  if (query.opening) {
    const needle = query.opening.toLowerCase();
    const names = [game.opening, game.classification?.name, game.classification?.variation].filter(
      Boolean,
    ) as string[];
    if (!names.some((name) => name.toLowerCase().includes(needle))) return false;
  }
  return true;
}

/** Rebuild a summary for a game that arrived without one this store can use. */
export const summaryFromPgn = (pgn: string): GameSummary | null => {
  const parsed = parsePgn(pgn).games[0];
  if (!parsed) return null;
  const { tree: _tree, normalizedPgn: _pgn, ...summary } = normalizeGame(parsed.tree);
  return summary;
};
