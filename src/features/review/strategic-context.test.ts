import { describe, expect, it } from 'vitest';

import { START_FEN, positionKey } from '@/chess/fen';
import { playUciAt } from '@/chess/game';
import { createTree, mainlinePath } from '@/chess/tree/tree';

import { strategicContextForNode } from './strategic-context';

const KEY = positionKey(START_FEN);

function playMainline(moves: readonly string[]): ReturnType<typeof createTree> & {
  __last?: string;
} {
  let tree = createTree(START_FEN);
  let last = tree.rootId;
  for (const uci of moves) {
    const next = playUciAt(tree, last, uci);
    if (!next.ok) throw new Error(`Could not play ${uci}`);
    tree = next.value.tree;
    last = next.value.nodeId;
  }
  return tree;
}

describe('strategicContextForNode', () => {
  it('returns the empty list when the node does not exist', () => {
    const tree = createTree(START_FEN);
    expect(strategicContextForNode(tree, 'missing' as never)).toEqual([]);
  });

  it('returns the empty list for the root node, which has no parent', () => {
    const tree = createTree(START_FEN);
    const root = tree.rootId;
    expect(strategicContextForNode(tree, root)).toEqual([]);
  });

  it('returns a (possibly empty) list for any non-root node', () => {
    /*
      1.e4 e5 2.Nf3 — a quiet developing move. Most openings yield nothing
      here, and the legitimate "show nothing" state is the empty list.
      The helper must always return an array, never undefined.
    */
    const tree = playMainline(['e2e4', 'e7e5', 'g1f3']);
    const path = mainlinePath(tree);
    const target = path[3];
    expect(target).toBeDefined();
    const result = strategicContextForNode(tree, target as never);
    expect(Array.isArray(result)).toBe(true);
  });

  it('exposes a stable position key for the root fen', () => {
    const tree = createTree(START_FEN);
    const rootFen = tree.nodes[tree.rootId]?.fen;
    expect(rootFen).toBe(START_FEN);
    expect(KEY).toBeDefined();
  });
});
