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

import { BOARD_PRIORITIES } from './layout-model';
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
  /*
    The ceiling is a policy, not a constant. It used to be a hard 740, which on
    a 1920x1080 display left the board smaller than the space available and on
    a 1280x720 one was never reached at all — the board there was 307px,
    limited by a notation panel and padding taken out of the column first.
  */
  const boardCap = usePreferences((state) => BOARD_PRIORITIES[state.boardPriority].maxBoard);

  const caps = useMemo(
    () => resolveBoardCapabilities({ mode, overrides, conceal, concealPieces }),
    [conceal, concealPieces, mode, overrides],
  );

  const evaluationBarVisible =
    showEvaluationArtifacts && caps.showEvaluation && prefs.showEvaluationBar;
  /** The bar's column plus the gap, in the same units the grid below uses. */
  const barSpace = evaluationBarVisible ? EVALUATION_BAR_WIDTH + EVALUATION_BAR_GAP : 0;
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
      /*
        The evaluation bar is beside the board, not part of it. Sizing the
        whole grid to the available height made the *board* narrower than that
        height by the bar and its gap — 34px, which at 1280x720 was the
        difference between a 419px board and a 453px one. Subtract the bar from
        the width budget and give it back when the grid is laid out.
      */
      const next = Math.max(
        0,
        Math.floor(Math.min(boardCap, element.clientWidth - barSpace, element.clientHeight)),
      );
      setFrameSize((current) => (current === next ? current : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
    // Re-measured when the policy changes as well as when the element does:
    // changing Board priority in Settings must resize the board that is on
    // screen, not the next one that happens to mount.
  }, [barSpace, boardCap]);

  return (
    <div
      className={cn('flex min-h-0 min-w-0 flex-col', className)}
      data-board-surface={mode}
      /* The concealment contract, asserted in the DOM so a test can hold us to it. */
      data-board-conceals={caps.showEvaluation ? undefined : 'evidence'}
    >
      <div
        ref={boardContainer}
        className="flex min-h-0 flex-1 items-start justify-center pt-8 mid:items-center mid:pt-0"
        data-board-container
      >
        <div
          className={cn(
            'grid items-stretch',
            evaluationBarVisible ? 'grid-cols-[22px_minmax(0,1fr)] gap-3' : 'grid-cols-1',
          )}
          style={{ width: frameSize + barSpace }}
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
        <div className="mx-auto mt-2 flex w-full max-w-[860px] shrink-0 items-center gap-3 border-t border-line-subtle pt-1.5">
          <BoardControls />
          <PositionSummary />
        </div>
      ) : null}
      {showEvaluationArtifacts && caps.showEvaluation && prefs.showEvaluationGraph ? (
        <EvaluationGraph
          tree={tree}
          currentId={currentId}
          onSelect={goTo}
          className="mx-auto mt-1.5 w-full max-w-[960px] shrink-0"
        />
      ) : null}
    </div>
  );
}

/**
 * The evaluation bar's geometry, in one place.
 *
 * Duplicated between a Tailwind class and a measurement is exactly how a board
 * ends up 34px narrower than the space measured for it, so the two are derived
 * from these constants and the class below names them.
 */
const EVALUATION_BAR_WIDTH = 22;
const EVALUATION_BAR_GAP = 12;

/* Stable empties, so withholding does not remount the board on every render. */
const EMPTY = new Map<never, never>() as never;
const EMPTY_SHAPES: readonly Shape[] = [];
