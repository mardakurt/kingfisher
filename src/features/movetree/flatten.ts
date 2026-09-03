import type { GameTree, MoveNode, NodeId } from '@/chess/tree/types';

export interface MoveTreeRow {
  readonly id: NodeId;
  readonly node: MoveNode;
  readonly depth: number;
  readonly forceNumber: boolean;
  readonly startsVariation: boolean;
}

interface LineTask {
  readonly kind: 'line';
  readonly parentId: NodeId;
  readonly depth: number;
  readonly forceNumber: boolean;
}

interface VariationTask {
  readonly kind: 'variation';
  readonly nodeId: NodeId;
  readonly depth: number;
}

/**
 * The notation render order without recursion or DOM.
 *
 * A main move is followed by every alternative at its branch point, then by
 * its main continuation — the same order as the normal flowing renderer and
 * PGN serializer. The explicit stack remains safe for pathological trees that
 * nest variations thousands of levels deep.
 */
export function flattenMoveTree(tree: GameTree): readonly MoveTreeRow[] {
  const rows: MoveTreeRow[] = [];
  const tasks: (LineTask | VariationTask)[] = [
    { kind: 'line', parentId: tree.rootId, depth: 0, forceNumber: true },
  ];

  while (tasks.length > 0) {
    const task = tasks.pop()!;
    if (task.kind === 'variation') {
      const node = tree.nodes[task.nodeId];
      if (!node?.move) continue;
      rows.push({
        id: node.id,
        node,
        depth: task.depth,
        forceNumber: true,
        startsVariation: true,
      });
      tasks.push({
        kind: 'line',
        parentId: node.id,
        depth: task.depth,
        forceNumber: Boolean(node.comment),
      });
      continue;
    }

    const parent = tree.nodes[task.parentId];
    const mainId = parent?.children[0];
    const main = mainId ? tree.nodes[mainId] : undefined;
    if (!parent || !main?.move) continue;
    const alternatives = parent.children.slice(1);
    rows.push({
      id: main.id,
      node: main,
      depth: task.depth,
      forceNumber: task.forceNumber,
      startsVariation: false,
    });

    tasks.push({
      kind: 'line',
      parentId: main.id,
      depth: task.depth,
      forceNumber: alternatives.length > 0 || Boolean(main.comment),
    });
    for (let index = alternatives.length - 1; index >= 0; index -= 1) {
      tasks.push({
        kind: 'variation',
        nodeId: alternatives[index]!,
        depth: task.depth + 1,
      });
    }
  }

  return rows;
}
