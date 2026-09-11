/**
 * Phase 43 — connect the existing deterministic `featureTransitions` module to
 * the review queue.
 *
 * The transitions module computes short, factual "what changed" statements
 * for the move that produced a position. Before this module existed, those
 * statements were computed inside `game-review.ts` for the live review
 * session but were never attached to the persistent review item, so a player
 * who came back later saw a critical moment with no narrative about why it
 * mattered structurally.
 *
 * This module is the bridge: given a `GameTree` and a node id, it returns
 * the transitions for the move that reached that node. It deliberately
 * mirrors the call site inside `game-review.ts` (same `minPlyForKingShield`
 * default of 10) so a critical moment read live and read later tells the
 * same story.
 */
import { featureTransitions } from '@/chess/feature-transitions';
import type { GameTree, NodeId } from '@/chess/tree/types';

/**
 * Strategic transitions for the move that reached `nodeId`, or an empty list
 * when nothing structurally changed.
 *
 * A node without a parent (the root of a tree) has no "before", and a node
 * that did not move (the root itself, or a header node) has no move at all,
 * so both return the empty list. The renderer treats an empty list as
 * "show nothing", which is the right behaviour.
 */
export function strategicContextForNode(
  tree: GameTree,
  nodeId: NodeId,
): ReturnType<typeof featureTransitions> {
  const node = tree.nodes[nodeId];
  if (!node) return [];
  const parentId = node.parentId;
  if (!parentId) return [];
  const parent = tree.nodes[parentId];
  if (!parent) return [];
  return featureTransitions(parent.fen, node.fen);
}
