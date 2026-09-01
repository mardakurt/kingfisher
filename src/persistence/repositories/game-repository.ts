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
  GameId,
  GameRecord,
  GameRepository,
  GameSearchQuery,
  GameSearchResult,
  PersistGameResult,
  PositionRecord,
} from '../types';
import { assertValid, isGameRecord } from '../validation';

export class LocalGameRepository implements GameRepository {
  constructor(private readonly database: PersistenceDatabase) {}

  async count(): Promise<number> {
    return this.database.count(STORE_NAMES.games);
  }

  async get(id: GameId): Promise<GameRecord | null> {
    const raw = await this.database.get<unknown>(STORE_NAMES.games, id);
    return raw === undefined ? null : assertValid(raw, isGameRecord, 'game');
  }

  async findByFingerprint(fingerprint: string): Promise<GameRecord | null> {
    const matches = await this.database.getAllFromIndex<unknown>(
      STORE_NAMES.games,
      'fingerprint',
      fingerprint,
    );
    const first = matches[0];
    return first === undefined ? null : assertValid(first, isGameRecord, 'game');
  }

  async search(query: GameSearchQuery = {}): Promise<GameSearchResult> {
    const raw = await this.database.getAll<unknown>(STORE_NAMES.games);
    const filtered = raw
      .map((record) => assertValid(record, isGameRecord, 'game'))
      .filter((game) => matchesSearch(game, query));
    const direction = query.sortDirection === 'asc' ? 1 : -1;
    filtered.sort((a, b) => compareGames(a, b, query.sortBy ?? 'importedAt') * direction);
    const offset = Math.max(0, query.offset ?? 0);
    const limit = Math.max(1, query.limit ?? 500);
    return { games: filtered.slice(offset, offset + limit), total: filtered.length };
  }

  async persist(
    game: GameRecord,
    positions: readonly PositionRecord[],
  ): Promise<PersistGameResult> {
    assertValid(game, isGameRecord, 'game');
    return this.database.transaction(
      [STORE_NAMES.games, STORE_NAMES.positions],
      'readwrite',
      async (transaction) => {
        const duplicate = await findFingerprint(transaction, game.fingerprint);
        if (duplicate) return { game: duplicate, duplicate: true };
        await transaction.put(STORE_NAMES.games, game);
        for (const position of positions) await transaction.put(STORE_NAMES.positions, position);
        return { game, duplicate: false };
      },
    );
  }

  async delete(id: GameId): Promise<void> {
    await this.deleteMany([id]);
  }

  async deleteMany(ids: readonly GameId[]): Promise<void> {
    if (ids.length === 0) return;
    await this.database.transaction(
      [STORE_NAMES.games, STORE_NAMES.positions],
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
        }
      },
    );
  }

  async clear(): Promise<void> {
    await this.database.transaction(
      [STORE_NAMES.games, STORE_NAMES.positions],
      'readwrite',
      async (transaction) => {
        await transaction.clear(STORE_NAMES.positions);
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
    const games = (await Promise.all(uniqueGameIds.map((id) => this.get(id)))).filter(
      (game): game is GameRecord => game !== null && matchesExplorer(game, filters),
    );
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
  return first === undefined ? null : assertValid(first, isGameRecord, 'game');
}

function matchesSearch(game: GameRecord, query: GameSearchQuery): boolean {
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

function matchesExplorer(game: GameRecord, filters: ExplorerFilters): boolean {
  return matchesSearch(game, {
    ...(filters.player ? { player: filters.player } : {}),
    ...(filters.playerColor ? { playerColor: filters.playerColor } : {}),
    ...(filters.sinceYear ? { fromYear: filters.sinceYear } : {}),
    ...(filters.untilYear ? { toYear: filters.untilYear } : {}),
    ...(filters.minRating ? { minRating: filters.minRating } : {}),
  });
}

function compareGames(
  a: GameRecord,
  b: GameRecord,
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

function tallyGames(games: readonly GameRecord[]) {
  const tally = { white: 0, draws: 0, black: 0 };
  for (const game of games) addResult(tally, game.result);
  return tally;
}

function toGameRef(game: GameRecord): DatabaseGameRef {
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
