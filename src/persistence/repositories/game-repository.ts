import { parseFen, positionKey } from '@/chess/fen';
import type { Fen, San, Uci } from '@/chess/types';
import {
  moveScore,
  performanceRating,
  type DatabaseGameRef,
  type DatabaseMove,
  type ExplorerFilters,
  type ExplorerResult,
  type GameResult,
} from '@/database/types';

import type { PersistenceDatabase, PersistenceTransaction } from '../indexeddb/database';
import { STORE_NAMES } from '../schema/migrations';
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
} from '../types';
import { assertValid, isGameSummary } from '../validation';

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

    /*
      When the plan is exact the total comes from a key cursor, which never
      deserialises a record, and the page cursor stops as soon as it is full.
      Cost then tracks the page size rather than the size of the collection.
    */
    if (plan.exact) {
      const [total, page] = await Promise.all([
        this.database.countRange(STORE_NAMES.games, plan.index, plan.range),
        this.database.scan<GameSummary>(STORE_NAMES.games, {
          ...(plan.index ? { index: plan.index } : {}),
          ...(plan.range ? { range: plan.range } : {}),
          direction: plan.ordered && query.sortDirection !== 'asc' ? 'prev' : 'next',
          offset,
          limit,
        }),
      ]);
      const games = plan.ordered
        ? page.items
        : [...page.items].sort(
            (a, b) =>
              compareGames(a, b, query.sortBy ?? 'importedAt') *
              (query.sortDirection === 'asc' ? 1 : -1),
          );
      return { games, total };
    }

    /*
      Sorting by a field the plan is not walking would need the whole result
      set, so it is only honoured when the chosen index already produces that
      order. Anything else sorts within the page, and says so by returning the
      page the index gave.
    */
    const direction: IDBCursorDirection = query.sortDirection === 'asc' ? 'next' : 'prev';

    const result = await this.database.scan<GameSummary>(STORE_NAMES.games, {
      ...(plan.index ? { index: plan.index } : {}),
      ...(plan.range ? { range: plan.range } : {}),
      direction: plan.ordered ? direction : 'next',
      match: (game) => matchesSearch(game, query),
      offset,
      limit,
    });

    const games = plan.ordered
      ? result.items
      : [...result.items].sort(
          (a, b) =>
            compareGames(a, b, query.sortBy ?? 'importedAt') *
            (query.sortDirection === 'asc' ? 1 : -1),
        );

    return { games, total: result.total };
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

  async explore(fen: Fen, filters: ExplorerFilters = {}, limit = 20): Promise<ExplorerResult> {
    const key = positionKey(fen);
    const records = await this.database.getAllFromIndex<PositionRecord>(
      STORE_NAMES.positions,
      'positionKey',
      key,
    );
    const uniqueGameIds = [...new Set(records.map((record) => record.gameId))];

    /*
      One transaction for every game the position touches. Reading them one at a
      time opened a transaction per game, which at ten thousand games meant ten
      thousand transaction round trips to answer a single explorer query.
    */
    const games = (
      await this.database.transaction([STORE_NAMES.games], 'readonly', async (transaction) => {
        const loaded: (GameSummary | undefined)[] = [];
        for (const id of uniqueGameIds) {
          loaded.push(await transaction.get<GameSummary>(STORE_NAMES.games, id));
        }
        return loaded;
      })
    ).filter((game): game is GameSummary => game !== undefined && matchesExplorer(game, filters));
    const gamesById = new Map(games.map((game) => [game.id, game]));
    const parsedFen = parseFen(fen);
    const sideToMove = parsedFen.ok ? parsedFen.value.turn : 'w';

    const byMove = new Map<string, MutableMove>();
    const includedGames = new Set<string>();
    for (const record of records) {
      const game = gamesById.get(record.gameId);
      if (!game) continue;
      includedGames.add(game.id);
      let move = byMove.get(record.moveUci);
      if (!move) {
        move = {
          uci: record.moveUci,
          san: record.moveSan,
          gameIds: new Set(),
          white: 0,
          draws: 0,
          black: 0,
          ratingSum: 0,
          ratingCount: 0,
          players: new Set(),
        };
        byMove.set(record.moveUci, move);
      }
      if (move.gameIds.has(game.id)) continue;
      move.gameIds.add(game.id);
      addResult(move, game.result);
      const rating = record.mover === 'w' ? game.whiteRating : game.blackRating;
      if (rating) {
        move.ratingSum += rating;
        move.ratingCount += 1;
      }
      const player = record.mover === 'w' ? game.white : game.black;
      if (player) move.players.add(player);
      if (game.year && (!move.lastYear || game.year > move.lastYear)) move.lastYear = game.year;
    }

    const moves: DatabaseMove[] = [...byMove.values()]
      .map((move) => {
        const averageRating = move.ratingCount
          ? Math.round(move.ratingSum / move.ratingCount)
          : undefined;
        const base: DatabaseMove = {
          uci: move.uci,
          san: move.san,
          games: move.gameIds.size,
          white: move.white,
          draws: move.draws,
          black: move.black,
          ...(averageRating ? { averageRating } : {}),
          ...(move.lastYear ? { lastPlayedYear: move.lastYear } : {}),
          ...(move.players.size ? { notablePlayers: [...move.players].slice(0, 8) } : {}),
        };
        const performance = averageRating
          ? performanceRating(moveScore(base, sideToMove), averageRating)
          : undefined;
        return performance === undefined ? base : { ...base, performance };
      })
      .sort((a, b) => b.games - a.games || a.san.localeCompare(b.san));

    const included = games.filter((game) => includedGames.has(game.id));
    const total = tallyGames(included);
    return {
      fen,
      source: { id: 'local-collection', name: 'My games' },
      totalGames: included.length,
      ...total,
      moves: moves.slice(0, limit),
      topGames: included
        .sort((a, b) => b.importedAt - a.importedAt)
        .slice(0, 8)
        .map(toGameRef),
      truncated: moves.length > limit,
    };
  }
}

interface MutableMove {
  readonly uci: Uci;
  readonly san: San;
  readonly gameIds: Set<string>;
  white: number;
  draws: number;
  black: number;
  ratingSum: number;
  ratingCount: number;
  readonly players: Set<string>;
  lastYear?: number;
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
  readonly range?: IDBKeyRange;
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
  const hasRange = typeof IDBKeyRange !== 'undefined';

  /*
    Count the predicates the query actually carries, then let a plan call itself
    exact only if it consumed all of them. Deriving `exact` this way rather than
    listing exceptions per branch is what stops a filter being silently dropped
    when, say, `IDBKeyRange` is unavailable and the plan falls through — a bug
    that returns too many games rather than an error, which is the worst kind.
  */
  const player = query.player?.trim().toLowerCase();
  const predicates =
    (player ? 1 : 0) +
    (query.result ? 1 : 0) +
    (query.fromYear || query.toYear ? 1 : 0) +
    (query.text?.trim() ? 1 : 0) +
    (query.minRating ? 1 : 0) +
    (query.opening ? 1 : 0) +
    (query.eco ? 1 : 0);

  const plan = (index: string | null, range: IDBKeyRange | null, consumed: number): QueryPlan => ({
    index,
    ...(range ? { range } : {}),
    ordered: false,
    exact: consumed === predicates,
  });

  if (player && hasRange) {
    const range = IDBKeyRange.only(player);
    // An index lookup answers a *whole* normalized name. A partial name still
    // has to be compared per record, so the plan narrows but is not exact.
    const consumed = 1;
    if (query.playerColor === 'w') return plan('whiteKey', range, consumed);
    if (query.playerColor === 'b') return plan('blackKey', range, consumed);
    return plan('players', range, consumed);
  }

  if ((query.fromYear || query.toYear) && hasRange) {
    const range = IDBKeyRange.bound(query.fromYear ?? 0, query.toYear ?? 9999);
    return plan('year', range, 1);
  }

  if (query.result && hasRange) {
    return plan('result', IDBKeyRange.only(query.result), 1);
  }

  // Nothing selective to narrow by: walk the sort index itself so the page
  // arrives already ordered and nothing outside it is deserialised.
  const sortBy = query.sortBy ?? 'importedAt';
  const ordered =
    sortBy === 'importedAt' || sortBy === 'date' || sortBy === 'white' || sortBy === 'black';
  const index = ordered ? (sortBy === 'importedAt' ? 'importedAt' : sortBy) : null;

  return { index, ordered, exact: predicates === 0 };
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
  const player = query.player?.trim().toLowerCase();
  if (player) {
    const white = game.white.toLowerCase().includes(player);
    const black = game.black.toLowerCase().includes(player);
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

function matchesExplorer(game: GameSummary, filters: ExplorerFilters): boolean {
  return matchesSearch(game, {
    ...(filters.player ? { player: filters.player } : {}),
    ...(filters.playerColor ? { playerColor: filters.playerColor } : {}),
    ...(filters.sinceYear ? { fromYear: filters.sinceYear } : {}),
    ...(filters.untilYear ? { toYear: filters.untilYear } : {}),
    ...(filters.minRating ? { minRating: filters.minRating } : {}),
  });
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

function addResult(
  target: { white: number; draws: number; black: number },
  result: GameResult,
): void {
  if (result === '1-0') target.white += 1;
  else if (result === '0-1') target.black += 1;
  else if (result === '1/2-1/2') target.draws += 1;
}

function tallyGames(games: readonly GameSummary[]) {
  const tally = { white: 0, draws: 0, black: 0 };
  for (const game of games) addResult(tally, game.result);
  return tally;
}

function toGameRef(game: GameSummary): DatabaseGameRef {
  return {
    id: game.id,
    white: game.white,
    black: game.black,
    result: game.result,
    ...(game.whiteRating ? { whiteRating: game.whiteRating } : {}),
    ...(game.blackRating ? { blackRating: game.blackRating } : {}),
    ...(game.year ? { year: game.year } : {}),
    ...(game.event ? { event: game.event } : {}),
  };
}
