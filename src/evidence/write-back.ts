/**
 * Stored engine evaluations written into a study chapter, as one undoable
 * batch (Phase 86, P0.3 of the parity program).
 *
 * The analysis queue and deep analysis keep what the engine said per
 * canonical position (`engineEvidence`), not per game, so any chapter that
 * reaches an analysed position can have its evaluation. This decides, for one
 * tree, which main-line positions get which stored evaluation — the deepest
 * held — and never writes over an evaluation the node already carries: an
 * evaluation somebody entered, imported or received is authored work.
 *
 * A batch records exactly what it wrote, node by node, so undoing it removes
 * those evaluations and nothing else: a node whose evaluation has been changed
 * since keeps the change. The chapter's revision is the guard against writing
 * over edits made in the meantime (`analysis-write-back-repository.ts`).
 */

import type { Evaluation } from '@/chess/evaluation';
import { positionKey } from '@/chess/fen';
import { clearEvaluation, mainlinePath, setEvaluation } from '@/chess/tree/tree';
import type { GameTree, NodeId } from '@/chess/tree/types';
import type { StoredEngineEvidenceRecord } from '@/persistence/domain';

export interface WriteBackEntry {
  readonly nodeId: NodeId;
  readonly positionKey: string;
  readonly evaluation: Evaluation;
}

export interface WriteBackPlan {
  readonly entries: readonly WriteBackEntry[];
  /** Positions that already carried an evaluation, left as they were. */
  readonly keptExisting: number;
  /** Main-line positions no stored analysis covers. */
  readonly notAnalysed: number;
}

/** The deepest stored answer for a position; ties go to the most recent. */
function deepest(
  records: readonly StoredEngineEvidenceRecord[],
): StoredEngineEvidenceRecord | undefined {
  return [...records].sort((a, b) => b.depth - a.depth || b.analysedAt - a.analysedAt)[0];
}

export const evaluationOf = (record: StoredEngineEvidenceRecord): Evaluation => ({
  score: record.score,
  depth: record.depth,
  nodes: record.nodes,
  timeMs: record.timeMs,
  engine: record.engineName,
  ...(record.pv[0] ? { bestMove: record.pv[0] } : {}),
  recordedAt: record.analysedAt,
});

/**
 * Which main-line positions of `tree` receive which stored evaluation.
 * `evidenceAt(key)` is what is held for a canonical position.
 */
export function planWriteBack(
  tree: GameTree,
  evidenceAt: (positionKey: string) => readonly StoredEngineEvidenceRecord[],
): WriteBackPlan {
  const entries: WriteBackEntry[] = [];
  let keptExisting = 0;
  let notAnalysed = 0;
  for (const id of mainlinePath(tree)) {
    const node = tree.nodes[id];
    if (!node) continue;
    const key = positionKey(node.fen);
    const best = deepest(evidenceAt(key));
    if (!best) {
      notAnalysed += 1;
      continue;
    }
    if (node.evaluation) {
      keptExisting += 1;
      continue;
    }
    entries.push({ nodeId: id, positionKey: key, evaluation: evaluationOf(best) });
  }
  return { entries, keptExisting, notAnalysed };
}

export function applyWriteBack(tree: GameTree, entries: readonly WriteBackEntry[]): GameTree {
  return entries.reduce((next, entry) => setEvaluation(next, entry.nodeId, entry.evaluation), tree);
}

const sameEvaluation = (a: Evaluation | undefined, b: Evaluation) =>
  a !== undefined && JSON.stringify(a) === JSON.stringify(b);

/**
 * Remove what a batch wrote. A node that no longer exists, or whose
 * evaluation is no longer the one the batch wrote, is left alone and counted:
 * that is somebody's later work.
 */
export function undoWriteBack(
  tree: GameTree,
  entries: readonly WriteBackEntry[],
): { readonly tree: GameTree; readonly removed: number; readonly keptChanged: number } {
  let next = tree;
  let removed = 0;
  let keptChanged = 0;
  for (const entry of entries) {
    const node = next.nodes[entry.nodeId];
    if (node && sameEvaluation(node.evaluation, entry.evaluation)) {
      next = clearEvaluation(next, entry.nodeId);
      removed += 1;
    } else {
      keptChanged += 1;
    }
  }
  return { tree: next, removed, keptChanged };
}
