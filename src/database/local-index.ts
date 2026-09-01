/**
 * An in-memory position index over a personal game collection.
 *
 * This is what makes "how have *I* done in this position?" answerable. Games
 * are indexed by position key rather than by move sequence, so transpositions
 * are found, and only the opening phase is indexed by default because that is
 * where position-level statistics carry information.
 *
 * It is deliberately a simple structure: a few thousand games fit comfortably
 * in memory. A collection of millions belongs behind a different implementation
 * of `ChessDatabaseProvider` — that is why the interface exists.
 */

import { positionKey } from '@/chess/fen';
import { mainlinePath } from '@/chess/tree/tree';
import type { GameTree, NodeId } from '@/chess/tree/types';
import type { Fen, San, Uci } from '@/chess/types';

import {
  moveScore,
  performanceRating,
  type DatabaseGameRef,
  type DatabaseMove,
  type ExplorerFilters,
  type ExplorerResult,
  type GameResult,
} from './types';

export interface IndexedGame {
  readonly id: string;
  readonly white: string;
  readonly black: string;
  readonly whiteRating?: number;
  readonly blackRating?: number;
  readonly result: GameResult;
  readonly year?: number;
  readonly event?: string;
}

interface MoveStats {
  san: San;
  white: number;
  draws: number;
  black: number;
  ratingSum: number;
  ratingCount: number;
  lastYear?: number;
  players: Set<string>;
  gameIds: string[];
}

interface PositionStats {
  white: number;
  draws: number;
  black: number;
  gameIds: string[];
  moves: Map<string, MoveStats>;
}

export interface IndexOptions {
  /** How deep into each game to index. Beyond this, statistics get thin. */
  readonly maxPlies?: number;
  /** Index side lines too — useful for annotated repertoire files. */
  readonly includeVariations?: boolean;
}

const MAX_GAME_REFS = 32;
const MAX_PLAYERS = 8;

export class PositionIndex {
  private readonly positions = new Map<string, PositionStats>();
  private readonly games = new Map<string, IndexedGame>();

  get gameCount(): number {
    return this.games.size;
  }

  get positionCount(): number {
    return this.positions.size;
  }

  clear(): void {
    this.positions.clear();
    this.games.clear();
  }

  getGame(id: string): IndexedGame | undefined {
    return this.games.get(id);
  }

  allGames(): readonly IndexedGame[] {
    return [...this.games.values()];
  }

  addGame(tree: GameTree, meta: IndexedGame, options: IndexOptions = {}): void {
    const maxPlies = options.maxPlies ?? 40;
    this.games.set(meta.id, meta);

    const paths: NodeId[][] = options.includeVariations
      ? allPaths(tree, maxPlies)
      : [mainlinePath(tree)];

    const seen = new Set<string>();

    for (const path of paths) {
      for (let i = 0; i < path.length - 1 && i < maxPlies; i += 1) {
        const node = tree.nodes[path[i] as NodeId];
        const child = tree.nodes[path[i + 1] as NodeId];
        if (!node || !child?.move) continue;

        const key = positionKey(node.fen);
        // A repetition inside one game must not count twice.
        const dedupe = `${key}|${child.move.uci}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);

        this.record(key, child.move.uci, child.move.san, child.move.color, meta);
      }
    }
  }

  private record(key: string, uci: Uci, san: San, mover: 'w' | 'b', meta: IndexedGame): void {
    let stats = this.positions.get(key);
    if (!stats) {
      stats = { white: 0, draws: 0, black: 0, gameIds: [], moves: new Map() };
      this.positions.set(key, stats);
    }

    if (!stats.gameIds.includes(meta.id)) {
      addResult(stats, meta.result);
      if (stats.gameIds.length < MAX_GAME_REFS) stats.gameIds.push(meta.id);
    }

    let move = stats.moves.get(uci);
    if (!move) {
      move = {
        san,
        white: 0,
        draws: 0,
        black: 0,
        ratingSum: 0,
        ratingCount: 0,
        players: new Set(),
        gameIds: [],
      };
      stats.moves.set(uci, move);
    }

    addResult(move, meta.result);
    const rating = mover === 'w' ? meta.whiteRating : meta.blackRating;
    if (rating) {
      move.ratingSum += rating;
      move.ratingCount += 1;
    }
    if (meta.year && (move.lastYear === undefined || meta.year > move.lastYear)) {
      move.lastYear = meta.year;
    }
    const player = mover === 'w' ? meta.white : meta.black;
    if (player && move.players.size < MAX_PLAYERS) move.players.add(player);
    if (move.gameIds.length < MAX_GAME_REFS) move.gameIds.push(meta.id);
  }

  lookup(
    fen: Fen,
    sideToMove: 'w' | 'b',
    source: { id: string; name: string },
    filters?: ExplorerFilters,
    limit = 20,
  ): ExplorerResult {
    const stats = this.positions.get(positionKey(fen));
    if (!stats) {
      return {
        fen,
        source,
        totalGames: 0,
        white: 0,
        draws: 0,
        black: 0,
        moves: [],
        topGames: [],
      };
    }

    const moves: DatabaseMove[] = [];
    let white = 0;
    let draws = 0;
    let black = 0;

    for (const [uci, move] of stats.moves) {
      const games = move.gameIds
        .map((id) => this.games.get(id))
        .filter((game): game is IndexedGame => game !== undefined)
        .filter((game) => matchesFilters(game, filters));

      if (games.length === 0) continue;

      const tally = { white: 0, draws: 0, black: 0 };
      let ratingSum = 0;
      let ratingCount = 0;
      let lastYear: number | undefined;

      for (const game of games) {
        addResult(tally, game.result);
        const rating = sideToMove === 'w' ? game.whiteRating : game.blackRating;
        if (rating) {
          ratingSum += rating;
          ratingCount += 1;
        }
        if (game.year && (lastYear === undefined || game.year > lastYear)) lastYear = game.year;
      }

      white += tally.white;
      draws += tally.draws;
      black += tally.black;

      const averageRating = ratingCount > 0 ? Math.round(ratingSum / ratingCount) : undefined;
      const entry: DatabaseMove = {
        uci: uci as Uci,
        san: move.san,
        games: games.length,
        white: tally.white,
        draws: tally.draws,
        black: tally.black,
        ...(averageRating ? { averageRating } : {}),
        ...(lastYear ? { lastPlayedYear: lastYear } : {}),
        ...(move.players.size > 0 ? { notablePlayers: [...move.players] } : {}),
      };
      const performance = averageRating
        ? performanceRating(moveScore(entry, sideToMove), averageRating)
        : undefined;
      moves.push(performance === undefined ? entry : { ...entry, performance });
    }

    moves.sort((a, b) => b.games - a.games);

    const topGames: DatabaseGameRef[] = stats.gameIds
      .map((id) => this.games.get(id))
      .filter((game): game is IndexedGame => game !== undefined)
      .filter((game) => matchesFilters(game, filters))
      .slice(0, 8)
      .map((game) => ({
        id: game.id,
        white: game.white,
        black: game.black,
        ...(game.whiteRating ? { whiteRating: game.whiteRating } : {}),
        ...(game.blackRating ? { blackRating: game.blackRating } : {}),
        result: game.result,
        ...(game.year ? { year: game.year } : {}),
        ...(game.event ? { event: game.event } : {}),
      }));

    return {
      fen,
      source,
      totalGames: white + draws + black,
      white,
      draws,
      black,
      moves: moves.slice(0, limit),
      topGames,
      truncated: moves.length > limit,
    };
  }
}

function addResult(target: { white: number; draws: number; black: number }, result: GameResult) {
  if (result === '1-0') target.white += 1;
  else if (result === '0-1') target.black += 1;
  else if (result === '1/2-1/2') target.draws += 1;
}

function matchesFilters(game: IndexedGame, filters?: ExplorerFilters): boolean {
  if (!filters) return true;

  const ratings = [game.whiteRating, game.blackRating].filter(
    (value): value is number => value !== undefined,
  );
  const average =
    ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : undefined;

  if (filters.minRating !== undefined && (average === undefined || average < filters.minRating)) {
    return false;
  }
  if (filters.maxRating !== undefined && (average === undefined || average > filters.maxRating)) {
    return false;
  }
  if (
    filters.sinceYear !== undefined &&
    (game.year === undefined || game.year < filters.sinceYear)
  ) {
    return false;
  }
  if (
    filters.untilYear !== undefined &&
    (game.year === undefined || game.year > filters.untilYear)
  ) {
    return false;
  }
  if (filters.player) {
    const needle = filters.player.toLowerCase();
    const white = game.white.toLowerCase().includes(needle);
    const black = game.black.toLowerCase().includes(needle);
    if (filters.playerColor === 'w' && !white) return false;
    if (filters.playerColor === 'b' && !black) return false;
    if (!filters.playerColor && !white && !black) return false;
  }
  return true;
}

/** Every root-to-leaf path, used when side lines should be indexed too. */
function allPaths(tree: GameTree, maxPlies: number): NodeId[][] {
  const paths: NodeId[][] = [];

  const walk = (id: NodeId, prefix: NodeId[]) => {
    const node = tree.nodes[id];
    if (!node) return;
    const path = [...prefix, id];
    if (node.children.length === 0 || path.length > maxPlies) {
      paths.push(path);
      return;
    }
    for (const child of node.children) walk(child, path);
  };

  walk(tree.rootId, []);
  return paths;
}

/** Read the standard tags into the metadata the index needs. */
export function gameMetaFromHeaders(
  id: string,
  headers: Readonly<Record<string, string>>,
): IndexedGame {
  const year = Number(headers.Date?.slice(0, 4));
  const whiteRating = Number(headers.WhiteElo);
  const blackRating = Number(headers.BlackElo);
  const result = headers.Result;

  return {
    id,
    white: headers.White ?? 'Unknown',
    black: headers.Black ?? 'Unknown',
    ...(Number.isFinite(whiteRating) && whiteRating > 0 ? { whiteRating } : {}),
    ...(Number.isFinite(blackRating) && blackRating > 0 ? { blackRating } : {}),
    result: isGameResult(result) ? result : '*',
    ...(Number.isFinite(year) && year > 1000 ? { year } : {}),
    ...(headers.Event ? { event: headers.Event } : {}),
  };
}

const isGameResult = (value: string | undefined): value is GameResult =>
  value === '1-0' || value === '0-1' || value === '1/2-1/2' || value === '*';
