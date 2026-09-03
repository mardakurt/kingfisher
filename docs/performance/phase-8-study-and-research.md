# Phase 8 measurements and performance budgets

Phase 7 made Kingfisher fast enough for daily work. Phase 8 asked a different
question — does it help a strong player improve — and answered the measured
bottlenecks Phase 7 named but did not fix. Everything here is a real number
from this machine, with the before-figure taken the same way.

## Environment

```
Apple silicon (darwin-arm64), Node v24.14.0
Chrome via Playwright for the browser figures
Companion started with `npm run companion`, SQLite through node:sqlite
Medians over twenty runs; the worst case reported separately
```

## Reproducing all of it

```bash
npm run benchmark
```

runs the PGN parser benchmark, the aggregate-scaling benchmark, the new
rules-engine feasibility experiment, the evidence-packet benchmark and the
deterministic performance unit tests, and adds the route bundle report when a
build is present. The companion HTTP suite is separate because it needs a
running companion and a token:

```bash
npm run companion
KINGFISHER_COMPANION_TOKEN=<token from the pairing URL> npm run bench:sqlite -- 100000
```

| Command                    | What it measures                                     |
| -------------------------- | ---------------------------------------------------- |
| `npm run bench:aggregates` | Filtered explorer, structure search, SQLite deletion |
| `npm run bench:rules`      | The rules-engine replacement experiment (ADR 0028)   |
| `npm run bench:sqlite`     | Companion import and every query, over real HTTP     |
| `npm run bench:pgn`        | PGN parse throughput, browser-equivalent code        |
| `npm run bundle:report`    | Per-route initial JavaScript from a production build |

---

## 1. The filtered opening explorer

Phase 7's ADR 0023 made the _unfiltered_ explorer instant and stated plainly
that filtered queries still paid the normalized scan — 132 ms at 100,000
games, the slowest routine database interaction left in the product.

Phase 8 measured the filters that opening preparation actually uses, then
answered them from exact `(move, year, rating, result)` cells (ADR 0026).
`npm run bench:aggregates -- 100000`, on 100,000 games and 1,000,000 indexed
positions, at the position every game reaches:

| Query                       | Phase 7 | Phase 8 median | worst   |
| --------------------------- | ------- | -------------- | ------- |
| last 12 months              | ~132 ms | **0.4 ms**     | 0.5 ms  |
| last 3 years                | ~132 ms | **0.7 ms**     | 0.8 ms  |
| Elo ≥ 2400                  | ~132 ms | **2.7 ms**     | 2.8 ms  |
| Elo ≥ 2500                  | ~132 ms | **1.9 ms**     | 12.8 ms |
| Elo ≥ 2600                  | ~132 ms | **1.1 ms**     | 1.2 ms  |
| date + Elo together         | ~132 ms | **0.7 ms**     | 0.7 ms  |
| unfiltered (for comparison) | 0.3 ms  | 0.0 ms         | 0.2 ms  |

The Phase 8 target was a common filtered query under 50 ms median. It is met
by two orders of magnitude on every filter measured.

### What it cost

The first filtered query at a position builds its cells: **281 ms, once**. That
is the same work the scan used to do on every query, done once instead of every
time, and it is not hidden — a position is either in the 128-entry window or it
pays this again.

A player-name filter is deliberately excluded and still takes the normalized
path, because a cell per player would be a copy of the collection. It is fast
anyway: player search measures 12.6 ms median at 100,000 games.

### Exactness

No result here is a bucket. The equivalence that guarantees it is asserted
directly in the companion test suite: a filter that excludes nothing returns
exactly what the unfiltered explorer returns, including for a game that repeats
a position. See ADR 0026 for why that invariant is what makes the three
counting paths agree.

---

## 2. Structure search

New in Phase 8, so there is no before-figure — only the shape of the fixture,
which is chosen to be unflattering: 100,000 games where the searched pawn
skeleton occurs in _every one of them_, so the query matches 100,000 rows and
returns 30.

| Query                          | median      | worst   |
| ------------------------------ | ----------- | ------- |
| same pawn skeleton, 100k games | **33.0 ms** | 35.0 ms |

The first implementation measured 151.7 ms. The cost was a `GROUP BY` over
every match in a join that is already one-to-one on the game id, which bought
nothing and forced a temporary b-tree over all 100,000 rows. Removing it is
the whole difference.

---

## 3. SQLite deletion

Phase 7 named this a limitation rather than a measurement: SQLite collections
could only grow from the UI. Deleting 1,000 games from a 100,000-game
collection, including the derived-row rebuild and the integrity check:

| Step                                    | first attempt | shipped      |
| --------------------------------------- | ------------- | ------------ |
| delete 1,000 games + rebuild aggregates | 1,650.9 ms    | **198.7 ms** |
| aggregates consistent afterwards        | yes           | yes          |

The first attempt suspended the per-row delete trigger — which re-aggregates a
whole `(position, move)` group for _every_ cascaded row — and rebuilt every
derived row instead. Correct, but it reads the entire collection to delete a
hundredth of it. The shipped version collects the affected position keys before
deleting and rebuilds only those, which is the same correctness for an eighth
of the time.

---

## 4. The 20,000-node move tree

Phase 7 measured 1,000 nodes, found it comfortable and deliberately did not
virtualize. Phase 8 built the case first (ADR 0027). Measured in Chrome on a
20,000-node study with 2,000 branches and periodic comments:

| Step                               | measured |
| ---------------------------------- | -------- |
| create and save the chapter        | 61 ms    |
| reload and render                  | 213 ms   |
| `End`, `Home`, `→` in sequence     | 177 ms   |
| list items mounted, of 20,000 rows | < 100    |

Virtualization was necessary and was adopted. Nested variations, variable-height
comments, branch connectors, context menus and keyboard navigation all survive
it; keyboard navigation operates on the flattened order rather than on mounted
DOM, which is the property that decides whether a large tree is usable at all.

---

## 5. The rules-engine experiment

`npm run bench:rules`, 20,000 deterministic games:

```
Kingfisher tree parser       7,300.5 ms
direct chess.js main lines   2,729.1 ms
practical speed ratio             2.68x
```

Every rules fixture passed — legal moves, SAN in both directions, castling, en
passant, promotion, check and mate, FEN round-trip. The semantic PGN contract
did not: the direct path preserves no variations, comments, NAGs or recovery
provenance.

**Rejected.** The 2.68x is bought by discarding the tree, so it is not 2.68x on
the same work. chess.js stays and the `Position` boundary is unchanged. ADR
0028 records the full result, and the experiment ships inside the benchmark
group so the conclusion can be re-measured rather than remembered.

---

## 6. The explorer cache ceiling

`gcTime` expires cache entries by age, which does not bound an afternoon of
steady navigation: 500 positions leave 500 entries. Explorer history is now
trimmed to 256 inactive entries.

The unit test proves the trimming rule; the browser test proves the running
application applies it, by pushing the real query client past the ceiling and
reading what survived. That distinction is not academic — it is what caught the
bug. Sorting eviction candidates by `dataUpdatedAt` ranked a _prefetch in
flight_ (`dataUpdatedAt: 0`, no observers) as the oldest entry in the cache and
evicted it, which once the cache filled would have silently disabled Explorer
prefetching for the rest of the session with nothing on screen looking wrong.

| After 600 positions in one session | measured |
| ---------------------------------- | -------- |
| explorer cache entries             | ≤ 256    |
| most recent position still cached  | yes      |
| persistence caches evicted         | none     |

---

## 7. What Phase 8 made slower

Structure indexing runs for every indexed position at import, and it is the
dominant new cost. `npm run bench:sqlite -- 100000`, through the companion's
real HTTP surface:

| 100,000 games into SQLite    | Phase 7 | Phase 8    |
| ---------------------------- | ------- | ---------- |
| insert through the companion | 15.9 s  | **28.1 s** |
| throughput                   | 6,282/s | 3,555/s    |
| database file                | ~180 MB | ~272 MB    |

Isolating the cause: indexing 210,319 positions costs 2,345 ms with structure
facts against 51 ms for the position-key walk alone. Sharing one FEN parse
across `positionKey`, the skeleton key and the facts, and moving the work after
the deduplication check, took that from 2,644 ms — the rest is
`positionFeatures` itself, which walks the board several times per position.

This is a real regression on a one-time, backgroundable, cancellable operation,
in exchange for research that did not previously exist. For a player importing
their own few thousand games it is under a second. For a 100,000-game archive
it is twelve seconds of a half-minute import. It is stated here rather than
rounded away, and the remaining lever is named in Known Limitations.

Everything else measured flat against Phase 7:

| Query at 100,000 games                | Phase 7 | Phase 8 |
| ------------------------------------- | ------- | ------- |
| paged list (100 rows)                 | 0.6 ms  | 0.6 ms  |
| page 20 deep (offset 2,000)           | 0.6 ms  | 0.6 ms  |
| text search                           | 25.5 ms | 25.2 ms |
| player search                         | 12.9 ms | 12.6 ms |
| player prefix lookup                  | 16.7 ms | 16.2 ms |
| games at position                     | 17.9 ms | 17.8 ms |
| opening aggregation (common position) | 0.3 ms  | 0.3 ms  |

---

## 8. Bundles

`npm run bundle:report` against a production build:

| Route       | scripts | raw      | gzip     |
| ----------- | ------- | -------- | -------- |
| /review     | 19      | 967.8 kB | 299.8 kB |
| /repertoire | 18      | 944.1 kB | 292.3 kB |
| /studies    | 18      | 940.1 kB | 292.0 kB |
| /training   | 18      | 932.0 kB | 288.9 kB |
| /analysis   | 18      | 931.5 kB | 289.7 kB |
| /openings   | 17      | 921.5 kB | 286.1 kB |
| /games      | 16      | 872.0 kB | 271.3 kB |
| /databases  | 16      | 864.9 kB | 268.8 kB |
| /recent     | 16      | 862.5 kB | 268.3 kB |
| /database   | 9       | 584.9 kB | 179.9 kB |
| /           | 9       | 584.9 kB | 179.9 kB |

`/review` is the heaviest route at 299.8 kB gzipped, which is what a workspace
carrying a board, a move tree, a journal and the whole tool dock costs. Total
client JavaScript emitted, including every lazily loaded chunk: 1,443.5 kB
across 63 files.
