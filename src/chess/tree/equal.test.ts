import { describe, expect, it } from 'vitest';
import { parseSingleGame } from '@/chess/pgn';
import { sameGameTree } from './equal';
import type { GameTree, MoveNode } from './types';
import { setVideoCue, VIDEO_FILENAME_HEADER } from './video-cues';

const chapter = (): GameTree => {
  const parsed = parseSingleGame('1. e4 e5 *');
  if (!parsed.ok) throw new Error('Invalid fixture');
  return parsed.value.tree;
};

describe('draft tree content equality', () => {
  it('compares persisted content independently of object insertion order and undefined fields', () => {
    const tree = chapter();
    const copy = JSON.parse(JSON.stringify(tree)) as GameTree;
    const reordered = { ...copy, nodes: Object.fromEntries(Object.entries(copy.nodes).reverse()) };
    expect(sameGameTree(tree, reordered)).toBe(true);
    const root = copy.nodes[copy.rootId]!;
    expect(
      sameGameTree(tree, {
        ...copy,
        nodes: { ...copy.nodes, [root.id]: { ...root, comment: undefined } },
      }),
    ).toBe(true);
  });

  it('retains video-only changes and the attachment filename', () => {
    const tree = chapter();
    expect(sameGameTree(tree, setVideoCue(tree, tree.rootId, 0))).toBe(false);
    expect(
      sameGameTree(tree, {
        ...tree,
        headers: { ...tree.headers, [VIDEO_FILENAME_HEADER]: 'lesson.webm' },
      }),
    ).toBe(false);
  });

  it('distinguishes annotations and metadata even when every move and comment is unchanged', () => {
    const tree = chapter();
    const root = tree.nodes[tree.rootId]!;
    const edits: Partial<MoveNode>[] = [
      { nags: [1] },
      { preComment: 'Introduction' },
      { shapes: [{ kind: 'square', brush: 'green', square: 'e4' }] },
      { meta: { question: 'Find a move', questionPoints: 3 } },
      { meta: { clockSeconds: 60 } },
      { children: [...root.children].reverse().concat(root.id) },
    ];
    for (const edit of edits) {
      const changed = {
        ...tree,
        nodes: { ...tree.nodes, [root.id]: { ...root, ...edit } },
      };
      expect(sameGameTree(tree, changed)).toBe(false);
    }
  });
});
