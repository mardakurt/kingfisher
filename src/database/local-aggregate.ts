/** Pure aggregation shared by the repository and the IndexedDB worker. */

import { parseFen } from '@/chess/fen';
import type { Fen, San, Uci } from '@/chess/types';
import type { GameSummary, PositionRecord } from '@/persistence/types';

import {
  moveScore,
  performanceRating,
  type DatabaseGameRef,
  type DatabaseMove,
  type ExplorerFilters,
  type ExplorerResult,
  type GameResult,
} from './types';

export function aggregateLocalExplorer(
  fen: Fen,
  records: readonly PositionRecord[],
  candidates: readonly GameSummary[],
  filters: ExplorerFilters = {},
  limit = 20,
): ExplorerResult {
  const games = candidates.filter((game) => matchesExplorer(game, filters));
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
  return {
    fen,
    source: { id: 'local-collection', name: 'My games' },
    totalGames: included.length,
    ...tallyGames(included),
    moves: moves.slice(0, limit),
    topGames: included
      .sort((a, b) => b.importedAt - a.importedAt)
      .slice(0, 8)
      .map(toGameRef),
    truncated: moves.length > limit,
  };
}

function matchesExplorer(game: GameSummary, filters: ExplorerFilters): boolean {
  const player = filters.player?.trim().toLowerCase();
  if (player) {
    const white = game.white.toLowerCase().includes(player);
    const black = game.black.toLowerCase().includes(player);
    if (
      filters.playerColor === 'w' ? !white : filters.playerColor === 'b' ? !black : !white && !black
    )
      return false;
  }
  if (filters.sinceYear && (!game.year || game.year < filters.sinceYear)) return false;
  if (filters.untilYear && (!game.year || game.year > filters.untilYear)) return false;
  if (filters.minRating) {
    const ratings = [game.whiteRating, game.blackRating].filter(
      (rating): rating is number => rating !== undefined,
    );
    if (!ratings.length || Math.max(...ratings) < filters.minRating) return false;
  }
  if (filters.maxRating) {
    const ratings = [game.whiteRating, game.blackRating].filter(
      (rating): rating is number => rating !== undefined,
    );
    if (!ratings.length || Math.min(...ratings) > filters.maxRating) return false;
  }
  return true;
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

function addResult(target: { white: number; draws: number; black: number }, result: GameResult) {
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
