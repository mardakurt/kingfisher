import { describe, expect, it } from 'vitest';

import { playSanAt } from '@/chess/game';
import { START_FEN } from '@/chess/fen';
import { expect as unwrap } from '@/chess/result';
import { createTree, mainlinePath, setComment } from '@/chess/tree/tree';
import type { NodeId } from '@/chess/tree/types';
import type { GameTree, MoveNode } from '@/chess/tree/types';
import { NO_FLAGS } from '@/chess/types';
import { flattenMoveTree } from '@/features/movetree/flatten';

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

  it('flattens a realistic 20,000-node branched tree without recursion', () => {
    const tree = syntheticTree(20_000, 2_000);
    const started = performance.now();
    const rows = flattenMoveTree(tree);
    const elapsed = performance.now() - started;

    expect(rows).toHaveLength(20_000);
    expect(new Set(rows.map((row) => row.id)).size).toBe(20_000);
    expect(rows.filter((row) => row.startsVariation)).toHaveLength(2_000);
    expect(rows.some((row) => row.node.comment?.includes('variable-height'))).toBe(true);
    expect(elapsed).toBeLessThan(250);

    const reloadStarted = performance.now();
    const reloaded = JSON.parse(JSON.stringify(tree)) as GameTree;
    expect(flattenMoveTree(reloaded)).toHaveLength(20_000);
    expect(performance.now() - reloadStarted).toBeLessThan(1_500);
  });
});

function syntheticTree(total: number, branches: number): GameTree {
  const main = total - branches;
  const nodes: Record<NodeId, MoveNode> = {};
  const rootId = 'r';
  const mainChildren = new Map<number, NodeId[]>();
  for (let index = 0; index < branches; index += 1) {
    const parentIndex = Math.floor((index * (main - 1)) / branches);
    const list = mainChildren.get(parentIndex) ?? [];
    list.push(`v${index}`);
    mainChildren.set(parentIndex, list);
  }
  nodes[rootId] = {
    id: rootId,
    parentId: null,
    children: ['n1', ...(mainChildren.get(0) ?? [])],
    move: null,
    fen: START_FEN,
    ply: 0,
    nags: [],
    shapes: [],
    meta: {},
  };
  for (let index = 1; index <= main; index += 1) {
    const id = `n${index}`;
    const children = index < main ? [`n${index + 1}`, ...(mainChildren.get(index) ?? [])] : [];
    nodes[id] = node(id, index === 1 ? rootId : `n${index - 1}`, index, children);
  }
  for (let index = 0; index < branches; index += 1) {
    const parentIndex = Math.floor((index * (main - 1)) / branches);
    const parentId = parentIndex === 0 ? rootId : `n${parentIndex}`;
    const ply = parentIndex + 1;
    nodes[`v${index}`] = node(`v${index}`, parentId, ply, [], true);
  }
  return { rootId, nodes, startFen: START_FEN, headers: { Result: '*' }, nextId: total + 1 };
}

function node(
  id: NodeId,
  parentId: NodeId,
  ply: number,
  children: readonly NodeId[],
  variation = false,
): MoveNode {
  return {
    id,
    parentId,
    children,
    move: {
      from: 'g1',
      to: 'f3',
      piece: 'n',
      color: ply % 2 ? 'w' : 'b',
      san: (variation ? 'd4' : ply % 2 ? 'Nf3' : 'Nf6') as never,
      uci: (variation ? 'd2d4' : ply % 2 ? 'g1f3' : 'g8f6') as never,
      flags: NO_FLAGS,
      before: START_FEN,
      after: START_FEN,
    },
    fen: START_FEN,
    ply,
    nags: [],
    ...(ply % 997 === 0 ? { comment: 'A variable-height comment for the render model.' } : {}),
    shapes: [],
    meta: {},
  };
}
