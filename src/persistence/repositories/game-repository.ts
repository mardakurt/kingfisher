import { positionKey } from '@/chess/fen';
import type { Fen, San } from '@/chess/types';
import { aggregateLocalExplorer } from '@/database/local-aggregate';
import type { ExplorerFilters, ExplorerResult } from '@/database/types';

import type { PersistenceDatabase, PersistenceTransaction } from '../indexeddb/database';
import { boundKeys, onlyKey, type KeyRange } from '../indexeddb/key-range';
import { playerKey, STORE_NAMES } from '../schema/migrations';
import type {
  GameContent,
  GameId,
  GameRecord,
  GameRepository,
  GameSearchQuery,
  GameSearchResult,
  GameSummary,
  PersistGameResult,
  PositionRecord,
  TranspositionRoute,
} from '../types';
import { assertValid, isGameSummary } from '../validation';

/**
 * Above this many matching games, one bulk summary read is substantially
 * faster than one IndexedDB request per id. Browser measurements on Chromium
 * 152 put 50k individual reads at ~2.1 s; the bulk join plus aggregation was
 * ~363 ms and can be moved off the UI thread by the persistent provider.
 */
const BULK_EXPLORER_JOIN_THRESHOLD = 500;

/**
 * Above this many matches, ordering by reading them all costs more than
 * walking the sort index and testing each record until the page is full.
 */
const SORT_IN_MEMORY_LIMIT = 2_000;

/** Sort fields an index can already produce in order, and the index that does. */
const ORDERED_INDEXES: Record<NonNullable<GameSearchQuery['sortBy']>, string | null> = {
  importedAt: 'importedAt',
  date: 'date',
  white: 'white',
  black: 'black',
  rating: null,
  opening: null,
};

export class LocalGameRepository implements GameRepository {
  constructor(private readonly database: PersistenceDatabase) {}

  async count(): Promise<number> {
    return this.database.count(STORE_NAMES.games);
  }

  /** Summary plus moves, joined. Only opening a game needs this. */
  async get(id: GameId): Promise<GameRecord | null> {
    return this.database.transaction(
      [STORE_NAMES.games, STORE_NAMES.gameContent],
      'readonly',
      async (transaction) => {
        const raw = await transaction.get<unknown>(STORE_NAMES.games, id);
        if (raw === undefined) return null;
        const summary = assertValid(raw, isGameSummary, 'game');
        const content = await transaction.get<GameContent>(STORE_NAMES.gameContent, id);
        if (!content) {
          throw new Error('That game is stored without its moves and cannot be opened.');
        }
        return { ...summary, tree: content.tree, normalizedPgn: content.normalizedPgn };
      },
    );
  }

  async getMany(ids: readonly GameId[]): Promise<readonly GameRecord[]> {
    if (ids.length === 0) return [];
    return this.database.transaction(
      [STORE_NAMES.games, STORE_NAMES.gameContent],
      'readonly',
      async (transaction) => {
        const games: GameRecord[] = [];
        for (const id of [...new Set(ids)]) {
          const raw = await transaction.get<unknown>(STORE_NAMES.games, id);
          if (raw === undefined) continue;
          const summary = assertValid(raw, isGameSummary, 'game');
          const content = await transaction.get<GameContent>(STORE_NAMES.gameContent, id);
          if (!content) throw new Error(`Game ${id} is stored without its moves.`);
          games.push({ ...summary, tree: content.tree, normalizedPgn: content.normalizedPgn });
        }
        return games;
      },
    );
  }

  async summary(id: GameId): Promise<GameSummary | null> {
    const raw = await this.database.get<unknown>(STORE_NAMES.games, id);
    return raw === undefined ? null : assertValid(raw, isGameSummary, 'game');
  }

  async summaries(ids: readonly GameId[]): Promise<readonly GameSummary[]> {
    if (ids.length === 0) return [];
    return this.database.transaction([STORE_NAMES.games], 'readonly', async (transaction) => {
      const out: GameSummary[] = [];
      for (const id of ids) {
        const raw = await transaction.get<unknown>(STORE_NAMES.games, id);
        if (raw !== undefined) out.push(assertValid(raw, isGameSummary, 'game'));
      }
      return out;
    });
  }

  async findByFingerprint(fingerprint: string): Promise<GameSummary | null> {
    const matches = await this.database.getAllFromIndex<unknown>(
      STORE_NAMES.games,
      'fingerprint',
      fingerprint,
    );
    const first = matches[0];
    return first === undefined ? null : assertValid(first, isGameSummary, 'game');
  }

  /**
   * Search, planned rather than filtered.
   *
   * Phase 2 read every game record into memory and filtered the array, which
   * meant deserialising every stored game tree to answer "show me twenty rows".
   * This picks an index that answers as much of the query as possible, walks it
   * with a cursor, and stops once the page is full — so the cost tracks the
   * number of *matches*, not the size of the collection.
   *
   * The remaining predicates are applied per visited record because IndexedDB
   * has no compound query language; that is fine, because the index has already
   * narrowed what gets visited.
   */
  async search(query: GameSearchQuery = {}): Promise<GameSearchResult> {
    const plan = planQuery(query);
    const offset = Math.max(0, query.offset ?? 0);
    const limit = Math.max(1, query.limit ?? 100);
    const sortBy = query.sortBy ?? 'importedAt';
    const descending = query.sortDirection !== 'asc';

    /*
      Case 1: the index the plan walks already produces the requested order, so
      a page is a page.

      When the plan is also exact, the total comes from a key cursor, which
      never deserialises a record — cheap enough to always report. When it is
      not, counting means visiting every record in the range to test it, and
      that is the scan ADR 0014 exists to avoid: the walk stops one row past
      the page and reports `hasMore` instead. `exactTotal` buys the count back
      for the caller that genuinely needs it.
    */
    if (plan.ordered) {
      const direction: IDBCursorDirection = descending ? 'prev' : 'next';
      if (plan.exact) {
        const [total, page] = await Promise.all([
          this.database.countRange(STORE_NAMES.games, plan.index, plan.range),
          this.database.scan<GameSummary>(STORE_NAMES.games, {
            ...(plan.index ? { index: plan.index } : {}),
            ...(plan.range ? { range: plan.range } : {}),
            direction,
            offset,
            limit,
          }),
        ]);
        return { games: page.items, total, hasMore: offset + page.items.length < total };
      }

      const result = await this.database.scan<GameSummary>(STORE_NAMES.games, {
        ...(plan.index ? { index: plan.index } : {}),
        ...(plan.range ? { range: plan.range } : {}),
        direction,
        match: (game) => matchesSearch(game, query),
        offset,
        // One row past the page answers "is there more" without counting.
        limit: query.exactTotal ? limit : limit + 1,
        ...(query.exactTotal ? {} : { stopEarly: true }),
      });

      if (query.exactTotal) {
        return {
          games: result.items,
          total: result.total,
          hasMore: offset + result.items.length < result.total,
        };
      }
      const hasMore = result.items.length > limit;
      return { games: hasMore ? result.items.slice(0, limit) : result.items, total: null, hasMore };
    }

    /*
      Case 2: the narrowing index answers the filters but not the order.

      Two honest ways out, chosen by how much the range holds; that count is a
      key-cursor count, so asking is nearly free.
    */
    const narrowed = plan.exact
      ? await this.database.countRange(STORE_NAMES.games, plan.index, plan.range)
      : null;
    const orderedIndex = ORDERED_INDEXES[sortBy];

    if (narrowed !== null && orderedIndex && narrowed > SORT_IN_MEMORY_LIMIT) {
      // Too many matches to hold and sort. Walk the sort index instead and test
      // each record; the page fills in order and the walk stops there.
      const page = await this.database.scan<GameSummary>(STORE_NAMES.games, {
        index: orderedIndex,
        direction: descending ? 'prev' : 'next',
        match: (game) => matchesSearch(game, query),
        offset,
        limit,
        stopEarly: true,
      });
      return {
        games: page.items,
        total: narrowed,
        hasMore: offset + page.items.length < narrowed,
      };
    }

    // Few enough matches to order properly: read the range, sort it, page it.
    // The whole match set is in hand, so the total is exact and free.
    const all = await this.database.scan<GameSummary>(STORE_NAMES.games, {
      ...(plan.index ? { index: plan.index } : {}),
      ...(plan.range ? { range: plan.range } : {}),
      ...(plan.exact ? {} : { match: (game: GameSummary) => matchesSearch(game, query) }),
    });
    const sorted = [...all.items].sort(
      (a, b) => compareGames(a, b, sortBy) * (descending ? -1 : 1),
    );
    const total = narrowed ?? sorted.length;
    return {
      games: sorted.slice(offset, offset + limit),
      total,
      hasMore: offset + limit < total,
    };
  }

  async persist(
    game: GameRecord,
    positions: readonly PositionRecord[],
  ): Promise<PersistGameResult> {
    const [result] = await this.persistMany([{ game, positions }]);
    if (!result) throw new Error('The game could not be stored.');
    return result;
  }

  /**
   * Store a batch of games in one transaction.
   *
   * The batch is the unit of atomicity, and that — not throughput — is the
   * reason it exists: a cancelled or failed import leaves whole batches
   * committed and never half a game, with its summary written but its moves or
   * its position index missing. Measured import speed was unchanged by batch
   * size, because the cost is in parsing and position extraction rather than in
   * transaction commits.
   */
  async persistMany(
    entries: readonly { game: GameRecord; positions: readonly PositionRecord[] }[],
  ): Promise<PersistGameResult[]> {
    if (entries.length === 0) return [];

    return this.database.transaction(
      [STORE_NAMES.games, STORE_NAMES.gameContent, STORE_NAMES.positions],
      'readwrite',
      async (transaction) => {
        const results: PersistGameResult[] = [];
        // Fingerprints seen earlier in this same batch, so a file containing
        // the same game twice is caught before either copy is written.
        const seen = new Set<string>();

        for (const entry of entries) {
          if (seen.has(entry.game.fingerprint)) {
            results.push({ game: entry.game, duplicate: true });
            continue;
          }
          const duplicate = await findFingerprint(transaction, entry.game.fingerprint);
          if (duplicate) {
            results.push({ game: duplicate, duplicate: true });
            continue;
          }
          seen.add(entry.game.fingerprint);
          const { tree, normalizedPgn, ...summary } = entry.game;
          await transaction.put(STORE_NAMES.games, summary);
          await transaction.put(STORE_NAMES.gameContent, { id: summary.id, tree, normalizedPgn });
          for (const position of entry.positions) {
            await transaction.put(STORE_NAMES.positions, position);
          }
          results.push({ game: entry.game, duplicate: false });
        }
        return results;
      },
    );
  }

  async delete(id: GameId): Promise<void> {
    await this.deleteMany([id]);
  }

  async deleteMany(ids: readonly GameId[]): Promise<void> {
    if (ids.length === 0) return;
    await this.database.transaction(
      [STORE_NAMES.games, STORE_NAMES.gameContent, STORE_NAMES.positions],
      'readwrite',
      async (transaction) => {
        for (const id of new Set(ids)) {
          const positions = await transaction.getAllFromIndex<PositionRecord>(
            STORE_NAMES.positions,
            'gameId',
            id,
          );
          for (const position of positions) {
            await transaction.delete(STORE_NAMES.positions, position.id);
          }
          await transaction.delete(STORE_NAMES.games, id);
          await transaction.delete(STORE_NAMES.gameContent, id);
        }
      },
    );
  }

  async clear(): Promise<void> {
    await this.database.transaction(
      [STORE_NAMES.games, STORE_NAMES.gameContent, STORE_NAMES.positions],
      'readwrite',
      async (transaction) => {
        await transaction.clear(STORE_NAMES.positions);
        await transaction.clear(STORE_NAMES.gameContent);
        await transaction.clear(STORE_NAMES.games);
      },
    );
  }

  async countAtPosition(key: string): Promise<number> {
    const records = await this.database.getAllFromIndex<PositionRecord>(
      STORE_NAMES.positions,
      'positionKey',
      key,
    );
    return new Set(records.map((record) => record.gameId)).size;
  }

  /**
   * The move orders that actually reached this position in stored games.
   *
   * Bounded on purpose: a position in a popular opening is reached by thousands
   * of games, and the user wants to see the two or three distinct orders, not a
   * census. Games are sampled, their prefixes reconstructed from the position
   * index, and identical orders merged.
   */
  async routesToPosition(key: string, limit = 4): Promise<readonly TranspositionRoute[]> {
    const arrivals = await this.database.getAllFromIndex<PositionRecord>(
      STORE_NAMES.positions,
      'positionKey',
      key,
    );
    if (arrivals.length === 0) return [];

    // The earliest arrival per game is the one that names the move order.
    const firstByGame = new Map<GameId, number>();
    for (const record of arrivals) {
      const current = firstByGame.get(record.gameId);
      if (current === undefined || record.ply < current) firstByGame.set(record.gameId, record.ply);
    }

    const counts = new Map<string, { moves: San[]; games: number }>();
    const sample = [...firstByGame.entries()].slice(0, 60);

    for (const [gameId, ply] of sample) {
      const records = await this.database.getAllFromIndex<PositionRecord>(
        STORE_NAMES.positions,
        'gameId',
        gameId,
      );
      const moves = records
        .filter((record) => record.ply <= ply)
        .sort((a, b) => a.ply - b.ply)
        .map((record) => record.moveSan);
      if (moves.length === 0) continue;
      const signature = moves.join(' ');
      const existing = counts.get(signature);
      if (existing) existing.games += 1;
      else counts.set(signature, { moves, games: 1 });
    }

    return [...counts.values()].sort((a, b) => b.games - a.games).slice(0, limit);
  }

  async explore(fen: Fen, filters: ExplorerFilters = {}, limit = 20): Promise<ExplorerResult> {
    const key = positionKey(fen);
    const records = await this.database.getAllFromIndex<PositionRecord>(
      STORE_NAMES.positions,
      'positionKey',
      key,
    );
    const uniqueGameIds = [...new Set(records.map((record) => record.gameId))];
    const includedIds = new Set(uniqueGameIds);

    /*
      One transaction for every game the position touches. Reading them one at a
      time opened a transaction per game, which at ten thousand games meant ten
      thousand transaction round trips to answer a single explorer query.
    */
    const games = (
      uniqueGameIds.length > BULK_EXPLORER_JOIN_THRESHOLD
        ? await this.database.getAll<GameSummary>(STORE_NAMES.games)
        : await this.database.transaction([STORE_NAMES.games], 'readonly', async (transaction) => {
            const loaded: (GameSummary | undefined)[] = [];
            for (const id of uniqueGameIds) {
              loaded.push(await transaction.get<GameSummary>(STORE_NAMES.games, id));
            }
            return loaded;
          })
    ).filter(
      (game): game is GameSummary =>
        game !== undefined &&
        (uniqueGameIds.length <= BULK_EXPLORER_JOIN_THRESHOLD || includedIds.has(game.id)),
    );
    return aggregateLocalExplorer(fen, records, games, filters, limit);
  }
}

async function findFingerprint(
  transaction: PersistenceTransaction,
  fingerprint: string,
): Promise<GameRecord | null> {
  const matches = await transaction.getAllFromIndex<unknown>(
    STORE_NAMES.games,
    'fingerprint',
    fingerprint,
  );
  const first = matches[0];
  return first === undefined ? null : (assertValid(first, isGameSummary, 'game') as GameRecord);
}

interface QueryPlan {
  /** The index to walk, or null to walk the primary key. */
  readonly index: string | null;
  readonly range?: KeyRange;
  /** True when walking this index already yields the requested sort order. */
  readonly ordered: boolean;
  /**
   * True when the index range answers the query exactly, so no record needs to
   * be inspected. This is what lets an unfiltered list count ten thousand games
   * through a key cursor instead of deserialising ten thousand game trees.
   */
  readonly exact: boolean;
}

/**
 * Choose the index that narrows the search most.
 *
 * Ordered by selectivity, not by convenience: a player name usually cuts a
 * collection to a handful of games, a year to a few percent, a result to a
 * third. Anything less selective than a third is not worth an index walk, and
 * the plan falls back to the natural order.
 */
function planQuery(query: GameSearchQuery): QueryPlan {
  /*
    Count the predicates the query actually carries, then let a plan call itself
    exact only if it consumed all of them. Deriving `exact` this way rather than
    listing exceptions per branch is what stops a filter being silently dropped
    when a plan falls through — a bug that returns too many games rather than an
    error, which is the worst kind.
  */
  const player = playerKey(query.player);
  const predicates =
    (player ? 1 : 0) +
    (query.result ? 1 : 0) +
    (query.fromYear || query.toYear ? 1 : 0) +
    (query.text?.trim() ? 1 : 0) +
    (query.minRating ? 1 : 0) +
    (query.opening ? 1 : 0) +
    (query.eco ? 1 : 0);

  const plan = (index: string | null, range: KeyRange | null, consumed: number): QueryPlan => ({
    index,
    ...(range ? { range } : {}),
    ordered: false,
    exact: consumed === predicates,
  });

  if (player) {
    // `player` means a whole normalized name, which is what the index holds and
    // what `matchesSearch` tests, so both paths agree about who a player is.
    // Partial-name searching is what `text` is for.
    const range = onlyKey(player);
    if (query.playerColor === 'w') return plan('whiteKey', range, 1);
    if (query.playerColor === 'b') return plan('blackKey', range, 1);
    return plan('players', range, 1);
  }

  if (query.fromYear || query.toYear) {
    return plan('year', boundKeys(query.fromYear ?? 0, query.toYear ?? 9999), 1);
  }

  if (query.result) return plan('result', onlyKey(query.result), 1);

  // Nothing selective to narrow by: walk the sort index itself so the page
  // arrives already ordered and nothing outside it is deserialised.
  const orderedIndex = ORDERED_INDEXES[query.sortBy ?? 'importedAt'];

  return {
    index: orderedIndex ?? null,
    ordered: orderedIndex !== null,
    exact: predicates === 0,
  };
}

function matchesSearch(game: GameSummary, query: GameSearchQuery): boolean {
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
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(text)) return false;
  }
  const player = playerKey(query.player);
  if (player) {
    // Whole-name equality, never a substring: `text` searches names loosely,
    // `player` names one person. Merging two people who share a surname is a
    // worse failure than showing nothing for a half-typed name.
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
  if (query.opening && !game.opening?.toLowerCase().includes(query.opening.toLowerCase()))
    return false;
  if (query.eco && !game.eco?.toLowerCase().startsWith(query.eco.toLowerCase())) return false;
  return true;
}

function compareGames(
  a: GameSummary,
  b: GameSummary,
  field: NonNullable<GameSearchQuery['sortBy']>,
): number {
  if (field === 'white') return a.white.localeCompare(b.white);
  if (field === 'black') return a.black.localeCompare(b.black);
  if (field === 'date') return (a.date ?? '').localeCompare(b.date ?? '');
  if (field === 'opening') return (a.opening ?? '').localeCompare(b.opening ?? '');
  if (field === 'rating') {
    return (
      Math.max(a.whiteRating ?? 0, a.blackRating ?? 0) -
      Math.max(b.whiteRating ?? 0, b.blackRating ?? 0)
    );
  }
  return a.importedAt - b.importedAt;
}
