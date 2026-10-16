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

import { MIN_DEPTH, recordAnalysis } from './analysis-history';

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
  /** The deepest search of the bound position already in the analysis history. */
  const historyDepth = useRef(0);

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
        historyDepth.current = 0;
      }

      /*
        The history is written while the search deepens, not only when it
        settles. Settling needs the engine to acknowledge a stop, and a person
        who analyses and then goes to Recent, or closes the tab, never lets it:
        the workspace unmounts first and the position was never noted. Each
        new depth from MIN_DEPTH overwrites the position's one entry.
      */
      const bound = analysedNode.current;
      const deepening = slot.analysis;
      if (
        slot.running &&
        bound &&
        deepening &&
        deepening.depth >= MIN_DEPTH &&
        deepening.depth > historyDepth.current
      ) {
        const node = analysis.tree.nodes[bound];
        const score = deepening.lines[0]?.score;
        if (node && node.fen === deepening.fen && score) {
          historyDepth.current = deepening.depth;
          void recordAnalysis({
            fen: node.fen,
            score,
            depth: deepening.depth,
            engine: slot.identity?.name ?? 'Unknown engine',
            moves: deepening.lines[0]?.moves ?? [],
            title: analysis.document.title,
          });
        }
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

      const evaluation = evaluationFromAnalysis(
        slot.analysis,
        slot.identity?.name ?? 'Unknown engine',
      );
      if (evaluation) {
        analysis.attachEvaluation(nodeId, evaluation);
        // And note the position in the analysis history, so it can be found
        // again from Recent, on this device or any other the account syncs.
        void recordAnalysis({
          fen: node.fen,
          score: evaluation.score,
          depth: slot.analysis.depth,
          engine: evaluation.engine ?? 'Unknown engine',
          moves: slot.analysis.lines[0]?.moves ?? [],
          title: analysis.document.title,
        });
      }
    });

    return unsubscribe;
  }, []);
}
