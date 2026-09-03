'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

import {
  resolveBoardCapabilities,
  type BoardCapabilities,
  type BoardSurfaceMode,
} from './board-capabilities';
import { BoardErrorBoundary } from './BoardErrorBoundary';
import { useChessWorkspace } from './ChessWorkspaceContext';

interface CanonicalBoardSurfaceProps {
  readonly mode?: BoardSurfaceMode;
  readonly className?: string;
  readonly showContext?: boolean;
  readonly showEvaluationArtifacts?: boolean;
  /** Narrowing capability overrides. Concealment cannot be undone by these. */
  readonly capabilities?: Partial<BoardCapabilities>;
  /** Withhold everything that could reveal the answer. See board-capabilities.ts. */
  readonly conceal?: boolean;
  readonly concealPieces?: boolean;
}

/**
 * The only full-size board pipeline used by research workspaces.
 *
 * Every route renders this, and every route's board therefore reads the same
 * cursor, tree, orientation and document from the workspace context. There is
 * no route-local FEN that can drift from the workspace: a board showing a
 * different position from the engine beside it is the single worst bug this
 * application could have, and the way to not have it is to have one source.
 */
export function CanonicalBoardSurface({
  mode = 'interactive',
  className,
  showContext = true,
  showEvaluationArtifacts = false,
  capabilities: overrides,
  conceal = false,
  concealPieces = false,
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
  const boardContainer = useRef<HTMLDivElement>(null);
  const [frameSize, setFrameSize] = useState(320);

  const caps = useMemo(
    () => resolveBoardCapabilities({ mode, overrides, conceal, concealPieces }),
    [conceal, concealPieces, mode, overrides],
  );

  const evaluationBarVisible =
    showEvaluationArtifacts && caps.showEvaluation && prefs.showEvaluationBar;
  const evaluation =
    analysedFen === node.fen
      ? (analysis?.lines[0]?.score ?? null)
      : (node.evaluation?.score ?? null);

  const onMove = useCallback(
    (intent: MoveIntent) => {
      if (!caps.allowMoves) return;
      const result = play(intent);
      if (!result.ok) notify({ tone: 'error', message: result.error.message });
    },
    [caps.allowMoves, notify, play],
  );
  const onShapeToggle = useCallback(
    (shape: Shape) => {
      if (!caps.allowAnnotations) return;
      toggleShape(currentId, shape);
    },
    [caps.allowAnnotations, currentId, toggleShape],
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
    <div
      className={cn('flex min-h-0 min-w-0 flex-col', className)}
      data-board-surface={mode}
      /* The concealment contract, asserted in the DOM so a test can hold us to it. */
      data-board-conceals={caps.showEvaluation ? undefined : 'evidence'}
    >
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
          <div className="relative aspect-square w-full min-w-0" data-board-frame>
            <BoardErrorBoundary>
              {(fallback) => (
                <Chessboard
                  fen={node.fen}
                  orientation={orientation}
                  lastMove={node.move}
                  checkSquare={checkSquare}
                  destinations={caps.allowMoves && caps.showLegalHints ? destinations : EMPTY}
                  onMove={caps.allowMoves ? onMove : undefined}
                  isPromotion={(from, to) => position.requiresPromotion(from, to)}
                  promotionColor={position.turn}
                  shapes={caps.showAnnotations ? node.shapes : EMPTY_SHAPES}
                  onShapeToggle={caps.allowAnnotations ? onShapeToggle : undefined}
                  onShapesClear={caps.allowAnnotations ? () => clearShapes(currentId) : undefined}
                  theme={fallback.theme ?? prefs.boardTheme}
                  pieceSet={fallback.pieceSet ?? prefs.pieceSet}
                  coordinates={caps.showCoordinates ? prefs.coordinateStyle : 'none'}
                  animationMs={resolveAnimationMs(prefs.animationSpeed)}
                />
              )}
            </BoardErrorBoundary>
            {/*
              The blindfold is an overlay rather than a different board, so the
              squares underneath stay clickable and a move can still be entered
              by dragging between squares you cannot see. That is the exercise.
            */}
            {caps.concealPieces ? (
              <div
                className="pointer-events-none absolute inset-0 flex items-center justify-center bg-surface-1"
                aria-hidden
                data-board-blindfold
              >
                <span className="rounded-[4px] bg-surface-2/90 px-2 py-1 text-[10px] text-tertiary">
                  Pieces hidden
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {showContext && caps.allowContextActions ? (
        <div className="mx-auto mt-3 flex w-full max-w-[720px] shrink-0 items-center gap-3 border-t border-line-subtle pt-2">
          <BoardControls />
          <PositionSummary />
        </div>
      ) : null}
      {showEvaluationArtifacts && caps.showEvaluation && prefs.showEvaluationGraph ? (
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

/* Stable empties, so withholding does not remount the board on every render. */
const EMPTY = new Map<never, never>() as never;
const EMPTY_SHAPES: readonly Shape[] = [];
