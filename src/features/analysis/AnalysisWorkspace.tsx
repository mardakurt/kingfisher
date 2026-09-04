'use client';

import { useEffect, useRef } from 'react';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { MoveTreePanel } from '@/features/movetree/MoveTreePanel';
import { CanonicalBoardSurface } from '@/features/workspace/CanonicalBoardSurface';
import { useWorkspaceArrangement } from '@/features/workspace/use-arrangement';
import { WorkspaceLowerPanel } from '@/features/workspace/WorkspaceLowerPanel';
import { WorkspaceToolDock } from '@/features/workspace/WorkspaceToolDock';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/cn';
import { useEngine } from '@/stores/engine-store';
import { usePreferences } from '@/stores/preferences-store';

import { Toolbar } from './Toolbar';
import { useAnalysisPosition } from './useAnalysisPosition';
import { useEngineSnapshots } from './useEngineSnapshots';

export function AnalysisWorkspace({
  modelGameStudy = false,
}: {
  readonly modelGameStudy?: boolean;
}) {
  const wide = useMediaQuery('(min-width: 1100px)');
  const { node } = useAnalysisPosition();
  const prefs = usePreferences();
  const runEngine = useEngine((state) => state.analyse);
  const stopEngine = useEngine((state) => state.stop);

  const workspace = modelGameStudy ? 'model-game' : 'analysis';
  const view = useWorkspaceArrangement(workspace, { withMoveTree: true });

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
    <div className="flex min-h-0 flex-1 flex-col">
      <Toolbar />
      {modelGameStudy ? (
        <div className="shrink-0 border-b border-line-subtle bg-surface-2 px-3 py-1 text-center text-[10.5px] text-secondary">
          Model game study · annotations, repertoire and structure remain visible · engine off by
          default · use Guess the Move to work through it one decision at a time
        </div>
      ) : null}
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col overflow-y-auto',
          wide && 'flex-row overflow-hidden',
        )}
      >
        <section className="flex min-h-[650px] min-w-0 flex-1 flex-col wide:min-h-0">
          <CanonicalBoardSurface
            mode="interactive"
            showEvaluationArtifacts
            className="min-h-[500px] flex-1 px-2 py-2 sm:px-3 wide:min-h-0"
          />
          {/*
            Exactly one region claims the move tree. Rendering it here and in
            the dock would give the same module two mount points and two
            scroll positions; `moveTreeInPrimary` is false unless the user has
            explicitly pinned it back to the board column.
          */}
          {view.moveTreeInPrimary ? (
            <div className="h-[210px] shrink-0 border-t border-line-subtle">
              <ErrorBoundary label="The move list">
                <MoveTreePanel />
              </ErrorBoundary>
            </div>
          ) : null}
          <WorkspaceLowerPanel
            workspace={workspace}
            withMoveTree
            moveTreePanel={<MoveTreePanel withHeader={false} />}
          />
        </section>
        <WorkspaceToolDock
          workspace={workspace}
          withMoveTree
          moveTreePanel={<MoveTreePanel withHeader={false} />}
        />
      </div>
    </div>
  );
}
