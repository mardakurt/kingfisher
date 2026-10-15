/**
 * A player's opening tree as an opening map.
 *
 * The report's move table answers one position at a time. The map draws
 * the next plies at once from the games in front of the user: each move's
 * width is its share of the games that continue from its position, and its
 * shade is how the prepared-for player scored after it — so where a player
 * goes, and where it went badly for them, are one glance instead of a
 * dozen clicks.
 *
 * Nothing is asked of any source: the tree is already built from the
 * selected games. Every figure is a count of those games, and the map says
 * whose games and whose score.
 */

import type { San, Uci } from '@/chess/types';
import { OPENING_MAP_DEFAULTS, type OpeningMap, type OpeningMapNode } from '@/database/opening-map';

import type { OpeningTree } from './index';

export function openingMapFromTree(
  tree: OpeningTree,
  rootKey: string,
  player: string,
  options: {
    readonly depth?: number;
    readonly minShare?: number;
    readonly maxBranches?: number;
  } = {},
): OpeningMap | null {
  const root = tree.nodes.get(rootKey);
  if (!root) return null;
  const depth = options.depth ?? OPENING_MAP_DEFAULTS.depth;
  const minShare = options.minShare ?? OPENING_MAP_DEFAULTS.minShare;
  const maxBranches = options.maxBranches ?? OPENING_MAP_DEFAULTS.maxBranches;

  const grow = (
    key: string,
    line: readonly Uci[],
    sanLine: readonly San[],
    remaining: number,
    // A position already on this line is not drawn again below itself.
    seen: ReadonlySet<string>,
  ): { children: OpeningMapNode[]; omitted: number; total: number } => {
    const node = tree.nodes.get(key);
    if (!node || remaining === 0) return { children: [], omitted: 0, total: 0 };
    // The games that continue from here: one per game, since a game plays
    // one move from a position on its main line.
    const total = node.edges.reduce((sum, edge) => sum + edge.games, 0);
    if (total === 0) return { children: [], omitted: 0, total: 0 };
    const drawn = [...node.edges]
      .sort((a, b) => b.games - a.games)
      .filter((edge) => edge.games / total >= minShare && !seen.has(edge.resultingKey))
      .slice(0, maxBranches);
    const children = drawn.map((edge): OpeningMapNode => {
      const nextLine = [...line, edge.uci];
      const nextSan = [...sanLine, edge.san];
      const grown = grow(
        edge.resultingKey,
        nextLine,
        nextSan,
        remaining - 1,
        new Set([...seen, edge.resultingKey]),
      );
      return {
        uci: edge.uci,
        san: edge.san,
        line: nextLine,
        sanLine: nextSan,
        fen: edge.resultingFen,
        games: edge.games,
        score: edge.playerScore / 100,
        ofGames: total,
        share: edge.games / total,
        children: grown.children,
        omittedGames: grown.omitted,
      };
    });
    const omitted = total - drawn.reduce((sum, edge) => sum + edge.games, 0);
    return { children, omitted, total };
  };

  const grown = grow(rootKey, [], [], depth, new Set([rootKey]));
  return {
    fen: root.fen,
    source: { id: 'preparation', name: `${player}’s games` },
    totalGames: grown.total,
    scoreFor: player,
    depth,
    minShare,
    children: grown.children,
    omittedGames: grown.omitted,
    queries: 0,
  };
}
