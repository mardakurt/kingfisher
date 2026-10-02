/** User-selected answers with their ancestral moves and original evidence intact. */
import { positionKey } from '@/chess/fen';
import { setQuestion } from '@/chess/tree/questions';
import type { GameTree, NodeId } from '@/chess/tree/types';

export function surveyHandoff(tree: GameTree, answers: readonly NodeId[]): GameTree {
  if (!answers.length) throw new Error('Choose at least one intended move.');
  const parents = new Set<string>();
  for (const id of new Set(answers)) {
    const parent = tree.nodes[id]?.parentId;
    if (parent) {
      const key = positionKey(tree.nodes[parent]!.fen);
      if (parents.has(key)) throw new Error('Choose one intended answer per position.');
      parents.add(key);
    }
  }
  const keep = new Set<NodeId>([tree.rootId]);
  for (const id of answers) {
    if (!tree.nodes[id]?.move) throw new Error('An intended move is missing from the survey.');
    let current: NodeId | null = id;
    while (current) {
      keep.add(current);
      current = tree.nodes[current]!.parentId;
    }
  }
  let result: GameTree = {
    ...tree,
    nodes: Object.fromEntries(
      Object.entries(tree.nodes)
        .filter(([id]) => keep.has(id))
        .map(([id, node]) => [
          id,
          { ...node, children: node.children.filter((child) => keep.has(child)) },
        ]),
    ),
  };
  for (const id of new Set(answers)) result = setQuestion(result, id, 'Find your intended move.');
  return result;
}
