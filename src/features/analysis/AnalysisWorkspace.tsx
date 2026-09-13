'use client';

import { useEffect, useRef } from 'react';

import { WorkspaceFrame } from '@/features/workspace/WorkspaceFrame';
import { useEngine } from '@/stores/engine-store';
import { usePreferences } from '@/stores/preferences-store';

import { Toolbar } from './Toolbar';
import { useAnalysisPosition } from './useAnalysisPosition';
import { useEngineSnapshots } from './useEngineSnapshots';

/**
 * Analysis: the frame with nothing added.
 *
 * Every other route is this plus its subject. What Analysis contributes is
 * the document toolbar on the left of the header, the evaluation artefacts on
 * the board, and the engine's auto-analyse behaviour; the layout is the
 * frame's, which is to say it is the same layout every route has.
 */
export function AnalysisWorkspace({
  modelGameStudy = false,
}: {
  readonly modelGameStudy?: boolean;
}) {
  const { node } = useAnalysisPosition();
  const prefs = usePreferences();
  const runEngine = useEngine((state) => state.analyse);
  const stopEngine = useEngine((state) => state.stop);

  const workspace = modelGameStudy ? 'model-game' : 'analysis';

  useEngineSnapshots();

  useEffect(() => {
    if (modelGameStudy) stopEngine();
  }, [modelGameStudy, stopEngine]);

  const lastAutoFen = useRef<string | null>(null);
  useEffect(() => {
    if (modelGameStudy || !prefs.autoAnalyse || lastAutoFen.current === node.fen) return;
    lastAutoFen.current = node.fen;
    void runEngine('primary', node.fen, prefs.engineLimit, {
      multiPv: prefs.engineMultiPv,
      threads: prefs.engineThreads,
      hashMb: prefs.engineHashMb,
    });
  }, [
    node.fen,
    prefs.autoAnalyse,
    prefs.engineHashMb,
    prefs.engineLimit,
    prefs.engineMultiPv,
    prefs.engineThreads,
    runEngine,
    modelGameStudy,
  ]);

  return (
    <WorkspaceFrame
      workspace={workspace}
      title={modelGameStudy ? 'Model game' : 'Analysis'}
      toolbar={<Toolbar />}
      banner={
        modelGameStudy ? (
          <div className="shrink-0 border-b border-line-subtle bg-surface-2 px-3 py-1 text-center text-[10.5px] text-secondary">
            Model game study · annotations, repertoire and structure remain visible · engine off by
            default · use Guess the Move to work through it one decision at a time
          </div>
        ) : undefined
      }
      board={{ mode: 'interactive', showEvaluationArtifacts: true }}
    />
  );
}
