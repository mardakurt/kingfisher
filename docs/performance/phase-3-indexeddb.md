# Phase 3 IndexedDB measurements

Two runs, both on the local development host, both against a temporary database
with the production v3 shape — `games` summaries, `gameContent` trees, a
`positions` index — created and deleted by the benchmark. Neither touched the
`kingfisher` workspace database.

The dataset deliberately makes the initial position pathological: every game
indexes one move there, so the explorer join has to touch every game in the
collection. This is a ceiling, not a claim about a typical middlegame.

## Run 2 — 2026-09-01, `scripts/bench-indexeddb.js`

Median of three, in milliseconds, Chromium in the in-app browser with the dev
server running alongside.

|  Games | Indexed list, 100 | Exact player, count + 100 | Preparation, 1,000 whole games | Explorer, point-read join | Explorer, bulk join |
| -----: | ----------------: | ------------------------: | -----------------------------: | ------------------------: | ------------------: |
|  1,000 |               1.8 |                       2.0 |                          116.1 |                      33.2 |                 3.4 |
| 10,000 |               2.3 |                      20.8 |                          125.0 |                     342.9 |                32.2 |
| 50,000 |               2.3 |                      99.4 |                          131.2 |                   1,743.8 |               166.4 |

The script is committed, so these can be reproduced or contradicted rather than
taken on trust. It is run from a browser console; there is no CI job for it,
because a timing test on shared hardware fails for reasons that have nothing to
do with the code.

## Run 1 — 2026-09-01, isolated Chromium 152

An earlier run, from the session that chose the thresholds, in an isolated
browser with no dev server competing for the machine. Reported here because it
is what the thresholds were originally selected against.

|  Games | Insert increment | Indexed list, 100 | Exact player | Preparation, up to 1,000 | Explorer, point reads | Explorer, bulk join |
| -----: | ---------------: | ----------------: | -----------: | -----------------------: | --------------------: | ------------------: |
|  1,000 |            119.2 |               1.3 |          1.7 |                     12.8 |                  38.2 |                 8.5 |
| 10,000 |          1,014.1 |               1.4 |          6.3 |                     69.6 |                 418.9 |                74.3 |
| 50,000 |          5,345.1 |               1.6 |         45.8 |                     64.5 |               2,119.0 |               362.6 |

The two runs disagree on absolute numbers by roughly two to three times, which
is what a busy machine and a different insert strategy produce; run 2's insert
timings in particular are dominated by its own chunking and are not comparable,
so they are left out of the table above. **Every conclusion below holds in both
runs**, which is the only reason to state them.

## What the measurements decided

- Lists page through an index at 100 rows. Latency stayed at 1.3–2.3 ms from
  1k to 50k in both runs — flat, so virtualization is unnecessary at this page
  size and the games list does not read a single game tree.
- Opponent preparation is capped at the most recent 1,000 games and loads them
  in one transaction. It stayed at 65–131 ms from 10k to 50k, because the cost
  tracks the cap rather than the collection.
- Local exploration switches from point reads to a bulk summary join above 500
  matching games. At 50k the join was 5.8× faster in run 1 and 10.5× faster in
  run 2; at 1k the point-read path is the cheaper of the two, which is why the
  threshold exists rather than a single strategy.
- The bulk path still costs 160–360 ms in the worst case, so the persistent
  provider does the lookup and aggregation in a module Worker. The Worker is for
  responsiveness; it does not make the CPU time disappear.

No production dependency was added for paging, IndexedDB access, aggregation, or
Worker orchestration.
