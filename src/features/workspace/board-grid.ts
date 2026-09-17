/**
 * The board-surface grid's layout math.
 *
 * Lifted out of `CanonicalBoardSurface.tsx` so a unit test can hold the
 * math itself to a contract: the grid's width and height must be derived
 * from the same `frameSize`, the eval bar's column must be exactly
 * `EVALUATION_BAR_WIDTH` wide, and the board frame must always be a
 * square. Every regression in this file was caught, in production,
 * five times across Phase 62 / 63 / 65 / 66 because none of those
 * phases asserted the result. The assertions live here now.
 *
 * See `docs/product/postmortem-board-tiny.md` for the chain of
 * regressions that produced this file.
 */

import { EVALUATION_BAR_WIDTH } from '@/features/analysis/EvaluationBar';

/**
 * The horizontal gap between the eval bar and the board, in pixels.
 *
 * Lived inside `CanonicalBoardSurface.tsx` until Phase 67 moved it here
 * so the grid layout test could pin both it and `EVALUATION_BAR_WIDTH`
 * to the same number the production component uses.
 */
export const EVALUATION_BAR_GAP = 10;

/**
 * The width the eval bar's column takes, including the gap to its right.
 *
 * `barSpace = 0` when the eval bar is off; `barSpace = 34` when it is on
 * (24 px bar + 10 px gap). The grid's total width is `frameSize + barSpace`
 * and the board column's width is `frameSize`.
 */
export const barSpaceFor = (evaluationBarVisible: boolean): number =>
  evaluationBarVisible ? EVALUATION_BAR_WIDTH + EVALUATION_BAR_GAP : 0;

export interface BoardGridStyle {
  /** Width of the grid in pixels. `frameSize + barSpace`. */
  readonly width: number;
  /** Height of the grid in pixels. Always `frameSize`. */
  readonly height: number;
  /**
   * CSS template-columns declaration, or `undefined` when the grid has a
   * single column (no eval bar).
   *
   * When set, this is the literal string the `<div style>` carries — the
   * grid renders with two columns whose boundary matches the eval bar
   * width and gap exactly.
   */
  readonly gridTemplateColumns: string | undefined;
  /** CSS column-gap in pixels. `undefined` for a single-column grid. */
  readonly columnGap: number | undefined;
}

/**
 * The grid's `style` declaration, derived from `frameSize` and whether
 * the eval bar is on. The shape is the smallest set of properties the
 * production component reads, so the test can assert on each in turn.
 */
export const boardGridStyle = (
  frameSize: number,
  evaluationBarVisible: boolean,
): BoardGridStyle => {
  const barSpace = barSpaceFor(evaluationBarVisible);
  return {
    width: frameSize + barSpace,
    height: frameSize,
    gridTemplateColumns: evaluationBarVisible
      ? `${EVALUATION_BAR_WIDTH}px minmax(0, 1fr)`
      : undefined,
    columnGap: evaluationBarVisible ? EVALUATION_BAR_GAP : undefined,
  };
};

/**
 * The ceiling on `frameSize` for a given container and eval-bar state.
 *
 * Mirrors the resize observer's formula in `CanonicalBoardSurface.tsx`:
 * the board can be no larger than the smaller of the policy's cap, the
 * container's width minus the bar's footprint, and the container's height.
 *
 * `0` is the right answer when the container has not laid out yet —
 * the resize observer's `Math.max(0, …)` clamps it; the test asserts the
 * formula directly so the next refactor does not silently drop a clamp.
 */
export const frameSizeCeiling = (
  clientWidth: number,
  clientHeight: number,
  boardCap: number,
  evaluationBarVisible: boolean,
): number =>
  Math.floor(Math.min(boardCap, clientWidth - barSpaceFor(evaluationBarVisible), clientHeight));

/**
 * The class names that the grid's `<div>` must always carry.
 *
 * Held as a constant so the test can assert the grid is still a CSS
 * Grid (`'grid'`, `'items-stretch'`) and so a future refactor that
 * removes the explicit grid layout fails the test before it ships.
 */
export const BOARD_GRID_CLASSNAMES = ['grid', 'items-stretch'] as const;
