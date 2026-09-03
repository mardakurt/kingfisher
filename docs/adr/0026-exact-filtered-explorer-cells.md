# 0026. Exact year/rating cells for the filtered explorer, never buckets

Status: Accepted

## Context

ADR 0023 made the unfiltered explorer instant with a derived aggregate table,
and drew a line it refused to cross: an all-time reduction cannot answer "last
twelve months" or "Elo ≥ 2400", so any filtered query took the normalized scan
and paid for it. That scan was measured at 132 ms on 100,000 games, and it was
the slowest routine database interaction left in the product.

That number is worse than it looks. The filters in question are not exotic —
a recent window and a rating floor are what opening preparation _is_. Every one
of them made the explorer feel like a different, slower application than the
unfiltered one it sits next to.

The tempting fix is to precompute buckets: counts per year band and rating
band, answered by summing whole buckets. It is fast and it is wrong. A player
asking for Elo ≥ 2540 would receive the 2500 bucket's answer, labelled as
though it were theirs. Kingfisher would be stating a chess fact that is false,
which is the one thing it is built not to do.

## Decision

**Precompute cells, not buckets.** For a position, one row per distinct
`(move, year, rating, result)` combination with an exact count. A filter is
then answered by summing the cells that satisfy it — which is the same
arithmetic the scan performed, over far fewer rows. Every boundary lands
exactly where the scan put it, because the boundary is applied to the same
values.

**Build lazily, and bound it.** Cells are built for a position the first time
someone filters there, and the 128 most recently used positions are kept. A
research session touches tens of positions; a collection contains hundreds of
thousands. Precomputing all of them would multiply the file size to serve
queries nobody asked.

**The cache is derived state and is dropped, never patched.** An import clears
the cells for every position it touched; a deletion clears them for every
position it could have changed. Reconciling counts incrementally is exactly
where a derived table rots.

**One row per (game, position, move) is a schema invariant.** The three paths —
trigger-maintained aggregates, the normalized scan, and these cells — count
different things unless a game contributes at most one row per position and
move. The client indexer already collapsed repetitions; the companion enforces
it at its HTTP boundary too, so a game that repeats a position and repeats the
move cannot become two games in one path and one in another. A test asserts
the property that matters to a reader: a filter that excludes nothing returns
exactly what the unfiltered explorer returns.

**A player filter still scans.** A player name is high-cardinality; a cell per
player would be a copy of the collection. Player-filtered exploration keeps the
normalized path, and it is fast because a player's games are a small slice.

## Consequences

Measured on 100,000 games and a million indexed positions, on the position
every game reaches:

| query                     | before   | after            |
| ------------------------- | -------- | ---------------- |
| last 12 months            | ~132 ms  | 0.4 ms           |
| last 3 years              | ~132 ms  | 0.7 ms           |
| Elo ≥ 2400                | ~132 ms  | 2.7 ms           |
| Elo ≥ 2500                | ~132 ms  | 1.9 ms           |
| Elo ≥ 2600                | ~132 ms  | 1.1 ms           |
| date + Elo                | ~132 ms  | 0.7 ms           |
| first filter at a position | —       | 281 ms, one time |

The 281 ms is real and is paid once per position per session's worth of use.
It is the honest cost of the approach and is not hidden: it is the same work
the scan used to do on every query, done once instead of every time.

The cells add rows proportional to the distinct `(move, year, rating, result)`
combinations at 128 positions — bounded, and dropped when those positions leave
the window.

Two more representations of the same truth now exist, which is the same risk
ADR 0023 took on and answered the same way: the integrity report counts them,
the rebuild reconstructs them, and the companion test suite covers import,
delete and rebuild agreement.
