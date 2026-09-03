# Phase 9 measurements

Phase 9 is chess-first, so most of it added workflows rather than removing
milliseconds. Two things still needed measuring: whether the new workflows are
fast enough to use while somebody is waiting, and whether the structure-indexing
cost Phase 8 recorded as a regression could be taken back.

Both were, and one of the new workflows turned out to be far too slow before it
was measured.

## Environment

```
Apple silicon (darwin-arm64), Node v24.14.0
Chrome via Playwright for the browser figures
Companion started with `npm run companion`, SQLite through node:sqlite
Medians over the run counts stated; the fixtures are the deterministic
generator every other benchmark uses
```

## Reproducing it

```bash
npm run bench:preparation
```

measures every Phase 9 workflow path. The full group:

```bash
npm run benchmark
```

and, for the companion figures, with a companion running:

```bash
KINGFISHER_COMPANION_TOKEN=<token> npm run bench:sqlite -- 100000
```

---

## 1. The transposition graph — the one that was too slow

Listing the prepared move orders that reach a position renders in a panel that
re-renders whenever the board moves. On the small repertoire the corpus
produces it looked fine. On a realistic one it was not.

The benchmark builds a repertoire by branching through the real rules to 2,639
positions, because the deterministic corpus has too few distinct openings to
measure scaling with.

| 2,639-position repertoire | Before     | After      |
| ------------------------- | ---------- | ---------- |
| routes to one position    | 1,118.9 ms | **53 ms**  |
| convergence points        | 255.1 ms   | **1.6 ms** |

Three fixes, in descending order of what they bought.

**The graph was rebuilt on every call.** Building it costs one `advanceSan` per
stored move — roughly eight thousand rules-engine calls for a repertoire this
size — and both public functions need it. Memoizing on the positions array
means a repertoire loaded once from the query cache builds its graph once; one
that changed gets a new array and therefore a new graph. This is the whole of
the convergence improvement.

**The search copied a path per queue entry.** First a `Set`, then an array,
copied once per expansion — which is what a breadth-first walk does tens of
thousands of times in a branching graph. Parent pointers cost one small object
per expansion and rebuild a path only for the entries that turn out to be
routes.

**The search is now bounded.** Looking for a deep position in a branching graph
can expand an enormous number of paths before finding twelve. The budget is
reported through the `truncated` flag the panel already renders, so giving up
is visible rather than silent.

## 2. The rest of the Phase 9 workflows

`npm run bench:preparation`, 20,000 games all played by one opponent — the
worst case for a dossier, since every game is in the sample.

| Path                                  | Median |
| ------------------------------------- | ------ |
| opponent dossier                      | 4.6 ms |
| recent versus historical              | 0.4 ms |
| move-order fingerprints               | 2.9 ms |
| theory radar over three windows       | 0.0 ms |
| evaluation calibration, 2,000 records | 0.1 ms |
| candidate coverage, 2,000 records     | 0.1 ms |
| divergence clusters, 2,000 records    | 0.3 ms |

The radar's own cost is nil because the work is three database queries the
explorer already knows how to make; what it adds is arithmetic over thirty
rows. The measurement that matters for it is the underlying filtered explorer,
which Phase 8 took to 0.4–2.7 ms at 100,000 games.

## 3. Taking back Phase 8's import regression

Phase 8 recorded structure indexing as a real regression and named the lever:
pawn structure and file state depend only on where the pawns are, and roughly
half the moves in a game do not move a pawn.

Profiling confirmed it before anything was changed. Over 41,748 positions:

```
parseFen                     62 ms
positionFeatures            300 ms      <- 62% of the pipeline
pawnSkeletonKeyFromParts     59 ms
structureFactsFromFeatures   39 ms
structureSignature           10 ms
structureClaims              13 ms
```

So `pawnFeatures` was split out of `positionFeatures` and memoized by pawn
skeleton. Sharing that memo across an import rather than scoping it per game is
most of the win, because openings repeat heavily across an archive:

| Indexing 210,319 positions     | Time         |
| ------------------------------ | ------------ |
| Phase 8 baseline               | 2,644 ms     |
| one FEN parse instead of three | 2,345 ms     |
| memo per game                  | 2,169 ms     |
| memo shared across the import  | **1,464 ms** |

The split changes no output, and a test asserts exactly that: supplying
pre-computed pawn features must produce what computing them inline produces.

At the HTTP level, importing 100,000 games into SQLite:

| 100,000 games into SQLite    | Phase 7 | Phase 8 | Phase 9    |
| ---------------------------- | ------- | ------- | ---------- |
| insert through the companion | 15.9 s  | 28.1 s  | **24.1 s** |
| throughput                   | 6,282/s | 3,555/s | 4,157/s    |

Honest reading: Phase 9 gave back about a third of what Phase 8 cost, and the
import is still slower than Phase 7's. The remaining gap is the wider position
rows — a stored FEN, skeleton, signature and claim list per indexed position —
which is the price of structural search existing at all, and is paid once per
import rather than on every query.

## 4. Backfilling an existing collection

Collections imported before Phase 8 carried no structural identity and matched
nothing. They can now be indexed in place, without re-importing a game.

The loop works from the canonical position key — placement, side to move,
castling and en passant are everything structure depends on, and move counters
cannot affect a pawn skeleton — and per _distinct position_ rather than per
row, so a popular opening position appearing in tens of thousands of rows is
computed once and the write fans out.

It is resumable and idempotent: each page is a transaction, the update only
touches rows that still have nothing, and cancelling keeps every page already
committed.

## 5. Everything else, unchanged

`npm run bench:sqlite -- 100000`, against Phase 8's figures:

| Query at 100,000 games                | Phase 8 | Phase 9 |
| ------------------------------------- | ------- | ------- |
| paged list (100 rows)                 | 0.6 ms  | 0.7 ms  |
| page 20 deep (offset 2,000)           | 0.6 ms  | 0.6 ms  |
| text search                           | 25.2 ms | 26.0 ms |
| player search                         | 12.6 ms | 12.8 ms |
| player prefix lookup                  | 16.2 ms | 16.6 ms |
| games at position                     | 17.8 ms | 18.6 ms |
| opening aggregation (common position) | 0.3 ms  | 0.3 ms  |

## 6. What was not measured

**The 500,000-game architecture experiment** described in the Phase 9 brief was
not run. It is a genuine gap and is recorded as one rather than estimated: the
100,000-game fixture takes about half an hour end to end on this machine and
produces a 272 MB file, and a 500,000-game run would need several hours and
well over a gigabyte. Nothing in the results above extrapolates to that scale,
and this document does not claim it does.

What _can_ be said from the measurements that exist: the paths whose cost grows
with collection size are the normalized scans — text search at 26 ms and player
search at 13 ms per 100,000 games — while the explorer paths are answered from
derived tables whose cost tracks moves at a position rather than games in the
collection, and did not move between 10,000 and 100,000 games.

**Local tablebase probe latency** was not measured, because measuring it would
measure a third-party local server rather than Kingfisher. The directory scan
that decides whether to use one is a single `readdir`.
