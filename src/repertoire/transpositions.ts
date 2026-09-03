/**
 * Every move order that reaches one repertoire decision.
 *
 * A tree is the wrong shape for opening preparation and always has been. It
 * shows divergence perfectly and convergence not at all, so a player looking at
 * a Catalan tabiya in three different files has no way to see that they are
 * looking at the same position three times — and, worse, no way to be sure
 * that fixing it in one place fixed it everywhere.
 *
 * Kingfisher's repertoires are keyed by canonical position (ADR 0010), so the
 * knowledge already *is* shared: editing through one route changes what every
 * route shows, because there is only one record. What was missing was any way
 * to see that. This module derives the routes.
 *
 * Nothing here writes. It reads a repertoire's stored positions and reports
 * which sequences of prepared moves arrive at a given key, which is a graph
 * traversal over data that already exists.
 */

import { positionKey } from '@/chess/fen';
import { Position } from '@/chess/position';
import { isOk } from '@/chess/result';
import type { San, Uci } from '@/chess/types';
import type { RepertoirePositionRecord } from '@/persistence/domain';

export interface TranspositionRoute {
  /** The prepared moves that reach the position, in order. */
  readonly moves: readonly RouteMove[];
  /** Plies from the repertoire's root. */
  readonly length: number;
}

export interface RouteMove {
  readonly uci: Uci;
  readonly san: San;
  readonly fromKey: string;
  readonly toKey: string;
}

export interface TranspositionView {
  readonly positionKey: string;
  readonly routes: readonly TranspositionRoute[];
  /**
   * True when the traversal stopped before exhausting the graph.
   *
   * A repertoire with many transpositions can have a very large number of
   * routes to a deep position, and listing four hundred of them is not
   * evidence, it is noise. The flag exists so the UI can say the list is
   * partial rather than implying it is complete.
   */
  readonly truncated: boolean;
}

export interface TranspositionOptions {
  /** The position every route starts from. Defaults to the standard start. */
  readonly rootKey?: string;
  readonly maxRoutes?: number;
  readonly maxPlies?: number;
}

export const DEFAULT_MAX_ROUTES = 12;
export const DEFAULT_MAX_PLIES = 24;

/**
 * Find the prepared move orders that reach `target`.
 *
 * Breadth-first, so the shortest route is reported first — which is almost
 * always the one the player thinks of the line as being. Cycles are impossible
 * to walk into twice because a visited key is never re-expanded, and a
 * repetition that returns to an earlier position therefore cannot generate
 * infinitely many "routes" that differ only by a shuffle.
 */
export function routesToPosition(
  positions: readonly RepertoirePositionRecord[],
  target: string,
  options: TranspositionOptions = {},
): TranspositionView {
  const maxRoutes = options.maxRoutes ?? DEFAULT_MAX_ROUTES;
  const maxPlies = options.maxPlies ?? DEFAULT_MAX_PLIES;
  const rootKey = options.rootKey ?? START_KEY;

  const edges = buildEdges(positions);
  if (!edges.has(rootKey)) return { positionKey: target, routes: [], truncated: false };

  const routes: TranspositionRoute[] = [];
  let truncated = false;

  // Each queue entry is a complete path, so a route can be reported the moment
  // it arrives rather than reconstructed from parent pointers afterwards.
  const queue: { key: string; moves: RouteMove[]; seen: ReadonlySet<string> }[] = [
    { key: rootKey, moves: [], seen: new Set([rootKey]) },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.key === target && current.moves.length > 0) {
      routes.push({ moves: current.moves, length: current.moves.length });
      if (routes.length >= maxRoutes) {
        truncated = queue.length > 0;
        break;
      }
      continue;
    }
    if (current.moves.length >= maxPlies) {
      truncated = true;
      continue;
    }

    for (const edge of edges.get(current.key) ?? []) {
      if (current.seen.has(edge.toKey)) continue;
      queue.push({
        key: edge.toKey,
        moves: [...current.moves, edge],
        seen: new Set([...current.seen, edge.toKey]),
      });
    }
  }

  return { positionKey: target, routes, truncated };
}

/**
 * Render a route the way a player writes a line down.
 *
 * `1.d4 Nf6 2.c4 e6 3.Nf3 d5` — numbered from the root, with the first move
 * numbered 1 regardless of which colour the repertoire is for, because that is
 * how the line would be written in a book.
 */
export function describeRoute(route: TranspositionRoute, startPly = 0): string {
  const parts: string[] = [];
  route.moves.forEach((move, index) => {
    const ply = startPly + index;
    if (ply % 2 === 0) parts.push(`${Math.floor(ply / 2) + 1}.${move.san}`);
    else parts.push(String(move.san));
  });
  return parts.join(' ');
}

/**
 * Group every position in a repertoire by how many routes reach it.
 *
 * The convergence points are where a repertoire's real maintenance burden
 * lives: a position reached five ways is one that five different lines will
 * quietly inherit any change to.
 */
export function convergencePoints(
  positions: readonly RepertoirePositionRecord[],
  options: TranspositionOptions = {},
): readonly { readonly positionKey: string; readonly routes: number }[] {
  const rootKey = options.rootKey ?? START_KEY;
  const arrivals = new Map<string, Set<string>>();
  for (const [fromKey, edges] of buildEdges(positions)) {
    for (const edge of edges) {
      const from = arrivals.get(edge.toKey) ?? new Set<string>();
      from.add(fromKey);
      arrivals.set(edge.toKey, from);
    }
  }
  return [...arrivals]
    .filter(([key, from]) => key !== rootKey && from.size > 1)
    .map(([key, from]) => ({ positionKey: key, routes: from.size }))
    .sort((a, b) => b.routes - a.routes || a.positionKey.localeCompare(b.positionKey));
}

/**
 * The graph, derived by playing each prepared move from its own position.
 *
 * A repertoire move stores what to play, not where it lands — correctly, since
 * storing the destination would be storing something derivable and therefore
 * something that can disagree with the rules. The cost is that the graph has
 * to be built, which is one `advanceSan` per stored move. That is cheap enough
 * for a repertoire (hundreds of positions, not millions) and it means the
 * graph can never drift from what the moves actually do.
 *
 * A move the rules refuse is skipped rather than throwing: a repertoire that
 * survived an edit to its start position should still show every route it can
 * still justify, not fail to render.
 */
export function buildEdges(
  positions: readonly RepertoirePositionRecord[],
): ReadonlyMap<string, readonly RouteMove[]> {
  const edges = new Map<string, RouteMove[]>();
  for (const position of positions) {
    const source = Position.fromTrustedFen(position.fen);
    for (const move of position.moves) {
      const played = source.advanceSan(String(move.san));
      if (!isOk(played)) continue;
      const toKey = positionKey(played.value.next.fen);
      const list = edges.get(position.positionKey) ?? [];
      if (list.some((edge) => edge.uci === move.uci)) continue;
      list.push({ uci: move.uci, san: move.san, fromKey: position.positionKey, toKey });
      edges.set(position.positionKey, list);
    }
    // A position with no prepared moves still exists in the graph, so a route
    // that ends there is distinguishable from one that ran off the edge.
    if (!edges.has(position.positionKey)) edges.set(position.positionKey, []);
  }
  return edges;
}

/** The canonical key of the standard starting position. */
export const START_KEY = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';
