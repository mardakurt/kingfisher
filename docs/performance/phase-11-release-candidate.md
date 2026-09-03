# Phase 11 — what the release-candidate work cost

Phase 11 was mostly reliability work, which usually costs nothing to measure
and everything to skip. The three features it did add are measured here against
the Phase 10 figures, and the one regression is stated rather than rounded away.

Reproduce with `npm run benchmark` and `npm run bundle:report`. Environment for
every figure below: node v24.14.0, darwin-arm64.

## Bundles

| Route           | Phase 10            | Phase 11              | Change      |
| --------------- | ------------------- | --------------------- | ----------- |
| Heaviest route  | `/review` 324 kB gz | `/review` 330.7 kB gz | **+6.7 kB** |
| Scripts on it   | 20                  | 21                    | +1          |
| Total client JS | 1,686 kB / 78 files | 1,829.9 kB / 83 files | +143.9 kB   |

`/analysis` is 317.9 kB gzipped over 20 scripts.

The +6.7 kB on the heaviest route is the honest cost of three features. The
position report panel and the accounts settings section are both lazily loaded
— the report is a workspace tool like any other and is fetched when its tab is
opened — so the increase is the sync store and the settings surface that
reaches it, not the report itself. Total emitted JavaScript rising faster than
any single route is what code splitting looks like when features are added:
five new chunks, none of them on the initial path.

**No runtime dependency has been added since Phase 7.** `fake-indexeddb`, added
this phase for the historical migration fixtures, is a devDependency and is
absent from every client bundle.

## Test suite

| Suite                    | Phase 10 | Phase 11 | Notes                                                 |
| ------------------------ | -------- | -------- | ----------------------------------------------------- |
| Unit / integration tests | 908      | 1,096    | +188                                                  |
| Unit test files          | 76       | 85       | +9                                                    |
| Unit suite wall time     | ~2.8 s   | ~3.9 s   | +1.1 s                                                |
| Playwright tests         | 58       | 72       | +14, at **zero retries**                              |
| Playwright wall time     | —        | 5.4 min  | Full local run, one worker, real engine and companion |

The +1.1 s on the unit suite is almost entirely the seeded randomized tests:
sixteen seeds each generating a legal game up to 50 plies, replaying every move
for legality and round-tripping through PGN. That work is ~2.7 s of the total
and is the price of the coverage; it was measured before being accepted rather
than assumed to be free.

## Sync

Not benchmarked against the live services, deliberately — a figure that depends
on Lichess's current load measures Lichess, not Kingfisher, and running a
benchmark against a third party's API repeatedly is exactly the behaviour their
rate-limit guidance asks clients not to exhibit.

What is worth stating is the shape of the work, because it decides the cost:

- **Lichess incremental sync is one request.** The `since` cursor means the
  request returns only what is new, so the cost after the first sync is
  proportional to games played since, not to games ever played.
- **Chess.com incremental sync is one archive-list request plus one month.**
  Settled months are never re-fetched. A first sync of a ten-year account is
  ~120 serial requests; every sync after that is two.
- **Import is the existing pipeline at its existing cost.** Parsing and
  indexing dominate; the fetch does not. The Phase 7 and Phase 8 import figures
  apply unchanged, because it is the same code path.

## Custom engine startup

`npm run bench:engines` measures time to `uciok`, `readyok` and first line for
each installed native engine. A custom-registered engine goes through the same
`EngineHost` and the same `UciSession`, so its startup is its own binary's
startup — there is no Kingfisher-side overhead to measure beyond the
registration handshake, which happens once and is bounded by an 8-second
timeout.

## What was not measured

- **Position report assembly.** It is a pure arrangement of already-fetched
  evidence; the cost is the queries, which are the existing repository and
  explorer costs already measured in earlier phases. A benchmark of the
  arrangement itself would report a number close to zero and mean nothing.
- **Live sync throughput.** See above.
- **Visual regression.** No screenshot-diff suite exists, so there is nothing
  to measure. This is recorded as a gap in the gap analysis rather than
  presented as a decision.
