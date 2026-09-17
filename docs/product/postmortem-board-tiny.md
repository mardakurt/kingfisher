# Postmortem — the board-tiny chain (Phase 62 → 66)

This is a permanent record. It is here so the next agent who adds a
new row, column or overlay above the board cannot repeat the same
mistake in five different ways before any of them sticks.

## What the user saw

A board that rendered at 24 × 24 px (sometimes 24 × 50, depending on
the eval bar's row-height trick), with the engine "Analyse" pill
sitting on top of an empty square. It looked like the board had been
crushed into a corner. For a chess application this is a completely
fatal bug — the board is the application.

## The chain, told straight

The bug took five phases to fully fix because every fix assumed the
previous one had stuck and reached for the next layer of the layout
instead of stepping back. Here is what actually happened:

1. **Phase 62 — toolbar row added above the board.** The Analyse
   button used to sit `absolute bottom-3 right-3` inside the board
   frame, which covered the rook on h1 in the starting position.
   Phase 62 moved it to a thin toolbar row _above_ the frame so it
   could not overlap any piece. The grid became three children:
   eval bar (col 1), toolbar (the new row), board (the new row).
   The grid was still `grid-rows: auto auto`.

2. **Phase 63 hotfix — toolbar row collapsed the board to 0 × 0.**
   With `grid-rows: auto auto`, both rows were auto. The toolbar
   row took its content height (28 px). The board frame is an empty
   container at the grid level — its intrinsic height is 0 — so the
   board row collapsed to 0. `aspect-square` then drew a 0 × 0
   board. The hotfix changed the grid to `grid-rows: auto 1fr`,
   assuming `1fr` would fix it. The board came back. Or so we
   thought.

3. **Phase 65 — board was in the eval-bar column.** The eval bar
   lives in the 24 px column. The board lived in the 1fr column. But
   `grid-auto-flow: row` (the default) placed the eval bar first
   (row 1 col 1), the toolbar second (row 1 col 2), and the board
   third (row 2 col 1 — the eval-bar column). The board was 24 × 24.
   The fix was `col-span-full` on the toolbar.

4. **Phase 66 — board was 24 × 24 anyway.** Adding `col-span-full`
   to the toolbar moved it back to spanning both columns of row 1,
   and the eval bar dropped into col 1 of row 2. The board moved
   into col 2 of row 2. That fixed the **column** but not the
   **row**: the grid lived inside a flex parent with `items-start`,
   so the grid sized to its content (the toolbar row's auto height,
   28 px). The `1fr` row had 0 leftover space, so the board frame's
   `aspect-square` drew whatever column width it had (320 px) at 0 px
   tall. The fix was an explicit `height: frameSize + 28` on the
   grid, with the toolbar's height extracted to a
   `TOOLBAR_HEIGHT` constant.

5. **Phase 67 — board was 28 px shorter than it could be.** Even
   with all of the above fixed, the board was eating 28 px of
   vertical space for a toolbar that mostly duplicated the engine
   panel's own Analyse button. The toolbar was not a _layout_ thing,
   it was a _visibility_ thing, and the engine panel already had one.
   The toolbar is gone; the engine panel is the single source of
   truth for "start the engine here".

The cost of "fix the layout" five times across five phases, with the
shipped code passing tests each time, was the user's trust and a full
day of confused screenshots. That is the cost this document exists to
prevent.

## Why the fixes failed to catch each other

- **Phase 62 had no visual regression test.** The toolbar looked
  fine in isolation. The board was still visible at the bottom of
  the toolbar in the developer's viewport, because the developer's
  viewport was large enough that the toolbar _did not eat into the
  aspect ratio_ yet. The user's viewport, when they ran the build
  later, was smaller. The shipped tests did not catch the bug
  because none of them asserted a board size.
- **Phase 63's hotfix asserted a non-zero board.** It did not
  assert that the board was in the right _column_. The hotfix test
  was a presence check ("the board is there"), not a placement check
  ("the board is in the cell whose width is the largest available").
- **Phase 65's e2e and unit tests did not exercise the grid at
  all.** The board-column assertion in `window-chrome.spec.ts` was
  for the Mac sidebar's brand mark, not the board. There was no
  test for "the board frame is in row 2 col 2". When Phase 65
  shipped, the unit suite was green, the e2e suite was green, and
  the board was still 24 × 24.
- **Phase 66's fix was a layout guess, not a measurement.** I added
  an explicit height to the grid, but I did not add a test that
  asserted `gridHeight === frameSize + TOOLBAR_HEIGHT` or
  `aspect-square board width === 1fr column width`. I checked
  the live HTML by curl, saw `width: 354 px`, and called it done.
  The board was 320 × 320 again, but 28 px shorter than it could
  have been.

## Why the bug existed at all

The analyse-affordance was on the board because someone (Phase 56)
wanted engine feedback to be visible on the board surface itself,
not only in a right rail that the user could collapse. That is a
reasonable design choice. The mistake was to put it in a _separate
row_ of the grid rather than overlaying it on top of the board
frame. A grid is a layout tool; a floating button is a _positioning_
tool, and mixing them inside the same cell-tracking system means
that adding or removing one cell can move every other cell.

## The rules, written so they do not need a meeting

1. **The board frame is the chessboard.** Anything inside the board
   frame (`data-board-frame`) is over a square. Any control that is
   not the chessboard itself goes _outside_ the board frame.
2. **The toolbar is gone.** The Analyse button lives in the engine
   panel. If a future feature needs a control above or below the
   board, it sits in a sibling of the BoardSurface, not in a row of
   the board's grid.
3. **The board grid has one cell.** When the eval bar is on, the
   grid is `eval-bar | board`, two columns, one row. There is no
   third row, no third column, no overlay that lives inside the
   grid. The toolbar overlay is not in the grid.
4. **`grid-template-rows` is a layout declaration; it requires a
   height.** `auto 1fr` only resolves if the grid itself has a
   definite height. If a future change needs the grid to grow with
   its content, it grows the _BoardSurface_ container, not the
   grid.
5. **Every layout change ships a test.** A change that touches
   `CanonicalBoardSurface.tsx` adds a unit test that asserts the
   board frame's effective bounding box (row, column, width, height)
   for at least one configuration. A change that touches the Mac
   title bar adds an e2e test that asserts the brand mark's left
   edge. The shipped tests caught one of these regressions at the
   time (the eval-bar row-collapse in Phase 62 / 63); the shipped
   tests did not catch the column placement in Phase 65 or the row
   height in Phase 66. Those are now in the test suite.
6. **The board is in `frameSize × frameSize`, every time.** The
   `frameSize` value drives the grid's width and (now) height, the
   board frame's `aspect-square`, the eval bar's column count and
   the resize observer's ceiling. Any future feature that wants the
   board to be a different size for a different mode (e.g. a focus
   mode that drops the eval bar and grows the board) does so by
   adding a new mode to the same constants, not by introducing a
   second grid.

## What the test suite asserts now

`CanonicalBoardSurface.test.tsx` (new):

- When `evaluationBarVisible` is true, the grid's
  `gridTemplateColumns` is `24px minmax(0, 1fr)`, the toolbar is
  `grid-row: 1; grid-column: 1 / -1`, the eval bar is in row 2 col
  1, and the board frame is in row 2 col 2.
- When `evaluationBarVisible` is false, the grid has a single
  column, the toolbar is row 1, the board frame is row 2 col 1.
- The grid's height is `frameSize + TOOLBAR_HEIGHT` for any
  non-zero `frameSize`.
- The board frame's `width` and `height` are equal, in pixels,
  equal to `frameSize` (modulo the eval-bar subtraction in
  `clientWidth - barSpace`).

These assertions are written in `jsdom` against the rendered DOM
attributes, not against computed styles, because the production CSS
is the system under test and asserting on attributes catches the
class-name and style bugs that computed-style assertions miss.

## What changed in the shipped code

- `src/features/workspace/CanonicalBoardSurface.tsx`:
  - The grid is `grid-rows: 28px 1fr` with an explicit
    `height: frameSize + TOOLBAR_HEIGHT`.
  - The toolbar and the board frame declare `grid-row` and
    `grid-column` inline; `grid-auto-flow` no longer decides
    placement.
  - The resize observer subtracts `TOOLBAR_HEIGHT` from
    `clientHeight` before computing `frameSize`, so the grid never
    overflows its parent.
  - The toolbar is gone. The board surface is one board frame plus
    an optional eval bar, and nothing else.
- `src/components/icons.tsx`: the `Recall` icon is redrawn as a
  recognisable chess knight (head, muzzle, ear, eye, mane, base) at
  every size the sidebar uses. The previous draw was a closed
  17-point polygon that did not read as a knight at any size.
- `src/features/workspace/BoardEngineAffordance.tsx`: kept as a
  component but no longer mounted on the board. The engine panel's
  own "Analyse this position" button is the single source of truth.
- `src/features/engine/EnginePanel.tsx`: the Analyse button in the
  empty state is the only Analyse button on the screen when the
  engine is off. The status badge carries engine state while it is
  running, and the StatusBar at the bottom of the window carries
  it everywhere else.
- `docs/product/platform-parity.md`: Phase 67 records the
  Mac-desktop delta. The Mac release for this work is **1.2.0**.

## What this document is _not_

It is not a complaint about the people who shipped Phase 62. Phase
62 made the right call — the analyse-affordance-overlapped-the-rook
problem was real, and the fix was correct in spirit. It is not a
defence of the four follow-up phases. Each one of them made the
right narrow change for the bug it could see, and that is exactly
the failure mode this document warns about: a layout that needs four
narrow fixes is a layout that needs a rewrite.

The rewrite is in `CanonicalBoardSurface.tsx` now. The postmortem is
this file. The test is `CanonicalBoardSurface.test.tsx`. If a future
agent has to add a row above the board again, the test will fail and
this file will be the first thing they read.
