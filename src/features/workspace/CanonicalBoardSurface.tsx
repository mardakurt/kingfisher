'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Shape } from '@/chess/annotations';
import type { EngineArrow } from '@/features/board/engine-arrows';
import type { MoveIntent } from '@/chess/types';
import { Chessboard } from '@/features/board/Chessboard';
import { useEngineArrows } from '@/features/board/engine-arrows';
import { BoardControls } from '@/features/analysis/BoardControls';
import { EVALUATION_BAR_WIDTH, EvaluationBar } from '@/features/analysis/EvaluationBar';
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
import { BoardEngineAffordance } from './BoardEngineAffordance';
import { useBoardMoveCapture } from './board-move-capture';
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
  const engineName = useEngine((state) => state.primary.identity?.name ?? null);
  const engineArrows = useEngineArrows(node.fen);
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

  /*
    A running engine follows the board — except behind the curtain. Review
    before reveal and Training conceal the evidence, and a search that kept
    following the board there would be evidence gathered where the workspace
    promises nothing is running. Concealment therefore switches following off
    and stops whatever is on; showing the evidence again switches it back on.
    Keyed on the position as well, because Review conceals per position: a
    move from a revealed square to an unrevealed one must stop the search that
    following would otherwise have restarted.
  */
  const setFollowBoard = useEngine((state) => state.setFollowBoard);
  const stopEngine = useEngine((state) => state.stop);
  useEffect(() => {
    if (caps.showEvaluation) {
      setFollowBoard(true);
      return;
    }
    setFollowBoard(false);
    stopEngine();
    return () => setFollowBoard(true);
  }, [caps.showEvaluation, node.fen, setFollowBoard, stopEngine]);

  const evaluationBarVisible =
    showEvaluationArtifacts && caps.showEvaluation && prefs.showEvaluationBar;
  /** The bar's column plus the gap, in the same units the grid below uses. */
  const barSpace = evaluationBarVisible ? EVALUATION_BAR_WIDTH + EVALUATION_BAR_GAP : 0;
  /*
    What the bar reads, decided in one place: the live search when it is on
    this position, otherwise the evaluation stored on the node, otherwise
    nothing. A bar must never show a number that belongs to a different
    position, and the title says which of the three it is showing.
  */
  const live = analysedFen === node.fen && analysis?.lines[0] ? analysis : null;
  const evaluation = live ? live.lines[0]!.score : (node.evaluation?.score ?? null);
  const evaluationDepth = live ? live.depth : node.evaluation?.depth;
  const evaluationEngine = live ? engineName : node.evaluation?.engine;
  const evaluationStale = !live && evaluation !== null;

  /*
    A tool may borrow the board's moves — Review's journal records candidates
    this way. The move is validated against the position exactly as a played
    move would be, then handed over instead of played, and the tool's own
    shapes are drawn on top of the node's.
  */
  const capture = useBoardMoveCapture((state) => state.capture);
  const onMove = useCallback(
    (intent: MoveIntent) => {
      if (!caps.allowMoves) return;
      if (capture) {
        const played = position.play(intent);
        if (!played.ok) {
          notify({ tone: 'error', message: played.error.message });
          return;
        }
        capture.onMove({
          uci: played.value.uci,
          san: played.value.san,
          from: intent.from,
          to: intent.to,
        });
        return;
      }
      const result = play(intent);
      if (!result.ok) notify({ tone: 'error', message: result.error.message });
    },
    [caps.allowMoves, capture, notify, play, position],
  );
  // A capturing tool's shapes are its own drawing, not stored evidence, so
  // they are painted even where the node's annotations are concealed.
  const shapes = useMemo<readonly Shape[]>(() => {
    const own = caps.showAnnotations ? node.shapes : EMPTY_SHAPES;
    if (!capture || capture.shapes.length === 0) return own;
    return own.length === 0 ? capture.shapes : [...own, ...capture.shapes];
  }, [caps.showAnnotations, capture, node.shapes]);
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
            !evaluationBarVisible && 'grid-cols-1',
            /*
             * Phase 63: the toolbar row above the board needs `1fr`
             * on the board row, otherwise `aspect-square` collapses
             * because both rows default to `auto` height and the
             * board frame is an empty container at this level — its
             * intrinsic height is 0, so the row collapses to 0 and
             * aspect-square produces a 0×0 board. Toolbar row is
             * `auto` (it sizes itself); board row is `1fr` (it fills
             * whatever the parent has left after the toolbar).
             */
            'grid-rows-[auto_1fr]',
          )}
          style={{
            width: frameSize + barSpace,
            ...(evaluationBarVisible
              ? {
                  gridTemplateColumns: `${EVALUATION_BAR_WIDTH}px minmax(0, 1fr)`,
                  columnGap: EVALUATION_BAR_GAP,
                }
              : {}),
          }}
        >
          {evaluationBarVisible ? (
            <EvaluationBar
              score={evaluation}
              orientation={orientation}
              stale={evaluationStale}
              {...(evaluationDepth ? { depth: evaluationDepth } : {})}
              {...(evaluationEngine ? { engine: evaluationEngine } : {})}
            />
          ) : null}
          {/*
            Phase 62: the engine affordance used to sit `absolute
            bottom-3 right-3` inside the board frame and covered the
            rook on h1. The board frame is the chessboard itself, so
            any in-frame position lands on a square that a piece may
            also occupy. The button now lives in a thin toolbar row
            that sits above the frame — the same row the coordinates
            would render in — so it never overlaps a piece.
          */}
          {/*
            Phase 65: the toolbar used to rely on `grid-auto-flow: row` to
            find its cell, and the eval bar — also auto-placed, also a grid
            child — got there first. The flow then sat the toolbar in row 1,
            col 2 (the `1fr` column) and pushed the board into row 2, col 1
            (the eval bar's `24px` column), where `aspect-square` drew a
            24×24 board. `col-span-full` makes the toolbar occupy both
            columns of the first row so the eval bar lands in col 1 of row 2
            and the board — the cell that is actually `1fr` — lands beside
            it. `col-span-full` is `grid-column: 1 / -1`, so it is a no-op
            when there is no eval bar (the grid has only one column to span).
          */}
          <div
            className="col-span-full flex min-h-7 items-center justify-end pr-1"
            data-board-toolbar
          >
            <BoardEngineAffordance showEvaluation={caps.showEvaluation} />
          </div>
          <div className="relative aspect-square w-full min-w-0" data-board-frame>
            <BoardErrorBoundary>
              {(fallback) => (
                <Chessboard
                  fen={node.fen}
                  orientation={orientation}
                  lastMove={node.move}
                  checkSquare={checkSquare}
                  destinations={caps.allowMoves ? destinations : EMPTY}
                  legalHints={caps.showLegalHints}
                  onMove={caps.allowMoves ? onMove : undefined}
                  isPromotion={(from, to) => position.requiresPromotion(from, to)}
                  promotionColor={position.turn}
                  shapes={shapes}
                  engineArrows={caps.showEvaluation ? engineArrows : EMPTY_ARROWS}
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
      {capture ? (
        <p
          className="mx-auto mt-1.5 w-full max-w-[860px] shrink-0 rounded-[4px] border border-accent/40 bg-accent/10 px-2.5 py-1 text-center text-[10.5px] text-primary"
          data-board-capture
          role="status"
        >
          {capture.label}
        </p>
      ) : null}
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
 * The gap between the evaluation bar and the board.
 *
 * Duplicated between a Tailwind class and a measurement is exactly how a board
 * ends up 34px narrower than the space measured for it, so the grid's columns
 * and the width budget are both derived from this and the bar's own
 * `EVALUATION_BAR_WIDTH`, and no class names a number.
 */
const EVALUATION_BAR_GAP = 10;

/* Stable empties, so withholding does not remount the board on every render. */
const EMPTY = new Map<never, never>() as never;
const EMPTY_SHAPES: readonly Shape[] = [];
const EMPTY_ARROWS: readonly EngineArrow[] = [];
