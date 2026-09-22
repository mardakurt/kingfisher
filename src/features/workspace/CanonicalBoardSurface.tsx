'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Shape } from '@/chess/annotations';
import type { Score } from '@/chess/evaluation';
import { outcomeAt } from '@/chess/game';
import type { EngineArrow } from '@/features/board/engine-arrows';
import type { MoveIntent } from '@/chess/types';
import { Chessboard } from '@/features/board/Chessboard';
import { useEngineArrows } from '@/features/board/engine-arrows';
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
import { useBoardMoveCapture } from './board-move-capture';
import { useChessWorkspace } from './ChessWorkspaceContext';
import { BOARD_GRID_CLASSNAMES, barSpaceFor, boardGridStyle } from './board-grid';

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
  // What following comes back to when nothing conceals: the person's own
  // setting (Settings → Engine → Follow the board), not always "on".
  const followPreference = usePreferences((state) => state.engineFollowBoard);
  useEffect(() => {
    if (caps.showEvaluation) {
      setFollowBoard(followPreference);
      return;
    }
    setFollowBoard(false);
    stopEngine();
    return () => setFollowBoard(followPreference);
  }, [caps.showEvaluation, node.fen, setFollowBoard, stopEngine, followPreference]);

  const evaluationBarVisible =
    showEvaluationArtifacts && caps.showEvaluation && prefs.showEvaluationBar;
  /** The bar's column plus the gap, in the same units the grid below uses. */
  const barSpace = barSpaceFor(evaluationBarVisible);
  /*
    What the bar reads, decided in one place: the live search when it is on
    this position, otherwise the evaluation stored on the node, otherwise
    nothing. A bar must never show a number that belongs to a different
    position, and the title says which of the three it is showing.

    A live line is *only* trusted once it has crossed `MIN_LIVE_DEPTH`
    plies of search. At depth 1 the engine has only seen its own move and
    reports the side-to-move advantage, which is exactly the reading that
    swings hardest right after the player moves and then climbs back as
    the search settles. Without a floor, the bar animates down to depth-1
    and then back up to depth-N every time the player makes a move; with
    a floor, the bar keeps showing the position's stored evaluation
    (or nothing) until the new search is deep enough to be worth
    replacing it. The same floor applies in reverse: a stored evaluation
    is preferred over a depth-1 line, so opening a finished game never
    flashes a misleading number while the engine catches up.
  */
  const MIN_LIVE_DEPTH = 8;
  const liveRaw = analysedFen === node.fen && analysis?.lines[0] ? analysis : null;
  const live = liveRaw && liveRaw.depth >= MIN_LIVE_DEPTH ? liveRaw : null;
  /*
    The last reading the bar showed, kept across positions. When the player
    moves with the engine running there is a window — the old search is
    stopped, the new one has not reached the depth floor — in which this
    position has neither a live line nor a stored evaluation. Before Phase 72
    the bar answered that window with an even split and "no evaluation",
    every move, for about a tenth of a second: with the 900 ms height
    transition that read as the evaluation collapsing and recovering after
    each move. The bar now keeps the previous reading, dimmed and titled as
    the previous position's, until the new search is worth showing. It does
    so only while a search is actually in flight (`engineRunning`): with the
    engine off, a position without an evaluation says so.
  */
  const [lastReading, setLastReading] = useState<{
    readonly fen: string;
    readonly score: Score;
    readonly depth: number;
    readonly engine: string | null;
  } | null>(null);
  if (
    live &&
    (lastReading === null ||
      lastReading.fen !== node.fen ||
      lastReading.depth !== live.depth ||
      !sameScore(lastReading.score, live.lines[0]!.score))
  ) {
    // Set during render, from render's own inputs: React re-renders at once
    // with the new value, and nothing here reads a ref.
    setLastReading({
      fen: node.fen,
      score: live.lines[0]!.score,
      depth: live.depth,
      engine: engineName,
    });
  }
  const stored = node.evaluation ?? null;
  const previous =
    !live && !stored && engineRunning && lastReading && lastReading.fen !== node.fen
      ? lastReading
      : null;
  const evaluation = live ? live.lines[0]!.score : (stored?.score ?? previous?.score ?? null);
  const evaluationDepth = live ? live.depth : (stored?.depth ?? previous?.depth);
  const evaluationEngine = live ? engineName : (stored?.engine ?? previous?.engine);
  const evaluationStale = !live && stored !== null;
  const evaluationCatchingUp = previous !== null;
  const evaluationLiveLowDepth = liveRaw && !live;
  /*
    A finished game has a result, not an evaluation. The outcome is read the
    same way the position summary reads it, so the bar and the line under
    the board never disagree about whether the game is over.
  */
  const outcome = useMemo(() => outcomeAt(tree, currentId), [tree, currentId]);

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
        {/*
          The board grid is exactly two cells wide and exactly one cell
          tall — the eval bar and the board frame. There is no toolbar
          row. There is no overlay above the board. There is no third
          cell. See `docs/product/postmortem-board-tiny.md` for the chain
          of regressions that produced that decision and the unit test
          (`CanonicalBoardSurface.test.tsx`) that holds the grid to it.

          The grid has an explicit `height: frameSize + barSpace` so
          `1fr` always resolves. The eval bar takes its column's full
          height; the board frame's `aspect-square` matches its column's
          width. Without the explicit height the grid would size to its
          content (the eval bar's natural height, which is the same as
          the column's), and a future addition that brought a third row
          would have nothing to fill the 1fr row against — the chain
          this comment warns about.
        */}
        <div
          className={cn(...BOARD_GRID_CLASSNAMES, !evaluationBarVisible && 'grid-cols-1')}
          style={boardGridStyle(frameSize, evaluationBarVisible)}
        >
          {evaluationBarVisible ? (
            <EvaluationBar
              score={evaluation}
              orientation={orientation}
              outcome={outcome}
              stale={evaluationStale}
              catchingUp={evaluationCatchingUp}
              {...(evaluationLiveLowDepth
                ? { depth: 1 }
                : evaluationDepth
                  ? { depth: evaluationDepth }
                  : {})}
              {...(evaluationEngine ? { engine: evaluationEngine } : {})}
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
          {/*
            A concealing workspace (Review before reveal, Calculation,
            Training) withholds evidence; the position page is exactly that
            evidence and the button must not even be drawn.
          */}
          <BoardControls showPositionPage={caps.showEvaluation} />
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

/** Whether two scores say the same thing, so a repeated snapshot is not a new reading. */
const sameScore = (a: Score, b: Score): boolean =>
  a.kind === b.kind &&
  (a.kind === 'cp'
    ? a.cp === (b as { cp: number }).cp
    : a.moves === (b as { moves: number }).moves);

/* Stable empties, so withholding does not remount the board on every render. */
const EMPTY = new Map<never, never>() as never;
const EMPTY_SHAPES: readonly Shape[] = [];
const EMPTY_ARROWS: readonly EngineArrow[] = [];
