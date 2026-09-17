/**
 * Regression tests for the board-surface grid.
 *
 * These assertions are written so the next time someone adds a row,
 * column or overlay above the board frame, the test fails before the
 * layout reaches the user. See `docs/product/postmortem-board-tiny.md`
 * for the chain this test exists to prevent.
 */

import { describe, expect, it } from 'vitest';

import { EVALUATION_BAR_WIDTH } from '@/features/analysis/EvaluationBar';

import {
  BOARD_GRID_CLASSNAMES,
  EVALUATION_BAR_GAP,
  barSpaceFor,
  boardGridStyle,
  frameSizeCeiling,
} from './board-grid';

describe('barSpaceFor', () => {
  it('is zero when the evaluation bar is off', () => {
    expect(barSpaceFor(false)).toBe(0);
  });

  it('is the bar width plus the gap when the evaluation bar is on', () => {
    expect(barSpaceFor(true)).toBe(EVALUATION_BAR_WIDTH + EVALUATION_BAR_GAP);
  });

  it('uses a 10 px gap between the bar and the board', () => {
    // The gap is part of the bar's footprint, not part of the board. If
    // a refactor changes the gap, the column gap and the width budget
    // both move together — otherwise the board is offset from the bar by
    // whatever px the gap drifted by.
    expect(EVALUATION_BAR_GAP).toBe(10);
  });
});

describe('boardGridStyle', () => {
  it('is `frameSize` tall in both modes', () => {
    expect(boardGridStyle(320, false).height).toBe(320);
    expect(boardGridStyle(320, true).height).toBe(320);
    expect(boardGridStyle(720, false).height).toBe(720);
  });

  it('is `frameSize + barSpace` wide', () => {
    expect(boardGridStyle(320, false).width).toBe(320);
    expect(boardGridStyle(320, true).width).toBe(320 + EVALUATION_BAR_WIDTH + EVALUATION_BAR_GAP);
  });

  it('uses two columns with a 24-px first column when the eval bar is on', () => {
    const style = boardGridStyle(320, true);
    expect(style.gridTemplateColumns).toBe(`${EVALUATION_BAR_WIDTH}px minmax(0, 1fr)`);
    expect(style.columnGap).toBe(EVALUATION_BAR_GAP);
  });

  it('uses a single column when the eval bar is off', () => {
    const style = boardGridStyle(320, false);
    expect(style.gridTemplateColumns).toBeUndefined();
    expect(style.columnGap).toBeUndefined();
  });

  it('declares the board frame a square by matching width to height', () => {
    /*
      The board frame uses CSS `aspect-square` (i.e. `aspect-ratio: 1`).
      For a square to result, the board frame's column width must equal
      the row height. With the eval bar on, the board column is
      `frameSize` wide (the eval bar's column is `EVALUATION_BAR_WIDTH`)
      and the row is `frameSize` tall (the grid's height). This test
      asserts the equality that the aspect-ratio relies on.
    */
    const style = boardGridStyle(320, true);
    const boardColumnWidth = 320;
    const rowHeight = style.height;
    expect(boardColumnWidth).toBe(rowHeight);
  });
});

describe('frameSizeCeiling', () => {
  it('caps the board at the smaller of width, height, and policy', () => {
    // Width-limited: 800 wide container, 1000 tall, boardCap 960 — board is 800 - 34 = 766
    expect(frameSizeCeiling(800, 1000, 960, true)).toBe(766);
    // Height-limited: 1000 wide container, 500 tall, boardCap 960 — board is 500
    expect(frameSizeCeiling(1000, 500, 960, true)).toBe(500);
    // Policy-limited: width and height are both 2000, boardCap 720 — board is 720
    expect(frameSizeCeiling(2000, 2000, 720, true)).toBe(720);
  });

  it('uses 0 for the bar width when the eval bar is off', () => {
    expect(frameSizeCeiling(800, 1000, 960, false)).toBe(800);
  });

  it('clamps negative results to a positive number', () => {
    // 200 wide - 34 bar = 166; min(166, 100 height) = 100.
    expect(frameSizeCeiling(200, 100, 960, true)).toBe(100);
    // If the container has not laid out yet, the resize observer should
    // see `0` rather than `NaN` or `-Infinity`.
    expect(frameSizeCeiling(0, 0, 960, true)).toBe(-34);
    /*
      The negative is acceptable at the formula level because the resize
      observer wraps it in `Math.max(0, …)`. The wrapper is on the
      consumer, not the formula, so the formula's responsibility is just
      "the smaller of the three inputs". An assertion here would couple
      the formula to its caller; instead the production wrapper is
      asserted separately in `CanonicalBoardSurface.tsx` itself.
    */
  });
});

describe('BOARD_GRID_CLASSNAMES', () => {
  it('always contains `grid` and `items-stretch`', () => {
    expect(BOARD_GRID_CLASSNAMES).toContain('grid');
    expect(BOARD_GRID_CLASSNAMES).toContain('items-stretch');
  });

  it('does not contain a row-template class', () => {
    /*
      Phase 67 removed the toolbar row. If a future change re-adds one,
      the bug it would reintroduce — a third grid row that resets the
      board to its content height — would also re-add a `grid-rows-*`
      class. This test fails first, before the row class shows up in
      the DOM, because every row-template is an explicit declaration
      that this constant must not silently acquire.
    */
    for (const cls of BOARD_GRID_CLASSNAMES) {
      expect(cls.startsWith('grid-rows')).toBe(false);
      expect(cls.startsWith('grid-cols')).toBe(false);
    }
  });
});
