/**
 * Pure, immutable operations on a `GameTree`.
 *
 * Nothing here knows the rules of chess: callers hand in already-validated
 * `ChessMove` values. That keeps tree manipulation trivially testable and lets
 * the structure outlive any particular rules implementation. Chess-aware
 * helpers that need a position live in `../game.ts`.
 *
 * Every function returns a new tree and shares untouched nodes.
 */

import type { Evaluation } from '../evaluation';
import type { Shape } from '../annotations';
import { shapeKey } from '../annotations';
import { parseFen } from '../fen';
import type { ChessMove, Fen } from '../types';
import type { GameTree, MoveNode, NodeId, NodeMeta } from './types';

const ROOT_ID: NodeId = 'r';

/** Half-move index of the position a FEN describes, before any move is played. */
export function startingPly(fen: Fen): number {
  const parsed = parseFen(fen);
  if (!parsed.ok) return 0;
  return (parsed.value.fullmoveNumber - 1) * 2 + (parsed.value.turn === 'b' ? 1 : 0);
}

export function createTree(
  startFen: Fen,
  headers: Readonly<Record<string, string>> = {},
): GameTree {
  const root: MoveNode = {
    id: ROOT_ID,
    parentId: null,
    children: [],
    move: null,
    fen: startFen,
    ply: startingPly(startFen),
    nags: [],
    shapes: [],
    meta: {},
  };
  return { rootId: ROOT_ID, nodes: { [ROOT_ID]: root }, startFen, headers, nextId: 1 };
}

export function getNode(tree: GameTree, id: NodeId): MoveNode | undefined {
  return tree.nodes[id];
}

/** For call sites that already know the id is valid; throws otherwise. */
export function mustGetNode(tree: GameTree, id: NodeId): MoveNode {
  const node = tree.nodes[id];
  if (!node) throw new Error(`No such node in tree: ${id}`);
  return node;
}

export const rootNode = (tree: GameTree): MoveNode => mustGetNode(tree, tree.rootId);

function put(tree: GameTree, ...nodes: MoveNode[]): GameTree {
  const next = { ...tree.nodes };
  for (const node of nodes) next[node.id] = node;
  return { ...tree, nodes: next };
}

function patch(tree: GameTree, id: NodeId, change: (node: MoveNode) => MoveNode): GameTree {
  const node = tree.nodes[id];
  if (!node) return tree;
  return put(tree, change(node));
}

export interface AddMoveResult {
  readonly tree: GameTree;
  readonly nodeId: NodeId;
  /** True when an identical move already existed and was reused. */
  readonly existed: boolean;
}

export interface AddMoveOptions {
  readonly comment?: string;
  readonly preComment?: string;
  readonly nags?: readonly number[];
  readonly shapes?: readonly Shape[];
  readonly evaluation?: Evaluation;
  readonly meta?: NodeMeta;
  /** Insert as the first child, making it the continuation of the line. */
  readonly asMainline?: boolean;
}

/**
 * Attach a move to a node.
 *
 * Replaying a move that already exists returns the existing node instead of
 * duplicating it — this is what makes clicking through an opening tree, or
 * importing overlapping games, converge rather than fan out.
 */
export function addMove(
  tree: GameTree,
  parentId: NodeId,
  move: ChessMove,
  options: AddMoveOptions = {},
): AddMoveResult {
  const parent = mustGetNode(tree, parentId);

  const existingId = parent.children.find((childId) => tree.nodes[childId]?.move?.uci === move.uci);
  if (existingId) {
    let next = tree;
    if (options.asMainline && parent.children[0] !== existingId) {
      next = put(next, {
        ...parent,
        children: [existingId, ...parent.children.filter((id) => id !== existingId)],
      });
    }
    return { tree: next, nodeId: existingId, existed: true };
  }

  const id = `n${tree.nextId}`;
  const node: MoveNode = {
    id,
    parentId,
    children: [],
    move,
    fen: move.after,
    ply: parent.ply + 1,
    nags: options.nags ? [...options.nags] : [],
    shapes: options.shapes ? [...options.shapes] : [],
    meta: options.meta ?? {},
    ...(options.comment !== undefined ? { comment: options.comment } : {}),
    ...(options.preComment !== undefined ? { preComment: options.preComment } : {}),
    ...(options.evaluation !== undefined ? { evaluation: options.evaluation } : {}),
  };

  const children = options.asMainline ? [id, ...parent.children] : [...parent.children, id];
  const withChild: MoveNode = { ...parent, children };

  return {
    tree: { ...put(tree, withChild, node), nextId: tree.nextId + 1 },
    nodeId: id,
    existed: false,
  };
}

/** Ids of a node and everything below it. */
export function collectSubtree(tree: GameTree, id: NodeId): NodeId[] {
  const out: NodeId[] = [];
  const stack: NodeId[] = [id];
  while (stack.length > 0) {
    const current = stack.pop() as NodeId;
    const node = tree.nodes[current];
    if (!node) continue;
    out.push(current);
    stack.push(...node.children);
  }
  return out;
}

export interface RemoveResult {
  readonly tree: GameTree;
  /** Where the cursor should land afterwards. */
  readonly selectionId: NodeId;
}

/** Delete a node and its whole subtree. The root cannot be deleted. */
export function removeNode(tree: GameTree, id: NodeId): RemoveResult {
  const node = tree.nodes[id];
  if (!node || node.parentId === null) return { tree, selectionId: tree.rootId };

  const parent = mustGetNode(tree, node.parentId);
  const doomed = new Set(collectSubtree(tree, id));

  const nodes: Record<NodeId, MoveNode> = {};
  for (const [nodeId, value] of Object.entries(tree.nodes)) {
    if (!doomed.has(nodeId)) nodes[nodeId] = value;
  }
  nodes[parent.id] = { ...parent, children: parent.children.filter((child) => child !== id) };

  return { tree: { ...tree, nodes }, selectionId: parent.id };
}

/** Delete every continuation after a node, keeping the node itself. */
export function truncateAfter(tree: GameTree, id: NodeId): GameTree {
  const node = tree.nodes[id];
  if (!node || node.children.length === 0) return tree;

  const doomed = new Set(node.children.flatMap((child) => collectSubtree(tree, child)));
  const nodes: Record<NodeId, MoveNode> = {};
  for (const [nodeId, value] of Object.entries(tree.nodes)) {
    if (!doomed.has(nodeId)) nodes[nodeId] = value;
  }
  nodes[id] = { ...node, children: [] };
  return { ...tree, nodes };
}

/** Remove every side line branching off a node, keeping its main continuation. */
export function removeVariations(tree: GameTree, id: NodeId): GameTree {
  const node = tree.nodes[id];
  if (!node || node.children.length <= 1) return tree;

  const kept = node.children[0] as NodeId;
  const doomed = new Set(node.children.slice(1).flatMap((child) => collectSubtree(tree, child)));
  const nodes: Record<NodeId, MoveNode> = {};
  for (const [nodeId, value] of Object.entries(tree.nodes)) {
    if (!doomed.has(nodeId)) nodes[nodeId] = value;
  }
  nodes[id] = { ...node, children: [kept] };
  return { ...tree, nodes };
}

/** Root → node, inclusive. Empty when the node is unknown. */
export function nodePath(tree: GameTree, id: NodeId): NodeId[] {
  const path: NodeId[] = [];
  let current = tree.nodes[id];
  while (current) {
    path.push(current.id);
    current = current.parentId ? tree.nodes[current.parentId] : undefined;
  }
  return path.reverse();
}

/** The moves from the root down to a node, in order. */
export function movesTo(tree: GameTree, id: NodeId): ChessMove[] {
  return nodePath(tree, id)
    .map((nodeId) => tree.nodes[nodeId]?.move)
    .filter((move): move is ChessMove => move != null);
}

/** Follow `children[0]` from a node to the end of its line. */
export function lineFrom(tree: GameTree, id: NodeId): NodeId[] {
  const out: NodeId[] = [];
  let current = tree.nodes[id];
  while (current) {
    out.push(current.id);
    const next = current.children[0];
    current = next ? tree.nodes[next] : undefined;
  }
  return out;
}

/** The main line, starting at the root. */
export const mainlinePath = (tree: GameTree): NodeId[] => lineFrom(tree, tree.rootId);

export const nextNode = (tree: GameTree, id: NodeId): NodeId | null =>
  tree.nodes[id]?.children[0] ?? null;

export const previousNode = (tree: GameTree, id: NodeId): NodeId | null =>
  tree.nodes[id]?.parentId ?? null;

export const lastNodeOfLine = (tree: GameTree, id: NodeId): NodeId =>
  lineFrom(tree, id).at(-1) ?? id;

export function siblings(tree: GameTree, id: NodeId): NodeId[] {
  const node = tree.nodes[id];
  if (!node?.parentId) return [];
  return [...(tree.nodes[node.parentId]?.children ?? [])];
}

export function siblingIndex(tree: GameTree, id: NodeId): number {
  return siblings(tree, id).indexOf(id);
}

/** The next/previous alternative to a move, for cycling through variations. */
export function adjacentSibling(tree: GameTree, id: NodeId, delta: number): NodeId | null {
  const list = siblings(tree, id);
  if (list.length < 2) return null;
  const index = list.indexOf(id);
  const target = index + delta;
  if (target < 0 || target >= list.length) return null;
  return list[target] ?? null;
}

/** True when every step from the root to this node took the first child. */
export function isOnMainline(tree: GameTree, id: NodeId): boolean {
  const path = nodePath(tree, id);
  for (let i = 1; i < path.length; i += 1) {
    const parent = tree.nodes[path[i - 1] as NodeId];
    if (parent?.children[0] !== path[i]) return false;
  }
  return true;
}

/** How deeply nested a node is: 0 on the main line, 1 in a side line, and so on. */
export function variationDepth(tree: GameTree, id: NodeId): number {
  const path = nodePath(tree, id);
  let depth = 0;
  for (let i = 1; i < path.length; i += 1) {
    const parent = tree.nodes[path[i - 1] as NodeId];
    if (parent && parent.children[0] !== path[i]) depth += 1;
  }
  return depth;
}

/**
 * The branch point that decides whether a node is on the main line: the first
 * step along its path that is not a first child.
 */
function firstDivergence(tree: GameTree, id: NodeId): { parentId: NodeId; childId: NodeId } | null {
  const path = nodePath(tree, id);
  for (let i = 1; i < path.length; i += 1) {
    const parentId = path[i - 1] as NodeId;
    const childId = path[i] as NodeId;
    if (tree.nodes[parentId]?.children[0] !== childId) return { parentId, childId };
  }
  return null;
}

/**
 * The move that heads the variation a node belongs to.
 *
 * Reordering acts on whole side lines, not on individual moves: a user who
 * selects the fourth move of a variation and asks to move it up means "move
 * this variation up", because a move in the middle of a line has no siblings
 * of its own to be reordered among.
 */
export function variationHeadId(tree: GameTree, id: NodeId): NodeId | null {
  const divergence = firstDivergence(tree, id);
  if (divergence) return divergence.childId;
  return siblings(tree, id).length > 1 ? id : null;
}

/**
 * Move a variation one step within its sibling order.
 *
 * Only the sibling array of one parent changes: no node is recreated, no
 * subtree is copied, and no comment, evaluation or descendant can be lost by
 * construction. Everything outside that one array is shared unchanged.
 */
export function moveVariation(tree: GameTree, id: NodeId, delta: number): GameTree {
  const head = variationHeadId(tree, id);
  if (head === null || delta === 0) return tree;

  const node = tree.nodes[head];
  if (!node?.parentId) return tree;
  const parent = mustGetNode(tree, node.parentId);

  const index = parent.children.indexOf(head);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= parent.children.length) return tree;

  const children = [...parent.children];
  children[index] = children[target] as NodeId;
  children[target] = head;
  return put(tree, { ...parent, children });
}

/**
 * Move a variation one step up in its sibling order.
 *
 * Applied to a move already on the main line this is a no-op, which is what a
 * user pressing the shortcut repeatedly expects.
 */
export const promoteVariation = (tree: GameTree, id: NodeId): GameTree =>
  moveVariation(tree, id, -1);

/** Delete the whole side line a node belongs to. */
export function removeVariation(tree: GameTree, id: NodeId): RemoveResult {
  const head = variationHeadId(tree, id);
  if (head === null) return { tree, selectionId: id };
  return removeNode(tree, head);
}

/** Make a node's line the main line all the way back to the root. */
export function promoteToMainline(tree: GameTree, id: NodeId): GameTree {
  const path = nodePath(tree, id);
  let next = tree;
  for (let i = 1; i < path.length; i += 1) {
    const parentId = path[i - 1] as NodeId;
    const childId = path[i] as NodeId;
    const parent = mustGetNode(next, parentId);
    if (parent.children[0] === childId) continue;
    next = put(next, {
      ...parent,
      children: [childId, ...parent.children.filter((child) => child !== childId)],
    });
  }
  return next;
}

export const setComment = (tree: GameTree, id: NodeId, comment: string): GameTree =>
  patch(tree, id, (node) => {
    const trimmed = comment.trim();
    const { comment: _drop, ...rest } = node;
    return trimmed ? { ...rest, comment: trimmed } : rest;
  });

export const setPreComment = (tree: GameTree, id: NodeId, comment: string): GameTree =>
  patch(tree, id, (node) => {
    const trimmed = comment.trim();
    const { preComment: _drop, ...rest } = node;
    return trimmed ? { ...rest, preComment: trimmed } : rest;
  });

export const setNags = (tree: GameTree, id: NodeId, nags: readonly number[]): GameTree =>
  patch(tree, id, (node) => ({ ...node, nags: [...nags].sort((a, b) => a - b) }));

export const setShapes = (tree: GameTree, id: NodeId, shapes: readonly Shape[]): GameTree =>
  patch(tree, id, (node) => ({ ...node, shapes: [...shapes] }));

/** Drawing the same shape twice erases it, as in every board annotation tool. */
export function toggleShape(tree: GameTree, id: NodeId, shape: Shape): GameTree {
  return patch(tree, id, (node) => {
    const key = shapeKey(shape);
    const existing = node.shapes.find((candidate) => shapeKey(candidate) === key);
    if (existing) {
      return { ...node, shapes: node.shapes.filter((candidate) => shapeKey(candidate) !== key) };
    }
    // A square or arrow can only carry one colour at a time.
    const sameTarget = (candidate: Shape) =>
      candidate.kind === shape.kind &&
      (candidate.kind === 'arrow' && shape.kind === 'arrow'
        ? candidate.from === shape.from && candidate.to === shape.to
        : candidate.kind === 'square' && shape.kind === 'square'
          ? candidate.square === shape.square
          : false);
    return { ...node, shapes: [...node.shapes.filter((c) => !sameTarget(c)), shape] };
  });
}

export const setEvaluation = (tree: GameTree, id: NodeId, evaluation: Evaluation): GameTree =>
  patch(tree, id, (node) => ({ ...node, evaluation }));

export const clearEvaluation = (tree: GameTree, id: NodeId): GameTree =>
  patch(tree, id, (node) => {
    const { evaluation: _drop, ...rest } = node;
    return rest;
  });

export const setMeta = (tree: GameTree, id: NodeId, meta: NodeMeta): GameTree =>
  patch(tree, id, (node) => ({ ...node, meta: { ...node.meta, ...meta } }));

export const setHeaders = (
  tree: GameTree,
  headers: Readonly<Record<string, string>>,
): GameTree => ({ ...tree, headers });

export const setHeader = (tree: GameTree, key: string, value: string): GameTree => ({
  ...tree,
  headers: { ...tree.headers, [key]: value },
});

export const nodeCount = (tree: GameTree): number => Object.keys(tree.nodes).length - 1;

export const hasVariations = (tree: GameTree): boolean =>
  Object.values(tree.nodes).some((node) => node.children.length > 1);
