/**
 * The opening map: the next few moves from a position, as one picture.
 *
 * The explorer answers "what was played here?" one ply at a time. To see
 * how a position branches three moves deep, a person clicks into each move,
 * reads its table, comes back and clicks the next one. The map asks the same
 * source the same question for every branch worth drawing and lays the
 * answers out as nested blocks: each move's width is its share of the games,
 * its shade is how White scored after it.
 *
 * It is the explorer's question, so it keeps the explorer's rules. It is one
 * population, named, with its own counts; nothing here merges sources or
 * calls a branch "main line". Branches below `minShare` are left out and
 * counted, never silently dropped.
 *
 * One thing differs from a single explorer table and is said rather than
 * hidden: a source keys its counts on the *position*, so the games behind a
 * deeper block are every game that reached that position, by any move order.
 * Its width is therefore its share of those games, scaled into the parent's
 * width — the honest proportion — and its tooltip says "of N games reaching
 * this position", not "of the games that played this line".
 */

import { Position } from '@/chess/position';
import { isOk } from '@/chess/result';
import type { Fen, San, Uci } from '@/chess/types';

import type { DatabaseMove, ExplorerResult } from './types';

export interface OpeningMapNode {
  readonly uci: Uci;
  readonly san: San;
  /** The moves from the map's root to this one, in order. */
  readonly line: readonly Uci[];
  readonly sanLine: readonly San[];
  /** The position after this move. */
  readonly fen: Fen;
  /** Games that played this move from its parent position, in the source. */
  readonly games: number;
  /** The score after this move, 0–1, for the side the map names in `scoreFor`. */
  readonly score: number;
  /** Games at the parent position, by any move order: this move's denominator. */
  readonly ofGames: number;
  /** This move's share of its parent's width, 0–1. */
  readonly share: number;
  readonly children: readonly OpeningMapNode[];
  /** Games at this position in moves too rare to draw. */
  readonly omittedGames: number;
}

export interface OpeningMap {
  readonly fen: Fen;
  readonly source: { readonly id: string; readonly name: string };
  readonly totalGames: number;
  /** Whose score `score` is: "White" for a source, the player for a dossier. */
  readonly scoreFor: string;
  readonly depth: number;
  readonly minShare: number;
  readonly children: readonly OpeningMapNode[];
  readonly omittedGames: number;
  /** How many positions the source was asked about. */
  readonly queries: number;
}

export interface OpeningMapOptions {
  readonly fen: Fen;
  /** Plies below the root. */
  readonly depth?: number;
  /** A move under this share of its position's games is not drawn. */
  readonly minShare?: number;
  /** At most this many moves are drawn from any one position. */
  readonly maxBranches?: number;
  readonly explore: (fen: Fen, signal?: AbortSignal) => Promise<ExplorerResult>;
  readonly signal?: AbortSignal;
}

export const OPENING_MAP_DEFAULTS = { depth: 3, minShare: 0.03, maxBranches: 6 } as const;

/** White's score after a move: wins plus half the draws, over its games. */
export function whiteScore(move: Pick<DatabaseMove, 'games' | 'white' | 'draws'>): number {
  return move.games > 0 ? (move.white + move.draws / 2) / move.games : 0.5;
}

/** The moves worth drawing at a position, and the games in the rest. */
function drawable(
  result: ExplorerResult,
  minShare: number,
  maxBranches: number,
): { moves: readonly DatabaseMove[]; omitted: number; total: number } {
  const total = result.moves.reduce((sum, move) => sum + move.games, 0);
  if (total === 0) return { moves: [], omitted: 0, total: 0 };
  const moves = [...result.moves]
    .sort((a, b) => b.games - a.games)
    .filter((move) => move.games / total >= minShare)
    .slice(0, maxBranches);
  const drawn = moves.reduce((sum, move) => sum + move.games, 0);
  return { moves, omitted: total - drawn, total };
}

/**
 * Ask the source about the root and every drawn branch, breadth first, to
 * `depth` plies. A move the rules refuse is left out, never drawn as legal.
 */
export async function buildOpeningMap(options: OpeningMapOptions): Promise<OpeningMap> {
  const depth = options.depth ?? OPENING_MAP_DEFAULTS.depth;
  const minShare = options.minShare ?? OPENING_MAP_DEFAULTS.minShare;
  const maxBranches = options.maxBranches ?? OPENING_MAP_DEFAULTS.maxBranches;
  let queries = 0;

  const ask = async (fen: Fen) => {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    queries += 1;
    return options.explore(fen, options.signal);
  };

  const grow = async (
    fen: Fen,
    result: ExplorerResult,
    line: readonly Uci[],
    sanLine: readonly San[],
    remaining: number,
  ): Promise<{ children: OpeningMapNode[]; omitted: number }> => {
    const position = Position.fromFen(fen);
    if (!isOk(position)) return { children: [], omitted: 0 };
    const { moves, omitted, total } = drawable(result, minShare, maxBranches);
    const children = await Promise.all(
      moves.map(async (move): Promise<OpeningMapNode | null> => {
        const played = position.value.playUci(move.uci);
        if (!isOk(played)) return null;
        const after = played.value.after;
        const nextLine = [...line, move.uci];
        const nextSan = [...sanLine, move.san];
        let grown: { children: OpeningMapNode[]; omitted: number } = { children: [], omitted: 0 };
        if (remaining > 1)
          grown = await grow(after, await ask(after), nextLine, nextSan, remaining - 1);
        return {
          uci: move.uci,
          san: move.san,
          line: nextLine,
          sanLine: nextSan,
          fen: after,
          games: move.games,
          score: whiteScore(move),
          ofGames: total,
          share: move.games / total,
          children: grown.children,
          omittedGames: grown.omitted,
        };
      }),
    );
    return { children: children.filter((node): node is OpeningMapNode => node !== null), omitted };
  };

  const root = await ask(options.fen);
  const grown = await grow(options.fen, root, [], [], depth);
  return {
    fen: options.fen,
    source: root.source,
    totalGames: root.moves.reduce((sum, move) => sum + move.games, 0),
    scoreFor: 'White',
    depth,
    minShare,
    children: grown.children,
    omittedGames: grown.omitted,
    queries,
  };
}

export interface OpeningMapBlock {
  readonly node: OpeningMapNode;
  /** Ply below the root, from 0. */
  readonly row: number;
  /** Left edge and width as fractions of the map's width, 0–1. */
  readonly x: number;
  readonly width: number;
}

/**
 * Every node as a block in an icicle: row by ply, each move's width its
 * share of its parent's. Children start at their parent's left edge, so a
 * branch sits under the move it follows; the room left over at the right of
 * a parent is the rare moves, and the games played after it.
 */
export function layoutOpeningMap(map: Pick<OpeningMap, 'children'>): OpeningMapBlock[] {
  const blocks: OpeningMapBlock[] = [];
  const place = (nodes: readonly OpeningMapNode[], row: number, x: number, width: number) => {
    let left = x;
    for (const node of nodes) {
      const w = width * node.share;
      blocks.push({ node, row, x: left, width: w });
      place(node.children, row + 1, left, w);
      left += w;
    }
  };
  place(map.children, 0, 0, 1);
  return blocks;
}
