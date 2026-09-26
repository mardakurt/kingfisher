/**
 * Finding the node to open a game at (Phase 86): by ply on the main line, or
 * by canonical position — the first main-line node whose position is it, so
 * a game reached by another move order opens at the same position.
 */

import { positionKey } from '../fen';
import { mainlinePath } from './tree';
import type { GameTree, NodeId } from './types';

export function nodeAtPly(tree: GameTree, ply: number): NodeId | null {
  for (const id of mainlinePath(tree)) {
    if (tree.nodes[id]?.ply === ply) return id;
  }
  return null;
}

export function nodeAtPosition(tree: GameTree, key: string): NodeId | null {
  for (const id of mainlinePath(tree)) {
    const node = tree.nodes[id];
    if (node && positionKey(node.fen) === key) return id;
  }
  return null;
}
