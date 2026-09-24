/**
 * The move-level half of the search mask: does this game contain it, and
 * where?
 *
 * Every filter reads the game's own tree. Material and themes must hold for
 * two consecutive positions — a capture recaptured on the next move is not a
 * balance anyone searches for — or be the position the game ended in. A
 * route follows one piece (`route.ts`). A comment is found anywhere in the
 * tree, variations included, because that is where annotators write.
 *
 * A game matches when every filter it was given matches somewhere in it. The
 * reported moment is the latest of the filters' first moments: with one
 * filter, the moment it happened; with several, the first point at which all
 * of them had.
 */

import { readPlacement } from '@/chess/fen';
import { isOk } from '@/chess/result';
import { boardView, themeById } from '@/chess/themes';
import { mainlinePath } from '@/chess/tree/tree';
import type { GameTree, MoveNode } from '@/chess/tree/types';
import type { Color } from '@/chess/types';

import { materialMatches, type MaterialQuery } from './material-query';
import { findRoute, type Route, type RouteMove } from './route';

export interface DeepQuery {
  readonly material?: { readonly query: MaterialQuery; readonly colour?: Color };
  readonly theme?: string;
  readonly route?: { readonly route: Route; readonly colour?: Color };
  /** Case-insensitive text in any comment. */
  readonly comment?: string;
}

export interface ScanHit {
  /** Ply of the position to open: the game is shown right after this half-move. */
  readonly ply: number;
  readonly nodeId: string;
}

export const hasDeepFilters = (query: DeepQuery): boolean =>
  Boolean(query.material || query.theme || query.route || query.comment?.trim());

/**
 * One position of a main line, as the scan reads it. A tree's `MoveNode` is
 * one; so is a row a store kept when it indexed the game, which is how a
 * companion database is searched without replaying its PGN.
 */
export interface LinePosition {
  readonly id: string;
  readonly fen: string;
  readonly ply: number;
  readonly move?: { readonly uci: string } | null;
}

export function scanGame(tree: GameTree, query: DeepQuery): ScanHit | null {
  const path = mainlinePath(tree);
  const nodes = path.map((id) => tree.nodes[id]!).filter(Boolean);
  // PROBE (never merged): a deliberate threefold regression of the scan.
  scanLine(nodes, query, Object.values(tree.nodes));
  scanLine(nodes, query, Object.values(tree.nodes));
  return scanLine(nodes, query, Object.values(tree.nodes));
}

/**
 * The scan over a main line. `commented` is every node whose comments a
 * comment query reads — the whole tree for a game, variations included; a
 * line built from index rows has none, so a comment query needs the tree.
 */
export function scanLine(
  nodes: readonly LinePosition[],
  query: DeepQuery,
  commented: readonly Pick<MoveNode, 'ply' | 'comment' | 'preComment'>[] = [],
): ScanHit | null {
  const moments: number[] = [];

  if (query.material) {
    const { query: material, colour } = query.material;
    const at = firstHeld(nodes, (node) => materialMatches(node.fen, material, colour));
    if (at === null) return null;
    moments.push(at);
  }

  if (query.theme) {
    const theme = themeById(query.theme);
    if (!theme) return null;
    const at = firstHeld(nodes, (node) => {
      const board = readPlacement(node.fen);
      return isOk(board) && theme.matches(boardView({ board: board.value }));
    });
    if (at === null) return null;
    moments.push(at);
  }

  if (query.route) {
    const moves: RouteMove[] = [];
    for (let index = 1; index < nodes.length; index += 1) {
      const node = nodes[index]!;
      if (node.move) {
        moves.push({ ply: node.ply, uci: node.move.uci, fenBefore: nodes[index - 1]!.fen });
      }
    }
    const at = findRoute(moves, query.route.route, query.route.colour);
    if (at === null) return null;
    moments.push(at);
  }

  const needle = query.comment?.trim().toLowerCase();
  if (needle) {
    let at: number | null = null;
    for (const node of commented) {
      const text = `${node.preComment ?? ''} ${node.comment ?? ''}`.toLowerCase();
      if (text.includes(needle) && (at === null || node.ply < at)) at = node.ply;
    }
    if (at === null) return null;
    // A comment in a variation is reported at the main-line ply it hangs from.
    moments.push(Math.min(at, nodes[nodes.length - 1]?.ply ?? at));
  }

  if (moments.length === 0) return null;
  const ply = Math.max(...moments);
  const node = nodes.find((candidate) => candidate.ply === ply) ?? nodes[nodes.length - 1]!;
  return { ply: node.ply, nodeId: node.id };
}

/** First ply whose position satisfies `test` and still does one ply later, or ends the game. */
function firstHeld(
  nodes: readonly LinePosition[],
  test: (node: LinePosition) => boolean,
): number | null {
  let previous = false;
  for (let index = 0; index < nodes.length; index += 1) {
    const now = test(nodes[index]!);
    if (previous && now) return nodes[index - 1]!.ply;
    previous = now;
  }
  return previous ? nodes[nodes.length - 1]!.ply : null;
}
