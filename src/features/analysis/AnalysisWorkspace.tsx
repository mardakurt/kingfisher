'use client';

import { useCallback, useEffect, useRef } from 'react';

import type { Shape } from '@/chess/annotations';
import { Chessboard } from '@/features/board/Chessboard';
import { MoveTree } from '@/features/movetree/MoveTree';
import { EnginePanel } from '@/features/engine/EnginePanel';
import { ExplorerPanel } from '@/features/explorer/ExplorerPanel';
import { NotesPanel } from '@/features/notes/NotesPanel';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Panel, PanelHeader } from '@/components/ui/Panel';
import { Tabs } from '@/components/ui/Tabs';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/cn';
import { useAnalysis } from '@/stores/analysis-store';
import { useEngine } from '@/stores/engine-store';
import { usePreferences } from '@/stores/preferences-store';
import { useUi, type RightPanelTab, type WorkspacePanelTab } from '@/stores/ui-store';
import type { MoveIntent } from '@/chess/types';

import { BoardControls } from './BoardControls';
import { EvaluationGraph } from './EvaluationGraph';
import { EvaluationBar } from './EvaluationBar';
import { PositionSummary } from './PositionSummary';
import { Toolbar } from './Toolbar';
import { useAnalysisPosition } from './useAnalysisPosition';
import { useEngineSnapshots } from './useEngineSnapshots';

const RIGHT_TABS: readonly { id: RightPanelTab; label: string }[] = [
  { id: 'engine', label: 'Engine' },
  { id: 'explorer', label: 'Explorer' },
  { id: 'notes', label: 'Notes' },
];

const WORKSPACE_TABS: readonly { id: WorkspacePanelTab; label: string }[] = [
  { id: 'moves', label: 'Moves' },
  ...RIGHT_TABS,
];

export function AnalysisWorkspace() {
  const wideWorkspace = useMediaQuery('(min-width: 1100px)');

  const { node, position, destinations, checkSquare, tree, currentId } = useAnalysisPosition();

  const orientation = useAnalysis((state) => state.orientation);
  const play = useAnalysis((state) => state.play);
  const goTo = useAnalysis((state) => state.goTo);
  const toggleShape = useAnalysis((state) => state.toggleShape);
  const clearShapes = useAnalysis((state) => state.clearShapes);
  const notify = useUi((state) => state.notify);
  const setMoveMenu = useUi((state) => state.setMoveMenu);
  const setCommentingNodeId = useUi((state) => state.setCommentingNodeId);

  useEngineSnapshots();

  const prefs = usePreferences();
  const rightTab = useUi((state) => state.rightTab);
  const setRightTab = useUi((state) => state.setRightTab);
  const workspaceTab = useUi((state) => state.workspaceTab);
  const setWorkspaceTab = useUi((state) => state.setWorkspaceTab);

  const analysis = useEngine((state) => state.analysis);
  const analysedFen = useEngine((state) => state.analysedFen);
  const engineRunning = useEngine((state) => state.running);
  const runEngine = useEngine((state) => state.analyse);

  const evaluationForBar =
    analysedFen === node.fen
      ? (analysis?.lines[0]?.score ?? null)
      : (node.evaluation?.score ?? null);

  const onMove = useCallback(
    (intent: MoveIntent) => {
      const result = play(intent);
      if (!result.ok) notify({ tone: 'error', message: result.error.message });
    },
    [notify, play],
  );

  const onShapeToggle = useCallback(
    (shape: Shape) => toggleShape(currentId, shape),
    [currentId, toggleShape],
  );

  const onMoveContextMenu = useCallback(
    (nodeId: string, event: React.MouseEvent) =>
      setMoveMenu({ nodeId, x: event.clientX, y: event.clientY }),
    [setMoveMenu],
  );

  // Re-analyse when the position changes, if the user asked for that.
  const lastAutoFen = useRef<string | null>(null);
  useEffect(() => {
    if (!prefs.autoAnalyse) return;
    if (lastAutoFen.current === node.fen) return;
    lastAutoFen.current = node.fen;
    void runEngine(node.fen, prefs.engineLimit, {
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
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Toolbar />

      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col overflow-y-auto',
          wideWorkspace && 'flex-row overflow-hidden',
        )}
      >
        <section className="flex min-w-0 shrink-0 flex-col gap-2 px-2 py-2 sm:gap-3 sm:px-4 sm:py-3 min-[1100px]:min-h-0 min-[1100px]:flex-1 min-[1100px]:px-5 min-[1100px]:py-4">
          <div className="flex min-h-0 shrink-0 items-center justify-center min-[1100px]:flex-1">
            <div
              className={cn(
                'grid w-full items-stretch',
                prefs.showEvaluationBar
                  ? 'max-w-[min(750px,calc(100dvh-136px))] grid-cols-[18px_minmax(0,1fr)] gap-2 sm:grid-cols-[20px_minmax(0,1fr)] sm:gap-3'
                  : 'max-w-[min(720px,calc(100dvh-136px))] grid-cols-1',
              )}
            >
              {prefs.showEvaluationBar && (
                <EvaluationBar
                  score={evaluationForBar}
                  orientation={orientation}
                  stale={!engineRunning && analysedFen !== node.fen}
                />
              )}
              <div className="aspect-square min-w-0 w-full">
                <Chessboard
                  fen={node.fen}
                  orientation={orientation}
                  lastMove={node.move}
                  checkSquare={checkSquare}
                  destinations={destinations}
                  onMove={onMove}
                  isPromotion={(from, to) => position.requiresPromotion(from, to)}
                  promotionColor={position.turn}
                  shapes={node.shapes}
                  onShapeToggle={onShapeToggle}
                  onShapesClear={() => clearShapes(currentId)}
                  theme={prefs.boardTheme}
                  pieceSet={prefs.pieceSet}
                  coordinates={prefs.showCoordinates}
                  animated={prefs.animateMoves}
                />
              </div>
            </div>
          </div>

          <div className="flex min-w-0 shrink-0 items-center justify-between gap-2">
            <BoardControls />
            <PositionSummary />
          </div>

          {prefs.showEvaluationGraph && (
            <EvaluationGraph
              tree={tree}
              currentId={currentId}
              onSelect={goTo}
              className="mx-auto w-full max-w-[min(750px,calc(100dvh-136px))] shrink-0"
            />
          )}
        </section>

        {wideWorkspace ? (
          <aside className="flex w-[clamp(340px,30vw,430px)] shrink-0 flex-col border-l border-line-subtle bg-surface-1">
            <div className="flex min-h-0 flex-[1.3] flex-col border-b border-line-subtle">
              <div className="shrink-0 border-b border-line-subtle">
                <Tabs items={RIGHT_TABS} value={rightTab} onChange={setRightTab} />
              </div>
              <div className="min-h-0 flex-1">
                <RightPanelContent tab={rightTab} />
              </div>
            </div>

            <Panel className="min-h-[170px] flex-1">
              <PanelHeader>Moves</PanelHeader>
              <div className="min-h-0 flex-1">
                <ErrorBoundary label="The move list">
                  <MoveTree
                    tree={tree}
                    currentId={currentId}
                    onSelect={goTo}
                    onContextMenu={onMoveContextMenu}
                    onEditComment={setCommentingNodeId}
                  />
                </ErrorBoundary>
              </div>
            </Panel>
          </aside>
        ) : (
          <section className="flex min-h-[320px] shrink-0 flex-col border-t border-line-subtle bg-surface-1 sm:min-h-[380px]">
            <div className="shrink-0 border-b border-line-subtle">
              <Tabs
                items={WORKSPACE_TABS}
                value={workspaceTab}
                onChange={setWorkspaceTab}
                className="justify-center sm:justify-start"
              />
            </div>
            <div className="h-[min(46dvh,440px)] min-h-[280px]">
              {workspaceTab === 'moves' ? (
                <ErrorBoundary label="The move list">
                  <MoveTree
                    tree={tree}
                    currentId={currentId}
                    onSelect={goTo}
                    onContextMenu={onMoveContextMenu}
                    onEditComment={setCommentingNodeId}
                  />
                </ErrorBoundary>
              ) : (
                <RightPanelContent tab={workspaceTab} />
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function RightPanelContent({ tab }: { readonly tab: RightPanelTab }) {
  return (
    <ErrorBoundary label={`The ${tab} panel`} key={tab}>
      {tab === 'engine' && <EnginePanel />}
      {tab === 'explorer' && <ExplorerPanel />}
      {tab === 'notes' && <NotesPanel />}
    </ErrorBoundary>
  );
}
