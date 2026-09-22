/**
 * Applying an annotation plan to a game tree.
 *
 * Separate from `planAnnotations` because the plan is a pure reading of
 * stored evidence and this is an edit: it plays the engine's line through
 * the rules, which is what turns UCI into the SAN a reader sees and what
 * refuses a line the position cannot accept. A line that fails is skipped
 * and counted, never forced — the tree is the player's game, and a move
 * invented to make a variation fit would be the one thing an annotator must
 * never do.
 */

import { insertLine } from '@/chess/game';
import { setComment } from '@/chess/tree/tree';
import type { GameTree } from '@/chess/tree/types';

import type { AnnotationPlan } from './annotate';

export interface WriteResult {
  readonly tree: GameTree;
  readonly written: number;
  /** Plans whose line the rules refused, with the reason. */
  readonly refused: readonly { readonly label: string; readonly reason: string }[];
}

export function writeAnnotations(tree: GameTree, plans: readonly AnnotationPlan[]): WriteResult {
  let current = tree;
  let written = 0;
  const refused: { label: string; reason: string }[] = [];

  for (const plan of plans) {
    const node = current.nodes[plan.nodeId];
    if (!node) {
      refused.push({ label: plan.label, reason: 'the position is no longer in the game' });
      continue;
    }
    const inserted = insertLine(current, plan.nodeId, plan.line, 'uci');
    if (!inserted.ok) {
      refused.push({ label: plan.label, reason: inserted.error.message });
      continue;
    }
    current = inserted.value.tree;
    const head = inserted.value.nodeIds[0];
    if (head) {
      // The comment goes on the first move of the engine's line, where a
      // reader replaying the variation meets it, and where it cannot be
      // mistaken for a comment on the move that was played.
      current = setComment(current, head, plan.comment);
    }
    written += 1;
  }
  return { tree: current, written, refused };
}
