/**
 * Writing what the engine found into the game, as facts.
 *
 * ChessBase's Tactical Analysis walks a game and annotates it; the useful
 * half is that every moment worth a second look ends up *in the tree*, where
 * the player meets it while replaying rather than in a report beside it. The
 * unwanted half is the vocabulary — "blunder", "mistake", "brilliant" — which
 * is a label pinned to a number and reads as a verdict about the player.
 *
 * So this writes the evidence and nothing else. For a move the engine
 * disagreed with, it inserts the engine's own line as a variation from the
 * position before the move, attaches the evaluation to that position, and
 * leaves one comment that a reader can check: the two scores, the move that
 * was played, the move the engine preferred, the depth, and which engine at
 * what time said so. No adjective, no glyph, no NAG — a NAG *is* the label
 * in one character (`docs/design/writing-the-evidence.md`).
 *
 * Nothing here runs an engine. The background queue has already analysed
 * these positions and stored one record per position; this turns those
 * records into edits. Positions the queue never reached produce nothing,
 * which is the difference between "the engine found nothing here" and "the
 * engine was never asked".
 */

import { winningChances, formatScore, type Score } from '@/chess/evaluation';
import { mainlinePath } from '@/chess/tree/tree';
import type { GameTree, NodeId } from '@/chess/tree/types';
import type { Uci } from '@/chess/types';
import type { StoredEngineEvidenceRecord } from '@/persistence/domain';

/**
 * How much a move must cost before it is written down, in win chance.
 *
 * Win chance rather than centipawns, because a centipawn is worth a different
 * amount at +0.2 than at +6: losing 100 centipawns from a level position
 * changes the game, and losing 100 from a won one changes nothing a player
 * needs to study. The default of 10 percentage points is a threshold, not a
 * judgement; the person can move it, and the panel says what it is set to.
 */
export const COST_THRESHOLDS = {
  everything: 0.03,
  noticeable: 0.1,
  serious: 0.2,
} as const;

export type CostThreshold = keyof typeof COST_THRESHOLDS;

export interface AnnotationPlan {
  /** The position the move was played from: where the variation is inserted. */
  readonly nodeId: NodeId;
  readonly ply: number;
  /** Move number and side, ready to print: `23.` or `23…`. */
  readonly label: string;
  readonly playedSan: string;
  /** The engine's preferred line from this position, in UCI. */
  readonly line: readonly Uci[];
  readonly scoreBefore: Score;
  readonly scoreAfter: Score;
  /** Win chance the mover gave up, 0–1, from their own side's perspective. */
  readonly cost: number;
  readonly comment: string;
  readonly engineName: string;
  readonly depth: number;
}

export interface PlanInput {
  readonly tree: GameTree;
  readonly evidence: readonly StoredEngineEvidenceRecord[];
  readonly threshold?: CostThreshold;
  /** Restrict to one side's moves, when a player only wants their own. */
  readonly side?: 'w' | 'b';
}

const sideOf = (fen: string): 'w' | 'b' => (fen.split(' ')[1] === 'b' ? 'b' : 'w');

/** Win chance for the side to move in `fen`, from a score in White's terms. */
const forMover = (score: Score, fen: string): number => {
  const white = winningChances(score);
  return sideOf(fen) === 'w' ? white : 1 - white;
};

/** `23.` for White's 23rd move, `23…` for Black's. */
export function moveLabel(ply: number, side: 'w' | 'b'): string {
  const number = Math.floor(ply / 2) + 1;
  return side === 'w' ? `${number}.` : `${number}…`;
}

/**
 * The edits to make, in move order.
 *
 * A move qualifies when the queue analysed both the position before it and
 * the position after it, the engine's first choice was a different move, and
 * the mover's win chance fell by at least the threshold. All three are
 * required: without the second record there is no "after", and a plan built
 * on one score would be comparing the engine's opinion with itself.
 */
export function planAnnotations(input: PlanInput): readonly AnnotationPlan[] {
  const byNode = new Map<NodeId, StoredEngineEvidenceRecord>();
  for (const record of input.evidence) {
    const existing = byNode.get(record.nodeId);
    // Deepest wins; a later shallower pass must not replace a deeper one.
    if (!existing || record.depth > existing.depth) byNode.set(record.nodeId, record);
  }
  const threshold = COST_THRESHOLDS[input.threshold ?? 'noticeable'];
  const path = mainlinePath(input.tree);
  const plans: AnnotationPlan[] = [];

  for (let index = 0; index < path.length - 1; index += 1) {
    const nodeId = path[index]!;
    const childId = path[index + 1]!;
    const node = input.tree.nodes[nodeId];
    const child = input.tree.nodes[childId];
    if (!node || !child?.move) continue;
    const before = byNode.get(nodeId);
    const after = byNode.get(childId);
    if (!before || !after) continue;

    const side = sideOf(node.fen);
    if (input.side && side !== input.side) continue;
    const best = before.pv[0];
    // The engine agreed: nothing to write. A line identical to the game is
    // not evidence of anything, and a variation repeating it is noise.
    if (!best || best === child.move.uci) continue;

    const cost = forMover(before.score, node.fen) - forMover(after.score, node.fen);
    if (!(cost >= threshold)) continue;

    const label = moveLabel(node.ply, side);
    const line = before.pv.slice(0, 8);
    /*
      The engine's move is not named here. It is the first move of the
      variation this comment sits on, in the notation the board uses; naming
      it again in the engine's own UCI would print two spellings of one move
      in one sentence and make the reader check which is which.
    */
    const comment =
      `${before.engineName} at depth ${before.depth}: ` +
      `${formatScore(before.score, { alwaysSign: true })} before ${label} ${child.move.san}, ` +
      `${formatScore(after.score, { alwaysSign: true })} after. This was its first choice.`;

    plans.push({
      nodeId,
      ply: node.ply,
      label,
      playedSan: child.move.san,
      line,
      scoreBefore: before.score,
      scoreAfter: after.score,
      cost,
      comment,
      engineName: before.engineName,
      depth: before.depth,
    });
  }
  return plans;
}

/** One line for the panel: what a run would write, before it writes it. */
export function describePlan(plans: readonly AnnotationPlan[], threshold: CostThreshold): string {
  if (plans.length === 0)
    return `Nothing to write: no analysed move cost ${Math.round(COST_THRESHOLDS[threshold] * 100)} points of win chance or more.`;
  const worst = plans.reduce((a, b) => (b.cost > a.cost ? b : a));
  return `${plans.length} move${plans.length === 1 ? '' : 's'} to write, the largest at ${worst.label} ${worst.playedSan} (${Math.round(worst.cost * 100)} points).`;
}
