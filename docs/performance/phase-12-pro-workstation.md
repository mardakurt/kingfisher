# Phase 12 — what closing the last four gaps cost

Phase 12 added the four capabilities the Phase 11 gap analysis called genuine
competitive losses — cross-database management, player profiles, opening
classification, and local Syzygy probing without a user-managed server — and
finished the reliability work Phase 11 deferred.

Every figure below is measured, not estimated. Reproduce with `npm run
benchmark`, `npm run bench:collections -- 100000` and `npm run bundle:report`.
Environment: node v24.14.0, darwin-arm64, Apple silicon.

## Bundles

| Route           | Phase 11              | Phase 12              | Change      |
| --------------- | --------------------- | --------------------- | ----------- |
| Heaviest route  | `/review` 330.7 kB gz | `/review` 335.7 kB gz | **+5.0 kB** |
| Scripts on it   | 21                    | 21                    | 0           |
| `/analysis`     | 317.9 kB gz           | 322.9 kB gz           | +5.0 kB     |
| `/databases`    | 297.2 kB gz¹          | 310.1 kB gz           | +12.9 kB    |
| Total client JS | 1,829.9 kB / 83 files | 2,500.4 kB / 90 files | +670.5 kB   |

¹ Measured mid-phase, after classification and before the database control
centre; there is no Phase 11 figure for this route on its own.

The interesting number is the last one, and it is almost entirely one file.
**The opening index is 487 kB of source, 78 kB gzipped, and is in none of the
route bundles.** It is a dynamic `import()` and Turbopack gives it its own
chunk, fetched the first time something asks what opening a position is. The
`+5.0 kB` on every board-bearing route is the classifier and the hook that
consults it, not the data.

`/databases` grew most because it grew most: it went from a provider inspector
to a control centre with a transfer dialog, a federated search panel, a
duplicate resolver and a per-collection game list.

**No runtime dependency has been added since Phase 7.** Fathom is C, fetched by
`npm run tablebase:install` and compiled into a companion-side executable; it is
not in `package.json` and cannot be in a bundle.

## Opening classification

| Measurement                                  | Value                     |
| -------------------------------------------- | ------------------------- |
| Dataset entries                              | 3,810 named positions     |
| Positions after keying by canonical identity | 3,810 (no collisions)     |
| Dataset lines the rules engine rejected      | 0                         |
| Deepest named line                           | 36 plies                  |
| Generated index                              | 487 kB raw, 78 kB gzipped |
| Lookup                                       | one hash lookup per ply   |
| Classification during import                 | no measurable change²     |

² Import throughput is dominated by parsing and position extraction. Classifying
adds at most 36 hash lookups per game, inside the pass that already holds the
tree, and the change is inside the run-to-run noise of the PGN benchmark.

Backfill over an existing collection is bounded by reads, not by classification:
at 100,000 games a page of 500 games with their position keys comes back in
**12 ms**, and the "is there anything left to do" scan is **51 ms**.

## Collection operations at 100,000 games

`npm run bench:collections -- 100000`, in process against the real SQLite class.
The source collection is 622 MB on disk.

| Operation                                    | Time       | Rate         |
| -------------------------------------------- | ---------- | ------------ |
| Import 100,000 games (baseline)              | 40.4 s     | 2,476 /s     |
| **Copy 100,000 games to another collection** | **51.6 s** | **1,940 /s** |
| **Merge preview** (exact overlap)            | **452 ms** | 221,091 /s   |
| **Duplicate search** across 200,000 games    | **727 ms** | 274,989 /s   |
| Classification backfill scan                 | 51 ms      | —            |
| Backfill page of 500 games                   | 12 ms      | —            |
| **Player aggregate** (13,284 games)          | **22 ms**  | —            |

The merge preview is the one worth dwelling on. It counts the _exact_ overlap
between two hundred-thousand-game collections in under half a second, which is
what makes "68,893 new games" a number the dialog can show before anything is
written rather than an estimate.

### The one that was wrong

A move deleted once per read page, and the benchmark found what that costs:

| Delete batch | Time     | Per game     |
| ------------ | -------- | ------------ |
| 200          | 4,799 ms | **24.00 ms** |
| 2,000        | 3,843 ms | **1.92 ms**  |

Deletion cost is dominated by a fixed per-call price — the collection rebuilds
its explorer aggregates for every position the removed games touched — not by
the number of games. A whole-collection move would have spent forty minutes
deleting what it took ten minutes to copy.

`moveGames` now buffers verified fingerprints and deletes in batches of 2,000.
This does not weaken the safety invariant: nothing is deleted before the
destination confirms it, and buffering only widens the window in which a game
exists in _both_ collections, which is the safe direction. A cancel flushes what
is already confirmed, so the source never keeps games the run reported as moved.

The same measurement on a 50,000-game collection, which is where the effect was
first isolated: 13.04 ms/game at 200, 1.19 ms at 1,000, 0.26 ms at 5,000.

## Local Syzygy

| Measurement                | Value                                   |
| -------------------------- | --------------------------------------- |
| Helper source              | Fathom `c9c6fef` (MIT) + 260 lines of C |
| Build                      | one `cc` invocation, under two seconds  |
| Binary                     | ~130 kB                                 |
| `tb_init` on a 3-piece set | under 20 ms                             |
| Probe (warm, 3-piece)      | under 1 ms per position                 |

The helper is long-lived precisely because `tb_init` memory-maps the files:
paying that per move would make walking an endgame unusable. Probes are
serialised behind one queue, which costs nothing at these rates and is what
keeps an answer matched to its question.

Correctness was checked against known results rather than asserted — a rook
against a bare king is won (DTZ 29) and the rook cannot be dropped on the king's
file; a knight against a bare king is drawn; the opposition decides king and
pawn against king. Fifteen live tests run the real binary when
`KINGFISHER_TEST_SYZYGY` points at a directory of tables.

## Soak

Ten cycles of the full workstation — engine on and off, every route, the
workspace composer, the database control centre and the player profile — in one
document, with the constructors instrumented before the app loads:

| Resource               | After 10 cycles |
| ---------------------- | --------------- |
| Workers                | 1               |
| BroadcastChannels      | 0 net growth    |
| EventSources           | 0 net growth    |
| Intervals              | 0               |
| Window listeners       | 16              |
| **ResizeObservers**    | **1**           |
| Heap (diagnostic only) | 61–85 MB        |

`ResizeObserver` is new to this list and is the one that would leak silently: an
observer still attached to a removed element keeps that element's whole React
subtree alive, and nothing about the running application looks wrong.

Heap is recorded and never gated. Chromium's `performance.memory` moves with
when the collector last ran, so a threshold on it would be a flaky test rather
than a memory guard.

## Test suite

| Suite                    | Phase 11 | Phase 12 | Notes                                   |
| ------------------------ | -------- | -------- | --------------------------------------- |
| Unit / integration tests | 1,096    | 1,405    | +309 (plus 11 skipped without tables)   |
| Unit test files          | 85       | 97       | +12                                     |
| Unit suite wall time     | ~3.9 s   | ~4.0 s   | +0.1 s                                  |
| Playwright tests         | 72       | 121      | +49, at **zero retries**                |
| Playwright files         | 9        | 12       | +3 (chaos, accessibility, visual)       |
| Playwright wall time     | 5.4 min  | 6.2 min  | Full local run, one worker, real engine |

The 11 skipped unit tests are the live Syzygy probes, which need a tablebase
directory. They are skipped with a stated reason rather than passing silently.

Of the new unit tests, 129 are the configuration wiring audit: structural checks
that every preference has a reader, every workspace tool has a renderer, every
documented shortcut has a handler, every store has a consumer, and every
settings-index entry describes a control that exists.

## What the new suites found

Reliability work is only worth the time if it finds things. It found five:

1. **The notes field had no accessible name.** A placeholder is announced only
   while a field is empty, so it went nameless the moment somebody typed a note.
2. **The command palette's search input had no accessible name**, for the same
   reason.
3. **The settings search offered "Explorer source" and sent people to a section
   that did not contain it** — the control lived only in the explorer's own
   header, though the preference decides what three panels read.
4. **The rewritten Databases screen had dropped the browser storage summary**,
   caught by a Phase 7 test.
5. **It had also dropped per-game selection in a SQLite collection**, caught by
   a Phase 8 test. Restored, and the selection now drives Copy and Move as well
   as Delete.

Plus the move-deletion cost above, which no test would have found: only a clock
would.

## Honest limitations

**Visual baselines are macOS-only.** Chromium rasterises text differently on
macOS and Linux by far more than any tolerance that would still catch a moved
panel, so the suite skips loudly on a platform without committed baselines and a
guard test fails if none exist anywhere. A `workflow_dispatch` CI job generates
the Linux set; until those are committed, the visual suite guards local
development and not CI.

**Local Syzygy needs a C compiler at install time.** Most visibly on Windows.
`npm run tablebase:install` says so and exits without failing the install; the
remote provider keeps working and Settings explains which of the four possible
reasons applies.

**No million-game experiment was run.** The 100,000-game figures above are
measured; nothing here extrapolates from them.
