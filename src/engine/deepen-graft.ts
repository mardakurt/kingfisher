/**
 * Writing a deepened tree into the game on the board, as one edit.
 *
 * Moves go in as variations (a move already there is reused, never
 * duplicated, and the main line is never reordered); every position that
 * was searched carries its evaluation with the engine, depth, nodes and
 * time, as a pinned evaluation does; and where a position's own search
 * disagreed with the line that led to it, that move carries one comment
 * saying so with both moves. Nothing else is written: no glyph, no "best".
 */

import { formatScore } from '@/chess/evaluation';
import { playUciAt } from '@/chess/game';
import { setComment, setEvaluation } from '@/chess/tree/tree';
import type { GameTree, NodeId } from '@/chess/tree/types';

import { changedMinds, type DeepNode } from './deepen';

export interface GraftResult {
  readonly tree: GameTree;
  /** Moves that were not in the tree before. */
  readonly added: number;
  /** Positions given an evaluation from the deepening. */
  readonly evaluated: number;
}

export function graftDeepening(
  tree: GameTree,
  at: NodeId,
  root: DeepNode,
  engine: string,
  recordedAt: number = Date.now(),
): GraftResult {
  let current = tree;
  let added = 0;
  let evaluated = 0;
  const minds = new Map(changedMinds(root).map((mind) => [mind.node, mind]));

  const place = (node: DeepNode, id: NodeId) => {
    const target = current.nodes[id];
    if (node.evaluation && target) {
      /*
        A deeper evaluation already on the node is kept: the deepening is one
        more search, not a reason to throw away a better one.
      */
      const existing = target.evaluation;
      if (!existing || (existing.depth ?? 0) <= node.evaluation.depth) {
        current = setEvaluation(current, id, {
          score: node.evaluation.score,
          depth: node.evaluation.depth,
          nodes: node.evaluation.nodes,
          timeMs: node.evaluation.timeMs,
          engine,
          bestMove: node.evaluation.bestMove,
          recordedAt,
        });
        evaluated += 1;
      }
    }
    const mind = minds.get(node);
    if (mind && node.evaluation && current.nodes[id]) {
      const note = `Deepening: the line that led here expected ${mind.expected.san ?? mind.expected.uci}; a search of this position prefers ${mind.found.san ?? mind.found.uci} (${formatScore(node.evaluation.score)}, depth ${node.evaluation.depth}).`;
      const comment = current.nodes[id]!.comment;
      if (!comment?.includes(note)) {
        current = setComment(current, id, [comment, note].filter(Boolean).join(' '));
      }
    }
    for (const child of node.children) {
      if (!child.move) continue;
      const before = current.nodes[id]?.children.length ?? 0;
      const played = playUciAt(current, id, child.move.uci);
      if (!played.ok) continue;
      current = played.value.tree;
      if ((current.nodes[id]?.children.length ?? 0) > before) added += 1;
      place(child, played.value.nodeId);
    }
  };

  place(root, at);
  return { tree: current, added, evaluated };
}
