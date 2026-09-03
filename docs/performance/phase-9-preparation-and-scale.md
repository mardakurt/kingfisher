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

## 6. The 500,000-game experiment

Run, rather than estimated. `npm run bench:sqlite -- 500000` against a running
companion: 500,000 games, 5,251,428 indexed positions, a 1.2 GB SQLite file.

| Query                                 | 100,000 | 500,000  | Ratio |
| ------------------------------------- | ------- | -------- | ----- |
| opening aggregation (common position) | 0.3 ms  | 0.3 ms   | flat  |
| opening aggregation (deep position)   | 0.2 ms  | 0.3 ms   | flat  |
| paged list (100 rows)                 | 0.7 ms  | 0.6 ms   | flat  |
| page 20 deep (offset 2,000)           | 0.6 ms  | 0.8 ms   | flat  |
| player search                         | 12.8 ms | 67.4 ms  | 5.3×  |
| player prefix lookup                  | 16.6 ms | 95.0 ms  | 5.7×  |
| games at position                     | 18.6 ms | 104.7 ms | 5.6×  |
| text search                           | 26.0 ms | 140.6 ms | 5.4×  |
| import through the companion          | 24.1 s  | 179.8 s  | 7.5×  |
| database file                         | 272 MB  | 1.2 GB   | 4.4×  |

**What holds.** The derived-aggregate paths are flat across a fivefold increase
— which is the Phase 7 architecture doing exactly what ADR 0023 claimed, and
the claim is now tested at five times the size it was designed against. The
opening explorer, which is what a player touches on every move, does not notice
the difference between 100,000 games and half a million.

**What does not.** Everything answered by a normalized scan is linear, and at
500,000 games that puts four routine operations between 67 ms and 141 ms, with
worst cases far higher: text search peaked at 1.6 s and the un-aggregated
opening scan at 6.9 s. Those are noticeable. They are not broken, and they are
the paths a player uses occasionally rather than constantly, but a collection
of this size is past the point where they feel instant.

**Import is slightly superlinear** — 7.5× the time for 5× the games — which is
what B-tree depth on growing indexes costs. Three minutes for half a million
games is acceptable for something started once and walked away from.

**Honest conclusion.** Kingfisher works at 500,000 games and the explorer stays
instant there. The measured envelope is now 500,000 for SQLite rather than
100,000, with the caveat that player and text search are an order of magnitude
slower than at 100,000 and would need the same aggregate treatment the explorer
got before a million-game archive would be comfortable. Nothing here is
extrapolated past what was run: a million games was not tested and is not
claimed.

## 7. What was not measured

**Local tablebase probe latency**, because measuring it would measure a
third-party local server rather than Kingfisher. The directory scan that
decides whether to use one is a single `readdir`.
