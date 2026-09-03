'use client';

import { useEffect, useRef } from 'react';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Panel, PanelHeader } from '@/components/ui/Panel';
import { MoveTree } from '@/features/movetree/MoveTree';
import { CanonicalBoardSurface } from '@/features/workspace/CanonicalBoardSurface';
import { WorkspaceToolDock } from '@/features/workspace/WorkspaceToolDock';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/cn';
import { useAnalysis } from '@/stores/analysis-store';
import { useEngine } from '@/stores/engine-store';
import { usePreferences } from '@/stores/preferences-store';
import { useUi } from '@/stores/ui-store';

import { Toolbar } from './Toolbar';
import { useAnalysisPosition } from './useAnalysisPosition';
import { useEngineSnapshots } from './useEngineSnapshots';

export function AnalysisWorkspace({
  modelGameStudy = false,
}: {
  readonly modelGameStudy?: boolean;
}) {
  const wide = useMediaQuery('(min-width: 1100px)');
  const { node, tree, currentId } = useAnalysisPosition();
  const goTo = useAnalysis((state) => state.goTo);
  const setMoveMenu = useUi((state) => state.setMoveMenu);
  const setCommentingNodeId = useUi((state) => state.setCommentingNodeId);
  const prefs = usePreferences();
  const runEngine = useEngine((state) => state.analyse);
  const stopEngine = useEngine((state) => state.stop);

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
            className="min-h-[500px] flex-1 px-3 py-3 sm:px-5 sm:py-4 wide:min-h-0"
          />
          <Panel className="h-[210px] shrink-0 border-t border-line-subtle">
            <PanelHeader>Moves &amp; variations</PanelHeader>
            <div className="min-h-0 flex-1">
              <ErrorBoundary label="The move list">
                <MoveTree
                  tree={tree}
                  currentId={currentId}
                  onSelect={goTo}
                  onContextMenu={(nodeId, event) =>
                    setMoveMenu({ nodeId, x: event.clientX, y: event.clientY })
                  }
                  onEditComment={setCommentingNodeId}
                />
              </ErrorBoundary>
            </div>
          </Panel>
        </section>
        <WorkspaceToolDock workspace={modelGameStudy ? 'model-game' : 'analysis'} />
      </div>
    </div>
  );
}
