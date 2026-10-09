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
import { matchesGameSearch } from '@/persistence/game-match';
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
  TagKey,
  TagKeyPage,
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
   * The filter is the game list's matcher, applied by the cursor, so the page
   * is a page of matches rather than a slice of the store that is filtered
   * afterwards. The walk stops one match past the page. That extra row is not
   * returned; it is how the cursor says more matches may exist without
   * reading the rest of the collection. A query that only names a player, a
   * year and a minimum rating — what a copy sends — does not start requiring
   * the fields it leaves out.
   */
  async read(
    query: GameSearchQuery | null,
    after: string | null,
    limit: number,
  ): Promise<TransferPage> {
    const pageSize = Math.max(0, limit);
    if (pageSize === 0) return { games: [], nextAfter: null };
    const scan = await this.database.scan<GameSummary>(STORE_NAMES.games, {
      ...(after === null ? {} : { range: afterKey(after) }),
      // One past the page. Seeing that row is the truncated signal; holding
      // every later game is not.
      limit: pageSize + 1,
      ...(query
        ? { match: (game: GameSummary) => matchesGameSearch(game, query), stopEarly: true }
        : {}),
    });
    const more = scan.items.length > pageSize;
    const wanted = more ? scan.items.slice(0, pageSize) : scan.items;
    const nextAfter = more ? (wanted.at(-1)?.id ?? null) : null;
    if (wanted.length === 0) return { games: [], nextAfter };

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
    return { games, nextAfter };
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

  async tagKeys(after: string | null, limit: number): Promise<TagKeyPage> {
    const scan = await this.database.scan<GameSummary>(STORE_NAMES.games, {
      ...(after === null ? {} : { range: afterKey(after) }),
      limit,
    });
    const games: TagKey[] = [];
    await this.database.transaction([STORE_NAMES.gameContent], 'readonly', async (transaction) => {
      for (const summary of scan.items) {
        const content = await transaction.get<{ tree: GameRecord['tree'] }>(
          STORE_NAMES.gameContent,
          summary.id,
        );
        const headers = content?.tree.headers ?? {};
        const tag = (name: string) => {
          const value = headers[name]?.trim();
          return value && value !== '?' ? value : undefined;
        };
        const title = tag('Title');
        const annotator = tag('Annotator');
        const source = tag('Source');
        const whiteTeam = tag('WhiteTeam');
        const blackTeam = tag('BlackTeam');
        games.push({
          id: summary.id,
          ...(title ? { title } : {}),
          ...(annotator ? { annotator } : {}),
          ...(source ? { source } : {}),
          ...(whiteTeam ? { whiteTeam } : {}),
          ...(blackTeam ? { blackTeam } : {}),
        });
      }
    });
    return { games, nextAfter: scan.complete ? null : (scan.items.at(-1)?.id ?? null) };
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
        ...(game.site ? { site: game.site } : {}),
        ...(game.eco ? { eco: game.eco } : {}),
        ...(game.opening ? { opening: game.opening } : {}),
        ...(game.classification?.name ? { classifiedName: game.classification.name } : {}),
        ...(game.whiteRating !== undefined ? { whiteRating: game.whiteRating } : {}),
        ...(game.blackRating !== undefined ? { blackRating: game.blackRating } : {}),
      })),
      nextAfter: scan.complete ? null : (scan.items.at(-1)?.id ?? null),
    };
  }
}

/** Rebuild a summary for a game that arrived without one this store can use. */
export const summaryFromPgn = (pgn: string): GameSummary | null => {
  const parsed = parsePgn(pgn).games[0];
  if (!parsed) return null;
  const { tree: _tree, normalizedPgn: _pgn, ...summary } = normalizeGame(parsed.tree);
  return summary;
};
