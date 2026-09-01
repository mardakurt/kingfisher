import { describe, expect, it } from 'vitest';

import { START_FEN } from '../fen';
import { playSanAt } from '../game';
import { expect as unwrap } from '../result';
import {
  collectSubtree,
  createTree,
  isOnMainline,
  mainlinePath,
  moveVariation,
  mustGetNode,
  nodeCount,
  promoteToMainline,
  promoteVariation,
  removeVariation,
  setComment,
  setNags,
  siblings,
  variationHeadId,
} from './tree';
import type { GameTree, NodeId } from './types';

/**
 * Reordering a variation must be a pure permutation of one sibling array.
 * These helpers make that claim checkable rather than eyeballed: every node id,
 * every position, every comment and every parent link is compared before and
 * after, so a promotion that duplicates, drops or re-parents anything fails.
 */
function fingerprintNodes(tree: GameTree): string[] {
  return Object.values(tree.nodes)
    .map((node) =>
      [
        node.id,
        node.parentId ?? 'root',
        node.move?.san ?? '-',
        node.fen,
        node.comment ?? '',
        node.nags.join(','),
        [...node.children].sort().join('+'),
      ].join('|'),
    )
    .sort();
}

function play(tree: GameTree, from: NodeId, moves: string[]): { tree: GameTree; last: NodeId } {
  let current = tree;
  let cursor = from;
  for (const san of moves) {
    const played = unwrap(playSanAt(current, cursor, san));
    current = played.tree;
    cursor = played.nodeId;
  }
  return { tree: current, last: cursor };
}

/**
 * 1.e4 e5 2.Nf3 Nc6 with 2...Nf6 and 2...d6 as alternatives, each carrying a
 * comment and a continuation of its own — the case the brief calls out.
 */
function branchedGame() {
  let tree = createTree(START_FEN);
  const main = play(tree, tree.rootId, ['e4', 'e5', 'Nf3', 'Nc6']);
  tree = main.tree;

  const afterNf3 = mustGetNode(tree, mainlinePath(tree)[3] as NodeId);
  const nc6 = afterNf3.children[0] as NodeId;

  const petroff = play(tree, afterNf3.id, ['Nf6', 'Nxe5', 'd6']);
  tree = petroff.tree;
  const nf6 = mustGetNode(tree, afterNf3.id).children[1] as NodeId;
  tree = setComment(tree, nf6, 'The Petroff.');
  tree = setNags(tree, nf6, [5]);

  const philidor = play(tree, afterNf3.id, ['d6', 'd4']);
  tree = philidor.tree;
  const d6 = mustGetNode(tree, afterNf3.id).children[2] as NodeId;
  tree = setComment(tree, d6, 'Philidor.');

  return { tree, branchPoint: afterNf3.id, nc6, nf6, d6, petroffTail: petroff.last };
}

describe('variation reordering', () => {
  it('swaps two siblings and changes nothing else in the tree', () => {
    const { tree, branchPoint, nc6, nf6 } = branchedGame();
    const before = fingerprintNodes(tree);

    const promoted = promoteVariation(tree, nf6);

    expect(mustGetNode(promoted, branchPoint).children.slice(0, 2)).toEqual([nf6, nc6]);
    expect(nodeCount(promoted)).toBe(nodeCount(tree));

    // The fingerprint ignores sibling order, so an identical fingerprint means
    // the promotion was a pure permutation: no node gained or lost a parent, a
    // position, a comment or a child.
    expect(fingerprintNodes(promoted)).toEqual(before);
  });

  it('keeps comments, glyphs and descendants when a variation is promoted', () => {
    const { tree, nf6, petroffTail } = branchedGame();
    const subtreeBefore = collectSubtree(tree, nf6).sort();

    const promoted = promoteVariation(tree, nf6);

    expect(mustGetNode(promoted, nf6).comment).toBe('The Petroff.');
    expect(mustGetNode(promoted, nf6).nags).toEqual([5]);
    expect(collectSubtree(promoted, nf6).sort()).toEqual(subtreeBefore);
    expect(mustGetNode(promoted, petroffTail).fen).toBe(mustGetNode(tree, petroffTail).fen);
  });

  it('does not change any position, only the order they are listed in', () => {
    const { tree, nf6 } = branchedGame();
    const fens = Object.fromEntries(Object.values(tree.nodes).map((node) => [node.id, node.fen]));

    const promoted = moveVariation(tree, nf6, 1);

    for (const node of Object.values(promoted.nodes)) {
      expect(node.fen).toBe(fens[node.id]);
    }
  });

  it('moves a variation down as well as up', () => {
    const { tree, branchPoint, nc6, nf6, d6 } = branchedGame();

    const down = moveVariation(tree, nf6, 1);
    expect(mustGetNode(down, branchPoint).children).toEqual([nc6, d6, nf6]);

    const backUp = moveVariation(down, nf6, -1);
    expect(mustGetNode(backUp, branchPoint).children).toEqual([nc6, nf6, d6]);
  });

  it('acts on the variation a deep move belongs to, not on the move itself', () => {
    const { tree, branchPoint, nc6, nf6, petroffTail } = branchedGame();

    // `petroffTail` is an only child; the head of its variation is 2...Nf6.
    expect(variationHeadId(tree, petroffTail)).toBe(nf6);
    const promoted = promoteVariation(tree, petroffTail);
    expect(mustGetNode(promoted, branchPoint).children.slice(0, 2)).toEqual([nf6, nc6]);
  });

  it('refuses to move a variation past either end of its siblings', () => {
    const { tree, nc6, d6 } = branchedGame();

    // `nc6` is already first, `d6` already last.
    expect(moveVariation(tree, nc6, -1)).toBe(tree);
    expect(moveVariation(tree, d6, 1)).toBe(tree);
  });

  it('promotes a nested variation to the main line at every branch point', () => {
    const { tree, nf6 } = branchedGame();
    const deep = play(tree, nf6, ['Nxe5', 'd6', 'Nf3', 'Nxe4']);
    const target = deep.last;

    expect(isOnMainline(deep.tree, target)).toBe(false);
    const promoted = promoteToMainline(deep.tree, target);

    expect(isOnMainline(promoted, target)).toBe(true);
    expect(nodeCount(promoted)).toBe(nodeCount(deep.tree));
    expect(mustGetNode(promoted, nf6).comment).toBe('The Petroff.');
  });

  it('deletes a whole side line from a move inside it', () => {
    const { tree, branchPoint, nc6, nf6, d6, petroffTail } = branchedGame();
    const doomed = collectSubtree(tree, nf6);

    const { tree: pruned } = removeVariation(tree, petroffTail);

    expect(mustGetNode(pruned, branchPoint).children).toEqual([nc6, d6]);
    for (const id of doomed) expect(pruned.nodes[id]).toBeUndefined();
    expect(mustGetNode(pruned, d6).comment).toBe('Philidor.');
  });

  it('treats a main-line move with no siblings as having no variation to move', () => {
    const line = play(createTree(START_FEN), 'r', ['e4', 'e5']);
    const [, e5] = mainlinePath(line.tree).slice(1);

    expect(variationHeadId(line.tree, e5 as NodeId)).toBeNull();
    expect(moveVariation(line.tree, e5 as NodeId, -1)).toBe(line.tree);
    expect(siblings(line.tree, e5 as NodeId)).toHaveLength(1);
  });
});
