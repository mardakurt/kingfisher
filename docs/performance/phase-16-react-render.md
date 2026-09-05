# What the workspace actually re-renders

Measured on 5 September 2026 against the running application, not inferred from
the code. The question Phase 16 asks is narrow and worth asking plainly: when
the engine is thinking, or the Explorer answers, does anything redraw that had
no reason to?

## How this was measured

A `MutationObserver` on three regions of the live page — the 64 board squares,
the 32-piece layer, and the engine panel — counting DOM mutations, plus a
`PerformanceObserver` on `longtask`. DOM mutation is the right unit here: React
may re-render a component and produce no DOM change at all, and it is the DOM
change that costs layout, paint and a dropped frame. Long tasks catch the
reconciliation cost that never reaches the DOM.

Viewport 1440×900, development server, engine Stockfish 17.1 Lite WASM at
MultiPV 3.

## Engine ticks

The engine emits `info` roughly every 90 ms and the panel shows depth, nodes,
nps and three principal variations. Over **10 seconds of continuous analysis**:

| Region          | Mutations |
| --------------- | --------: |
| Board squares   |     **0** |
| Piece layer     |     **0** |
| Left navigation |     **0** |
| Engine panel    |       286 |

Long tasks in that window: **3, totalling 210 ms** — 2.1% of the wall clock.
Idle baseline over 6 seconds with the engine off: 0 mutations anywhere, 0 long
tasks.

**An engine tick does not touch the board.** The evaluation bar, which does have
to move, is a sibling of the board rather than part of it, so a changing score
does not invalidate 64 squares and 32 pieces to redraw one bar.

## Explorer and tool switching

Switching the dock from Engine to Explorer, which issues a fresh Explorer query
for the current position:

| Region         | Mutations |
| -------------- | --------: |
| Board squares  |     **0** |
| Piece layer    |     **0** |
| Explorer panel |         4 |

First panel update **48 ms** after the click. The board is not re-rendered by a
tool changing beside it, which is the property that matters: the board is the
one thing on screen that must never flicker.

## Board interaction

Playing a move (select, then destination) with the engine running:

| Measurement           |     Value |
| --------------------- | --------: |
| First piece mutation  | **31 ms** |
| Settled               |     74 ms |
| Piece-layer mutations |         3 |
| Square mutations      |         2 |

Three mutations to move a pawn: the piece that moved, and the two squares that
changed highlight. Not a re-render of the board.

## What was optimised

**Nothing.** The isolation Phase 16 set out to check is already there, and the
measured cost of an engine tick on everything that is not the engine panel is
zero mutations and no long task attributable to it. Adding `memo()` here would
have been ritual rather than repair.

Two things in the code look like they should cause the problem and do not, which
is worth writing down so a future reader does not "fix" them:

- `CanonicalBoardSurface` subscribes to `state.primary.analysis`,
  `analysedFen` and `running`, so it _does_ re-render on every engine tick. It
  re-renders to a DOM that is identical except for the evaluation bar, so the
  cost is reconciliation of a small tree and nothing else. The measurement above
  is what says that is acceptable; the subscription is not.
- 31 `usePreferences()` calls subscribe to the whole preferences store. Most are
  inside `SettingsDialog`, which is a modal — re-rendering a dialog while its own
  settings change is the intended behaviour, not a leak.

## What this does not measure

- A production build. This is the development server, which is slower and
  carries React's development-mode checks; the numbers are therefore an upper
  bound on the shipped cost, not a description of it.
- Routes other than `/analysis`. The dock, the board and the engine are shared,
  so the isolation result carries; the specific counts do not.
- Very large move trees. `e2e/phase8.spec.ts` covers a 20,000-node tree
  separately, and reported 126 ms for End/Home/Right navigation in the run that
  accompanied this measurement.
