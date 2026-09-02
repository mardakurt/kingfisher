import { describe, expect, it } from 'vitest';

import { playSanAt } from '@/chess/game';
import { START_FEN } from '@/chess/fen';
import { expect as unwrap } from '@/chess/result';
import { createTree, mainlinePath, setComment } from '@/chess/tree/tree';
import type { NodeId } from '@/chess/tree/types';

describe('large study tree stress', () => {
  it('keeps thousand-node navigation, branches, comments and reload deterministic', () => {
    const started = performance.now();
    let tree = createTree(START_FEN);
    let cursor: NodeId = tree.rootId;
    const cycle = ['Nf3', 'Nf6', 'Ng1', 'Ng8'];
    for (let index = 0; index < 1_000; index += 1) {
      const played = unwrap(playSanAt(tree, cursor, cycle[index % cycle.length]!));
      tree = played.tree;
      cursor = played.nodeId;
    }
    tree = setComment(tree, cursor, 'End of deterministic stress line.');
    const variation = unwrap(playSanAt(tree, tree.rootId, 'd4'));
    tree = variation.tree;

    const reloaded = JSON.parse(JSON.stringify(tree)) as typeof tree;
    expect(mainlinePath(reloaded)).toHaveLength(1_001);
    expect(reloaded.nodes[reloaded.rootId]?.children).toHaveLength(2);
    expect(reloaded.nodes[cursor]?.comment).toBe('End of deterministic stress line.');
    expect(reloaded.nodes[variation.nodeId]?.move?.san).toBe('d4');
    expect(performance.now() - started).toBeLessThan(5_000);
  });
});
