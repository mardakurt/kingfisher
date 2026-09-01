'use client';

/**
 * Turning engine output into study data, deliberately.
 *
 * A running search emits a new best line several times a second. None of that
 * is knowledge, and writing it into the game tree would both fill the undo
 * history with noise and make autosave write to the database continuously.
 *
 * A snapshot is taken only when a search *settles* — the engine finished, or
 * the user stopped it. Both are moments the user caused, and both mean "this is
 * the evaluation I want to keep". Everything in between stays in the engine
 * store, where it belongs.
 */

import { useEffect, useRef } from 'react';

import type { Evaluation } from '@/chess/evaluation';
import type { EngineAnalysis } from '@/engine/types';
import type { NodeId } from '@/chess/tree/types';
import { useAnalysis } from '@/stores/analysis-store';
import { useEngine } from '@/stores/engine-store';

/** The evaluation a snapshot of a finished search stands for. */
export function evaluationFromAnalysis(
  analysis: EngineAnalysis,
  engineName: string,
): Evaluation | null {
  const best = analysis.lines[0];
  if (!best || analysis.depth === 0) return null;
  return {
    score: best.score,
    depth: analysis.depth,
    ...(analysis.seldepth ? { seldepth: analysis.seldepth } : {}),
    ...(analysis.nodes ? { nodes: analysis.nodes } : {}),
    ...(analysis.timeMs ? { timeMs: analysis.timeMs } : {}),
    engine: engineName,
    ...(best.moves[0] ? { bestMove: best.moves[0] } : {}),
    recordedAt: Date.now(),
  };
}

export function useEngineSnapshots(): void {
  /**
   * Which node the search belongs to. The cursor may have moved on since the
   * search started, so the snapshot must not be attached to wherever the user
   * happens to be standing when the engine stops.
   */
  const analysedNode = useRef<NodeId | null>(null);
  const analysedFen = useRef<string | null>(null);
  const wasRunning = useRef(false);

  useEffect(() => {
    const unsubscribe = useEngine.subscribe((engine) => {
      const analysis = useAnalysis.getState();

      // Re-bind on every new search, including the stream of them that
      // automatic analysis starts while the user walks through a game.
      // Only the primary engine writes evaluations into the tree. A comparison
      // run is for reading two opinions, not for two engines overwriting one
      // stored number with each other's.
      const slot = engine.primary;
      if (slot.analysedFen !== analysedFen.current) {
        analysedFen.current = slot.analysedFen;
        const current = analysis.tree.nodes[analysis.currentId];
        analysedNode.current = current?.fen === slot.analysedFen ? current.id : null;
      }

      const settled = wasRunning.current && !slot.running;
      wasRunning.current = slot.running;
      if (!settled) return;

      const nodeId = analysedNode.current;
      analysedNode.current = null;
      if (!nodeId || !slot.analysis) return;

      // The node may have been deleted, or the search may have outlived a reload
      // of the tree; only attach when it still stands for the analysed position.
      const node = analysis.tree.nodes[nodeId];
      if (!node || node.fen !== slot.analysis.fen) return;

      const evaluation = evaluationFromAnalysis(slot.analysis, slot.identity?.name ?? 'Stockfish');
      if (evaluation) analysis.attachEvaluation(nodeId, evaluation);
    });

    return unsubscribe;
  }, []);
}
