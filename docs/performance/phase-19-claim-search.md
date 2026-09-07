# Claim search on 11.3 million positions

Phase 18's first known limitation, closed and measured.

> **Claim search is still slow** — 2,312 ms on 11.3M positions, down from
> 3,399 ms. The new index helps and is not the answer; a claim-to-position
> table is, and it was out of scope.
>
> — Phase 18 handover, §25.1

## The collection

The same scale Phase 18 measured, rebuilt the same way: real over-the-board
games from the Lichess broadcast archives (CC BY-SA 4.0), imported through the
application's own path — `parsePgn → normalizeGame → classifyTree → indexGame →
insertGames` — on an Apple M3 Pro.

|                     |                |
| ------------------- | -------------- |
| Games               | **150,119**    |
| Indexed positions   | **11,303,059** |
| Distinct claim sets | **1,527,506**  |
| Distinct claims     | **3,109**      |
| Collection          | **4.96 GB**    |

Twelve claims were sampled log-spaced across the whole range of how often they
occur, from `theme:open-central-file` in 824,408 claim sets down to material
profiles in one. A single claim can be made to say anything — a rare one is
fast under every plan — so the distribution is the measurement.

`node scripts/bench-claim-search.mjs --db .real-scale/real.sqlite`

## Before

Both queries run against a read-only handle with none of this phase's tables or
indexes present, so nothing added since can be used by accident.

| Claim                       | Claim sets | Phase 18, sorted via `games` | Sorted on the position row |
| --------------------------- | ---------: | ---------------------------: | -------------------------: |
| `theme:open-central-file`   |    824,408 |                **11,242 ms** |               **2,364 ms** |
| `w-semi-b`                  |    250,608 |                     1,322 ms |                   1,093 ms |
| `w-backward-a`              |     41,664 |                       729 ms |                     703 ms |
| `islands-4-1`               |      1,603 |                       656 ms |                     652 ms |
| `mat-q-1b-1`                |        316 |                       647 ms |                     658 ms |
| … eight more, down to 1 set |            |                      ~636 ms |                    ~635 ms |
| **median**                  |            |                 **642.6 ms** |               **644.4 ms** |
| **worst**                   |            |              **11,241.9 ms** |             **2,363.6 ms** |

Two things are visible in that table and neither was obvious beforehand.

**There is a floor of about 640 ms that every claim pays**, however rare. It is
the `LIKE '%"open-d"%'` scan over all 1,527,506 claim sets: a leading wildcard
makes an index useless, so the scan happens whether the claim matches four
million positions or one.

**Sorting on the position row is worth 4.8× on the worst case by itself.**
`positions.rating_key` and `year_key` already hold the game's `max_rating` and
`year` — verified equal on every row rather than assumed — so ordering by them
removes a random read into `games` for every matched row, and leaves an
ordering an index can satisfy. That is half the change, isolated.

## After

Through `searchStructures`, the product's own entry point, across all three
orderings the panel offers.

|            |         cold |        warm |
| ---------- | -----------: | ----------: |
| **median** |   **0.9 ms** |  **0.4 ms** |
| p95        |      82.9 ms |     78.4 ms |
| **worst**  | **268.8 ms** | **78.8 ms** |

Per claim, at the default ordering:

| Claim                     | Claim sets |     cold |    warm |
| ------------------------- | ---------: | -------: | ------: |
| `theme:open-central-file` |    824,408 | 268.8 ms | 78.4 ms |
| `w-semi-b`                |    250,608 |  43.3 ms | 23.2 ms |
| `w-backward-a`            |     41,664 |   6.6 ms |  4.0 ms |
| `islands-4-1`             |      1,603 |  17.0 ms |  7.7 ms |
| `mat-q-1b-1`              |        316 |   6.6 ms |  2.4 ms |
| `mat-q-1n-1p-3`           |         43 |   0.8 ms |  0.4 ms |
| `mat-q-1b+1n+1p-6`        |          1 |   0.1 ms |  0.1 ms |

**Median 642.6 ms → 0.4 ms. Worst 11,241.9 ms → 78.8 ms.** Every claim in the
sample is interactive, which is the thing being claimed: not a headline ratio
but that no claim in the vocabulary is slow any more.

## What it cost

|                         |                                 |
| ----------------------- | ------------------------------- |
| Collection              | 4.96 GB → **5.49 GB**           |
| Added                   | **531 MB (10.7%)**              |
| Claim/set pairs indexed | **20,252,011**                  |
| Build                   | **313 s** (105 s on a warm run) |
| Opening the collection  | unchanged                       |

The 531 MB is `claim_set_members` plus two rank indexes. A claim-to-_position_
posting list — the obvious reading of "a claim-to-position index" — would have
been about 114 million rows and roughly 1.6 GB, which is nearly half of what
Phase 18's compaction had just saved. Indexing claim _sets_ instead is the same
answer for a seventh of the space, because 11.3 million positions carry only
1.5 million distinct claim sets.

## Three things this measurement found

**The default ordering forced the worst of both plans.** The ordered scan is
only cheap while the ORDER BY _is_ the index's order, and the relevance
ordering leads with three terms the rank index cannot express — so the scan was
forced _and_ every matched row was sorted afterwards. On the commonest claim
that was **74,351 ms against 312 ms**. The three leading terms are supplied by
separate passes now, and what the scan is asked for is exactly rating then
year. Asserted on the plan in `claim-index.test.mjs`, because both orderings
return the same rows and no correctness test can see the difference.

**The rank indexes must not be built when the collection is opened.** They cost
51.7 seconds on a 5.3 GB collection that may never have a claim index — and,
worse, their presence gives the planner a rank scan for the _unindexed_
fallback which it then has to sort anyway: **78,480 ms against the 30,589 ms**
the same query takes without them. They are built by the job that builds the
claim index, and by nothing else.

**A half-built index must never be used.** A claim search against one does not
fail; it returns nothing, which reads as "no game in this collection has that
structure". Only a completed build sets the flag the fast plan checks, and
every other state falls back to scanning — which is correct and was caught by
`schema-equivalence.test.mjs` on a migrated collection before any of it
shipped.

## Caveats, stated rather than buried

- **The "before" figures are from a freshly vacuumed file.** On the same
  collection _before_ the vacuum, the same twelve queries had a median of
  7,038.8 ms and a worst of 40,212.9 ms. Fragmentation turns sequential scans
  into random ones, and the before/after ratio would look eleven times better
  if the fragmented number were quoted. It is not.
- **Cold and warm are reported separately** because they differ by up to 3× and
  a single figure would hide which one it was.
- **The plan hint is a set count, not a position count.** It misclassifies 32 of
  3,109 claims on this collection, and cannot misclassify one badly: a claim in
  _S_ claim sets covers at least _S_ positions, which bounds how far a wrongly
  chosen scan can walk. A wrong choice is slower and never different.
