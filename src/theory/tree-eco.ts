/**
 * Where the opening's name changes, along a line.
 *
 * ChessBase calls this "dynamic ECO": the code beside the move list follows
 * the game rather than labelling it once from its headers. The research's
 * fifteenth row asks for it, and Kingfisher already has the honest half — a
 * classification computed from the position rather than read from a tag
 * (`theory/openings.ts`), and the rule that a deep position inherits the last
 * named opening above it rather than acquiring a new one.
 *
 * So this is not a classifier. It walks a line asking the index at each
 * position, and reports only the plies where the answer *changed*: the moves
 * at which a reader would want the new name printed. Everything between two
 * marks is the name above it, which is the inheritance rule made visible
 * rather than restated.
 *
 * Pure.
 */

import type { GameTree, NodeId } from '@/chess/tree/types';
import { classifyPosition, type OpeningIndex } from './openings';

export interface EcoMark {
  readonly nodeId: NodeId;
  readonly ply: number;
  readonly eco: string;
  readonly name: string;
  readonly variation?: string;
}

/**
 * The marks along `path`, in order.
 *
 * A mark is emitted when the classification at a position differs from the
 * one carried down to it — by code or by name — and never when it merely
 * repeats. The first named position on a line always produces a mark, since
 * there is nothing above it to repeat.
 */
export function ecoMarks(
  index: OpeningIndex,
  tree: GameTree,
  path: readonly NodeId[],
): readonly EcoMark[] {
  const marks: EcoMark[] = [];
  let currentEco = '';
  let currentName = '';
  let currentVariation = '';
  for (const nodeId of path) {
    const node = tree.nodes[nodeId];
    if (!node?.move) continue;
    const hit = classifyPosition(index, node.fen);
    if (!hit) continue;
    const variation = hit.variation ?? '';
    if (hit.eco === currentEco && hit.name === currentName && variation === currentVariation) {
      continue;
    }
    currentEco = hit.eco;
    currentName = hit.name;
    currentVariation = variation;
    marks.push({
      nodeId,
      ply: node.ply,
      eco: hit.eco,
      name: hit.name,
      ...(hit.variation ? { variation: hit.variation } : {}),
    });
  }
  return marks;
}

/** The marks by node, for a renderer that walks rows rather than a path. */
export const ecoMarksByNode = (marks: readonly EcoMark[]): ReadonlyMap<NodeId, EcoMark> =>
  new Map(marks.map((mark) => [mark.nodeId, mark]));
