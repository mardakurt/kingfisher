/**
 * Deterministic opponent preparation over local games.
 *
 * No prose or recommendation score is generated here. The module only counts
 * observed games, merges identical canonical positions, and compares those
 * observations with explicit repertoire decisions.
 */

import { positionKey } from '@/chess/fen';
import { mainlinePath, mustGetNode } from '@/chess/tree/tree';
import type { Fen, San, Uci } from '@/chess/types';
import type { RepertoirePositionRecord } from '@/persistence/domain';
import type { GameRecord } from '@/persistence/types';
import { playerKey } from '@/persistence/schema/migrations';

export interface PlayerProfile {
  readonly name: string;
  readonly games: number;
  readonly averageRating?: number;
  readonly firstYear?: number;
  readonly lastYear?: number;
  readonly asWhite: number;
  readonly asBlack: number;
  /** Points scored by the player, where a draw is half a point. */
  readonly score: number;
  readonly openings: readonly { name: string; games: number; recentGames: number }[];
}

export interface PreparationEdge {
  readonly uci: Uci;
  readonly san: San;
  readonly games: number;
  readonly frequency: number;
  /** Score of the prepared-for player after choosing this move. */
  readonly playerScore: number;
  readonly averageElo?: number;
  readonly lastPlayed?: number;
  readonly resultingKey: string;
  readonly resultingFen: Fen;
}

export interface PreparationNode {
  readonly positionKey: string;
  readonly fen: Fen;
  readonly games: number;
  readonly edges: readonly PreparationEdge[];
}

export interface OpeningTree {
  readonly rootKey: string;
  readonly nodes: ReadonlyMap<string, PreparationNode>;
}

export interface RepertoireComparison {
  readonly prepared: readonly PreparationEdge[];
  readonly gaps: readonly PreparationEdge[];
}

export function matchesPlayer(game: GameRecord, aliases: readonly string[]): boolean {
  const keys = new Set(aliases.map(playerKey).filter(Boolean));
  return keys.has(game.whiteKey) || keys.has(game.blackKey);
}

export function buildPlayerProfile(
  games: readonly GameRecord[],
  aliases: readonly string[],
  recentFromYear = new Date().getFullYear() - 1,
): PlayerProfile {
  const keys = new Set(aliases.map(playerKey).filter(Boolean));
  const matched = games.filter((game) => keys.has(game.whiteKey) || keys.has(game.blackKey));
  let ratingSum = 0;
  let ratings = 0;
  let asWhite = 0;
  let asBlack = 0;
  let points = 0;
  let firstYear: number | undefined;
  let lastYear: number | undefined;
  const openings = new Map<string, { games: number; recentGames: number }>();

  for (const game of matched) {
    const white = keys.has(game.whiteKey);
    if (white) asWhite += 1;
    else asBlack += 1;
    const rating = white ? game.whiteRating : game.blackRating;
    if (rating !== undefined) {
      ratingSum += rating;
      ratings += 1;
    }
    points += playerPoints(game, white ? 'w' : 'b');
    if (game.year !== undefined) {
      firstYear = firstYear === undefined ? game.year : Math.min(firstYear, game.year);
      lastYear = lastYear === undefined ? game.year : Math.max(lastYear, game.year);
    }
    const name = game.opening || game.eco || 'Unclassified';
    const count = openings.get(name) ?? { games: 0, recentGames: 0 };
    count.games += 1;
    if ((game.year ?? 0) >= recentFromYear) count.recentGames += 1;
    openings.set(name, count);
  }

  return {
    name: aliases[0]?.trim() || 'Player',
    games: matched.length,
    ...(ratings ? { averageRating: Math.round(ratingSum / ratings) } : {}),
    ...(firstYear !== undefined ? { firstYear } : {}),
    ...(lastYear !== undefined ? { lastYear } : {}),
    asWhite,
    asBlack,
    score: matched.length ? Math.round((points / matched.length) * 1000) / 10 : 0,
    openings: [...openings]
      .map(([name, count]) => ({ name, ...count }))
      .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name)),
  };
}

export function buildOpeningTree(
  games: readonly GameRecord[],
  aliases: readonly string[],
  options: { readonly playerColor?: 'w' | 'b'; readonly maxPlies?: number } = {},
): OpeningTree {
  const keys = new Set(aliases.map(playerKey).filter(Boolean));
  const aggregates = new Map<string, MutableNode>();
  let rootKey = '';

  for (const game of games) {
    const side = keys.has(game.whiteKey) ? 'w' : keys.has(game.blackKey) ? 'b' : null;
    if (!side || (options.playerColor && side !== options.playerColor)) continue;
    const path = mainlinePath(game.tree);
    const max = Math.min(path.length - 1, options.maxPlies ?? 24);
    if (!rootKey) rootKey = positionKey(game.tree.startFen);

    for (let index = 0; index < max; index += 1) {
      const parent = mustGetNode(game.tree, path[index]!);
      const child = mustGetNode(game.tree, path[index + 1]!);
      const move = child.move;
      if (!move) continue;
      const key = positionKey(parent.fen);
      const resultingKey = positionKey(child.fen);
      let node = aggregates.get(key);
      if (!node) {
        node = { fen: parent.fen, gameIds: new Set(), edges: new Map() };
        aggregates.set(key, node);
      }
      node.gameIds.add(game.id);
      let edge = node.edges.get(move.uci);
      if (!edge) {
        edge = {
          uci: move.uci,
          san: move.san,
          gameIds: new Set(),
          points: 0,
          ratingSum: 0,
          ratings: 0,
          resultingKey,
          resultingFen: child.fen,
        };
        node.edges.set(move.uci, edge);
      }
      if (edge.gameIds.has(game.id)) continue;
      edge.gameIds.add(game.id);
      edge.points += playerPoints(game, side);
      const rating = side === 'w' ? game.whiteRating : game.blackRating;
      if (rating !== undefined) {
        edge.ratingSum += rating;
        edge.ratings += 1;
      }
      if (game.year !== undefined) edge.lastPlayed = Math.max(edge.lastPlayed ?? 0, game.year);
    }
  }

  const nodes = new Map<string, PreparationNode>();
  for (const [key, node] of aggregates) {
    const gamesAtNode = node.gameIds.size;
    const edges = [...node.edges.values()]
      .map<PreparationEdge>((edge) => ({
        uci: edge.uci,
        san: edge.san,
        games: edge.gameIds.size,
        frequency: gamesAtNode ? Math.round((edge.gameIds.size / gamesAtNode) * 1000) / 10 : 0,
        playerScore: edge.gameIds.size
          ? Math.round((edge.points / edge.gameIds.size) * 1000) / 10
          : 0,
        ...(edge.ratings ? { averageElo: Math.round(edge.ratingSum / edge.ratings) } : {}),
        ...(edge.lastPlayed ? { lastPlayed: edge.lastPlayed } : {}),
        resultingKey: edge.resultingKey,
        resultingFen: edge.resultingFen,
      }))
      .sort((a, b) => b.games - a.games || a.san.localeCompare(b.san));
    nodes.set(key, { positionKey: key, fen: node.fen, games: gamesAtNode, edges });
  }

  return { rootKey, nodes };
}

/** Compare observed opponent choices with positions where the repertoire has a playable reply. */
export function compareWithRepertoire(
  node: PreparationNode | undefined,
  repertoirePositions: readonly RepertoirePositionRecord[],
): RepertoireComparison {
  if (!node) return { prepared: [], gaps: [] };
  const preparedKeys = new Set(
    repertoirePositions
      .filter((position) =>
        position.moves.some((move) => move.role === 'main' || move.role === 'alternative'),
      )
      .map((position) => position.positionKey),
  );
  const prepared: PreparationEdge[] = [];
  const gaps: PreparationEdge[] = [];
  for (const edge of node.edges) {
    (preparedKeys.has(edge.resultingKey) ? prepared : gaps).push(edge);
  }
  return { prepared, gaps };
}

function playerPoints(game: GameRecord, side: 'w' | 'b'): number {
  if (game.result === '1/2-1/2') return 0.5;
  if (game.result === '1-0') return side === 'w' ? 1 : 0;
  if (game.result === '0-1') return side === 'b' ? 1 : 0;
  return 0;
}

interface MutableNode {
  readonly fen: Fen;
  readonly gameIds: Set<string>;
  readonly edges: Map<Uci, MutableEdge>;
}

interface MutableEdge {
  readonly uci: Uci;
  readonly san: San;
  readonly gameIds: Set<string>;
  points: number;
  ratingSum: number;
  ratings: number;
  readonly resultingKey: string;
  readonly resultingFen: Fen;
  lastPlayed?: number;
}
