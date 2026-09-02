'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { Shape } from '@/chess/annotations';
import type { MoveIntent } from '@/chess/types';
import { Chessboard } from '@/features/board/Chessboard';
import { BoardControls } from '@/features/analysis/BoardControls';
import { EvaluationBar } from '@/features/analysis/EvaluationBar';
import { EvaluationGraph } from '@/features/analysis/EvaluationGraph';
import { PositionSummary } from '@/features/analysis/PositionSummary';
import { useAnalysisPosition } from '@/features/analysis/useAnalysisPosition';
import { cn } from '@/lib/cn';
import { useAnalysis } from '@/stores/analysis-store';
import { resolveAnimationMs, usePreferences } from '@/stores/preferences-store';
import { useUi } from '@/stores/ui-store';
import { useEngine } from '@/stores/engine-store';

import { useChessWorkspace, type BoardSurfaceMode } from './ChessWorkspaceContext';

interface CanonicalBoardSurfaceProps {
  readonly mode?: BoardSurfaceMode;
  readonly className?: string;
  readonly showContext?: boolean;
  readonly showEvaluationArtifacts?: boolean;
}

/** The only full-size board pipeline used by research workspaces. */
export function CanonicalBoardSurface({
  mode = 'interactive',
  className,
  showContext = true,
  showEvaluationArtifacts = false,
}: CanonicalBoardSurfaceProps) {
  const { node, position, destinations, checkSquare } = useAnalysisPosition();
  // Cursor, tree and orientation come from the workspace context rather than a
  // second subscription: this surface renders whatever position the workspace
  // is on, and every tool in the dock reads that same value.
  const { currentId, tree, orientation } = useChessWorkspace();
  const play = useAnalysis((state) => state.play);
  const toggleShape = useAnalysis((state) => state.toggleShape);
  const clearShapes = useAnalysis((state) => state.clearShapes);
  const prefs = usePreferences();
  const notify = useUi((state) => state.notify);
  const goTo = useAnalysis((state) => state.goTo);
  const analysis = useEngine((state) => state.primary.analysis);
  const analysedFen = useEngine((state) => state.primary.analysedFen);
  const engineRunning = useEngine((state) => state.primary.running);
  const interactive = mode === 'interactive';
  const boardContainer = useRef<HTMLDivElement>(null);
  const [frameSize, setFrameSize] = useState(320);
  const evaluationBarVisible = showEvaluationArtifacts && prefs.showEvaluationBar;
  const evaluation =
    analysedFen === node.fen
      ? (analysis?.lines[0]?.score ?? null)
      : (node.evaluation?.score ?? null);

  const onMove = useCallback(
    (intent: MoveIntent) => {
      if (!interactive) return;
      const result = play(intent);
      if (!result.ok) notify({ tone: 'error', message: result.error.message });
    },
    [interactive, notify, play],
  );
  const onShapeToggle = useCallback(
    (shape: Shape) => {
      if (mode === 'preview') return;
      toggleShape(currentId, shape);
    },
    [currentId, mode, toggleShape],
  );

  useEffect(() => {
    const element = boardContainer.current;
    if (!element) return;
    const measure = () => {
      const next = Math.max(
        0,
        Math.floor(Math.min(740, element.clientWidth, element.clientHeight)),
      );
      setFrameSize((current) => (current === next ? current : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={cn('flex min-h-0 min-w-0 flex-col', className)} data-board-surface={mode}>
      <div
        ref={boardContainer}
        className="flex min-h-0 flex-1 items-center justify-center"
        data-board-container
      >
        <div
          className={cn(
            'grid items-stretch',
            evaluationBarVisible ? 'grid-cols-[22px_minmax(0,1fr)] gap-3' : 'grid-cols-1',
          )}
          style={{ width: frameSize }}
        >
          {evaluationBarVisible ? (
            <EvaluationBar
              score={evaluation}
              orientation={orientation}
              stale={!engineRunning && analysedFen !== node.fen}
            />
          ) : null}
          <div className="aspect-square w-full min-w-0" data-board-frame>
            <Chessboard
              fen={node.fen}
              orientation={orientation}
              lastMove={node.move}
              checkSquare={checkSquare}
              destinations={interactive ? destinations : new Map()}
              onMove={interactive ? onMove : undefined}
              isPromotion={(from, to) => position.requiresPromotion(from, to)}
              promotionColor={position.turn}
              shapes={node.shapes}
              onShapeToggle={mode === 'preview' ? undefined : onShapeToggle}
              onShapesClear={mode === 'preview' ? undefined : () => clearShapes(currentId)}
              theme={prefs.boardTheme}
              pieceSet={prefs.pieceSet}
              coordinates={prefs.coordinateStyle}
              animationMs={resolveAnimationMs(prefs.animationSpeed)}
            />
          </div>
        </div>
      </div>
      {showContext ? (
        <div className="mx-auto mt-3 flex w-full max-w-[720px] shrink-0 items-center gap-3 border-t border-line-subtle pt-2">
          <BoardControls />
          <PositionSummary />
        </div>
      ) : null}
      {showEvaluationArtifacts && prefs.showEvaluationGraph ? (
        <EvaluationGraph
          tree={tree}
          currentId={currentId}
          onSelect={goTo}
          className="mx-auto mt-2 w-full max-w-[740px] shrink-0"
        />
      ) : null}
    </div>
  );
}
