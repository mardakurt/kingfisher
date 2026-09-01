/**
 * Chess-aware operations over a game tree.
 *
 * `tree/tree.ts` is pure structure; this module is where structure meets the
 * rules. Anything that needs to know whether a move is legal, or what position
 * a node stands for, belongs here.
 */

import { positionKey } from './fen';
import { Position } from './position';
import { err, ok, type ChessError, type Result } from './result';
import { addMove, mustGetNode, nodePath, type AddMoveOptions } from './tree/tree';
import type { GameTree, MoveNode, NodeId } from './tree/types';
import type { GameOutcome, MoveIntent } from './types';

export function positionAt(tree: GameTree, nodeId: NodeId): Position {
  return Position.fromTrustedFen(mustGetNode(tree, nodeId).fen);
}

export interface PlayResult {
  readonly tree: GameTree;
  readonly nodeId: NodeId;
  readonly existed: boolean;
}

export function playIntentAt(
  tree: GameTree,
  nodeId: NodeId,
  intent: MoveIntent,
  options: AddMoveOptions = {},
): Result<PlayResult> {
  const move = positionAt(tree, nodeId).play(intent);
  if (!move.ok) return move;
  return ok(addMove(tree, nodeId, move.value, options));
}

export function playSanAt(
  tree: GameTree,
  nodeId: NodeId,
  san: string,
  options: AddMoveOptions = {},
): Result<PlayResult> {
  const move = positionAt(tree, nodeId).playSan(san);
  if (!move.ok) return move;
  return ok(addMove(tree, nodeId, move.value, options));
}

export function playUciAt(
  tree: GameTree,
  nodeId: NodeId,
  uci: string,
  options: AddMoveOptions = {},
): Result<PlayResult> {
  const move = positionAt(tree, nodeId).playUci(uci);
  if (!move.ok) return move;
  return ok(addMove(tree, nodeId, move.value, options));
}

export interface InsertLineResult {
  readonly tree: GameTree;
  /** The node reached by the last move of the line. */
  readonly nodeId: NodeId;
  /** Nodes created or reused, in order. */
  readonly nodeIds: readonly NodeId[];
}

/**
 * Append a sequence of moves, reusing nodes that already exist.
 *
 * This is how an engine principal variation or a database line becomes part of
 * the analysis: an existing continuation is followed rather than duplicated,
 * and only genuinely new moves create nodes.
 */
export function insertLine(
  tree: GameTree,
  nodeId: NodeId,
  moves: readonly string[],
  notation: 'san' | 'uci',
  options: AddMoveOptions = {},
): Result<InsertLineResult> {
  let current = tree;
  let cursor = nodeId;
  const created: NodeId[] = [];

  for (const [index, text] of moves.entries()) {
    const played =
      notation === 'san'
        ? playSanAt(current, cursor, text, index === 0 ? options : {})
        : playUciAt(current, cursor, text, index === 0 ? options : {});
    if (!played.ok) {
      return err({
        ...played.error,
        message: `${played.error.message} (move ${index + 1} of the line: "${text}")`,
      } satisfies ChessError);
    }
    current = played.value.tree;
    cursor = played.value.nodeId;
    created.push(cursor);
  }

  return ok({ tree: current, nodeId: cursor, nodeIds: created });
}

/**
 * Threefold repetition, evaluated over the line leading to a node.
 *
 * Repetition is a property of a game, not of a position, so it cannot live on
 * `Position`: the same FEN is a draw in one line and not in another.
 */
export function repetitionCount(tree: GameTree, nodeId: NodeId): number {
  const target = positionKey(mustGetNode(tree, nodeId).fen);
  let count = 0;
  for (const id of nodePath(tree, nodeId)) {
    const node = tree.nodes[id];
    if (node && positionKey(node.fen) === target) count += 1;
  }
  return count;
}

export const isThreefoldRepetition = (tree: GameTree, nodeId: NodeId): boolean =>
  repetitionCount(tree, nodeId) >= 3;

export function outcomeAt(tree: GameTree, nodeId: NodeId): GameOutcome | null {
  const positional = positionAt(tree, nodeId).outcome();
  if (positional) return positional;
  if (isThreefoldRepetition(tree, nodeId)) return { kind: 'threefold-repetition' };
  return null;
}

/** SAN text of a line, for compact display such as engine variations. */
export function sanLine(tree: GameTree, nodeIds: readonly NodeId[]): string[] {
  return nodeIds
    .map((id) => tree.nodes[id]?.move?.san)
    .filter((san): san is NonNullable<typeof san> => san != null);
}

/** The node whose move produced the current position, walking back over the root. */
export function lastMoveNode(tree: GameTree, nodeId: NodeId): MoveNode | null {
  const node = tree.nodes[nodeId];
  return node && node.move ? node : null;
}
