import { describe, expect, it } from 'vitest';

import { START_FEN } from '../fen';
import { insertLine, playSanAt, repetitionCount } from '../game';
import { expect as unwrap } from '../result';
import {
  addMove,
  createTree,
  hasVariations,
  isOnMainline,
  lineFrom,
  mainlinePath,
  mustGetNode,
  nodeCount,
  nodePath,
  promoteToMainline,
  promoteVariation,
  removeNode,
  removeVariations,
  setComment,
  setNags,
  siblingIndex,
  toggleShape,
  truncateAfter,
  variationDepth,
} from './tree';
import type { GameTree, NodeId } from './types';

/** Play a main line and hand back the tree plus the node reached by each move. */
function lineTree(moves: string[]): { tree: GameTree; ids: NodeId[] } {
  let tree = createTree(START_FEN);
  const ids: NodeId[] = [];
  let cursor = tree.rootId;
  for (const san of moves) {
    const played = unwrap(playSanAt(tree, cursor, san));
    tree = played.tree;
    cursor = played.nodeId;
    ids.push(cursor);
  }
  return { tree, ids };
}

const sanOf = (tree: GameTree, id: NodeId): string => mustGetNode(tree, id).move?.san ?? '(root)';

describe('game tree structure', () => {
  it('starts with a root that stands for the initial position', () => {
    const tree = createTree(START_FEN);
    const root = mustGetNode(tree, tree.rootId);
    expect(root.move).toBeNull();
    expect(root.ply).toBe(0);
    expect(root.children).toEqual([]);
    expect(nodeCount(tree)).toBe(0);
  });

  it('numbers plies from a custom start position', () => {
    const black = createTree(
      'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3' as never,
    );
    expect(mustGetNode(black, black.rootId).ply).toBe(5);
    const played = unwrap(playSanAt(black, black.rootId, 'Bc5'));
    expect(mustGetNode(played.tree, played.nodeId).ply).toBe(6);
  });

  it('reuses an existing node when the same move is replayed', () => {
    const { tree, ids } = lineTree(['e4']);
    expect(mustGetNode(tree, tree.rootId).children).toHaveLength(1);

    const again = unwrap(playSanAt(tree, tree.rootId, 'e4'));
    expect(again.existed).toBe(true);
    expect(again.nodeId).toBe(ids[0]);
    expect(nodeCount(again.tree)).toBe(1);
  });

  it('keeps siblings in insertion order and tracks the main line', () => {
    const { tree, ids } = lineTree(['e4', 'e5']);
    const withSicilian = unwrap(playSanAt(tree, tree.rootId, 'd4'));
    expect(mustGetNode(withSicilian.tree, withSicilian.tree.rootId).children).toEqual([
      ids[0],
      withSicilian.nodeId,
    ]);
    expect(isOnMainline(withSicilian.tree, ids[1] as NodeId)).toBe(true);
    expect(isOnMainline(withSicilian.tree, withSicilian.nodeId)).toBe(false);
    expect(variationDepth(withSicilian.tree, withSicilian.nodeId)).toBe(1);
    expect(hasVariations(withSicilian.tree)).toBe(true);
  });

  it('walks paths and lines', () => {
    const { tree, ids } = lineTree(['e4', 'e5', 'Nf3']);
    expect(nodePath(tree, ids[2] as NodeId)).toEqual([tree.rootId, ...ids]);
    expect(mainlinePath(tree)).toEqual([tree.rootId, ...ids]);
    expect(lineFrom(tree, ids[1] as NodeId)).toEqual([ids[1], ids[2]]);
  });
});

describe('editing variations', () => {
  it('deletes a node together with everything below it', () => {
    const { tree, ids } = lineTree(['e4', 'e5', 'Nf3', 'Nc6']);
    const removed = removeNode(tree, ids[1] as NodeId);
    expect(nodeCount(removed.tree)).toBe(1);
    expect(removed.selectionId).toBe(ids[0]);
    expect(removed.tree.nodes[ids[2] as NodeId]).toBeUndefined();
  });

  it('never deletes the root', () => {
    const { tree } = lineTree(['e4']);
    expect(removeNode(tree, tree.rootId).tree).toBe(tree);
  });

  it('truncates a line after a node', () => {
    const { tree, ids } = lineTree(['e4', 'e5', 'Nf3']);
    const truncated = truncateAfter(tree, ids[0] as NodeId);
    expect(nodeCount(truncated)).toBe(1);
    expect(mustGetNode(truncated, ids[0] as NodeId).children).toEqual([]);
  });

  it('removes side lines but keeps the main continuation', () => {
    const { tree, ids } = lineTree(['e4', 'e5']);
    const withAlt = unwrap(playSanAt(tree, ids[0] as NodeId, 'c5'));
    const cleaned = removeVariations(withAlt.tree, ids[0] as NodeId);
    expect(mustGetNode(cleaned, ids[0] as NodeId).children).toEqual([ids[1]]);
    expect(cleaned.nodes[withAlt.nodeId]).toBeUndefined();
  });
});

describe('promotion of variations', () => {
  it('moves a variation up one slot at its branch point', () => {
    const { tree, ids } = lineTree(['e4', 'e5']);
    let next = unwrap(playSanAt(tree, ids[0] as NodeId, 'c5')).tree;
    const sicilianId = mustGetNode(next, ids[0] as NodeId).children[1] as NodeId;
    next = unwrap(playSanAt(next, ids[0] as NodeId, 'c6')).tree;
    const caroId = mustGetNode(next, ids[0] as NodeId).children[2] as NodeId;

    expect(siblingIndex(next, caroId)).toBe(2);
    const promoted = promoteVariation(next, caroId);
    expect(siblingIndex(promoted, caroId)).toBe(1);
    expect(siblingIndex(promoted, sicilianId)).toBe(2);
    expect(sanOf(promoted, mustGetNode(promoted, ids[0] as NodeId).children[0] as NodeId)).toBe(
      'e5',
    );
  });

  it('promotes a deep variation all the way to the main line', () => {
    const { tree, ids } = lineTree(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
    const branch = unwrap(insertLine(tree, ids[2] as NodeId, ['Nf6', 'Nxe5'], 'san'));
    const deep = branch.nodeId;

    expect(isOnMainline(branch.tree, deep)).toBe(false);
    const promoted = promoteToMainline(branch.tree, deep);
    expect(isOnMainline(promoted, deep)).toBe(true);
    expect(mainlinePath(promoted).map((id) => sanOf(promoted, id))).toEqual([
      '(root)',
      'e4',
      'e5',
      'Nf3',
      'Nf6',
      'Nxe5',
    ]);
    // The old main line survives as a side line.
    expect(mustGetNode(promoted, ids[2] as NodeId).children).toHaveLength(2);
  });

  it('leaves a main-line move untouched', () => {
    const { tree, ids } = lineTree(['e4', 'e5']);
    expect(promoteVariation(tree, ids[1] as NodeId)).toBe(tree);
  });
});

describe('annotations on nodes', () => {
  it('stores comments and drops empty ones', () => {
    const { tree, ids } = lineTree(['e4']);
    const commented = setComment(tree, ids[0] as NodeId, '  Best by test  ');
    expect(mustGetNode(commented, ids[0] as NodeId).comment).toBe('Best by test');
    expect(mustGetNode(setComment(commented, ids[0] as NodeId, ''), ids[0] as NodeId).comment).toBe(
      undefined,
    );
  });

  it('sorts NAGs', () => {
    const { tree, ids } = lineTree(['e4']);
    expect(mustGetNode(setNags(tree, ids[0] as NodeId, [14, 1]), ids[0] as NodeId).nags).toEqual([
      1, 14,
    ]);
  });

  it('toggles shapes and replaces the colour of an existing one', () => {
    const { tree, ids } = lineTree(['e4']);
    const id = ids[0] as NodeId;
    const green = toggleShape(tree, id, { kind: 'arrow', from: 'd2', to: 'd4', brush: 'green' });
    expect(mustGetNode(green, id).shapes).toHaveLength(1);

    const red = toggleShape(green, id, { kind: 'arrow', from: 'd2', to: 'd4', brush: 'red' });
    expect(mustGetNode(red, id).shapes).toEqual([
      { kind: 'arrow', from: 'd2', to: 'd4', brush: 'red' },
    ]);

    const cleared = toggleShape(red, id, { kind: 'arrow', from: 'd2', to: 'd4', brush: 'red' });
    expect(mustGetNode(cleared, id).shapes).toHaveLength(0);
  });
});

describe('chess-aware tree helpers', () => {
  it('inserts a line, reusing moves that already exist', () => {
    const { tree, ids } = lineTree(['e4', 'e5']);
    const inserted = unwrap(insertLine(tree, tree.rootId, ['e4', 'e5', 'Nf3'], 'san'));
    expect(inserted.nodeIds[0]).toBe(ids[0]);
    expect(inserted.nodeIds[1]).toBe(ids[1]);
    expect(nodeCount(inserted.tree)).toBe(3);
  });

  it('inserts a UCI line, as an engine variation arrives', () => {
    const tree = createTree(START_FEN);
    const inserted = unwrap(insertLine(tree, tree.rootId, ['e2e4', 'c7c5', 'g1f3'], 'uci'));
    expect(mainlinePath(inserted.tree).map((id) => sanOf(inserted.tree, id))).toEqual([
      '(root)',
      'e4',
      'c5',
      'Nf3',
    ]);
  });

  it('reports which move of a line was illegal', () => {
    const tree = createTree(START_FEN);
    const result = insertLine(tree, tree.rootId, ['e4', 'e5', 'Qh9'], 'san');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('move 3');
  });

  it('counts repetitions along the line that produced the position', () => {
    const { tree, ids } = lineTree(['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']);
    expect(repetitionCount(tree, ids[7] as NodeId)).toBe(3);
    expect(repetitionCount(tree, ids[3] as NodeId)).toBe(2);
  });

  it('refuses an illegal move without changing the tree', () => {
    const tree = createTree(START_FEN);
    const result = playSanAt(tree, tree.rootId, 'e5');
    expect(result.ok).toBe(false);
    expect(nodeCount(tree)).toBe(0);
  });
});

describe('addMove', () => {
  it('can insert a move at the front of the sibling list', () => {
    const { tree, ids } = lineTree(['e4', 'e5']);
    const alternative = unwrap(playSanAt(tree, ids[0] as NodeId, 'c5', { asMainline: true }));
    expect(mustGetNode(alternative.tree, ids[0] as NodeId).children[0]).toBe(alternative.nodeId);
  });

  it('promotes an existing move when asked to add it as the main line', () => {
    const { tree, ids } = lineTree(['e4', 'e5']);
    const withAlt = unwrap(playSanAt(tree, ids[0] as NodeId, 'c5'));
    const promoted = unwrap(playSanAt(withAlt.tree, ids[0] as NodeId, 'c5', { asMainline: true }));
    expect(promoted.existed).toBe(true);
    expect(mustGetNode(promoted.tree, ids[0] as NodeId).children[0]).toBe(withAlt.nodeId);
  });

  it('throws on an unknown parent id rather than corrupting the tree', () => {
    const { tree, ids } = lineTree(['e4']);
    const move = mustGetNode(tree, ids[0] as NodeId).move;
    expect(move).not.toBeNull();
    expect(() => addMove(tree, 'no-such-node', move as NonNullable<typeof move>)).toThrow();
  });
});
