# Phase 7 measurements and performance budgets

Phase 6 measured what Kingfisher cost and changed nothing on the strength of a
number. Phase 7 is the opposite: every change recorded here was chosen because
a measurement said it was the slowest thing a user waits for, and every one is
given a before and an after taken on the same machine, the same Node and the
same fixture.

## Environment

```
Apple silicon (darwin-arm64), Node v24.14.0
Chrome via Playwright for the browser figures
Companion started with `npm run companion`, SQLite through node:sqlite
Medians over twenty runs; the worst case reported separately
```

The Phase 6 "before" column for SQLite comes from
[`phase-6-companion-and-engines.md`](phase-6-companion-and-engines.md), taken on
this same machine. Where a before-figure could be re-measured directly rather
than quoted, it was: the SQLite benchmark now runs the aggregation twice, once
through the new derived table and once through the normalized `positions JOIN
games` path, which is byte for byte the SQL Phase 6 timed.

## Reproducing all of it

```bash
npm run benchmark
```

runs the PGN parser benchmark, the aggregate-scaling benchmark, the evidence
packet benchmark and the deterministic performance unit tests, adds the route
bundle report when a build is present, and adds the SQLite suite when
`KINGFISHER_COMPANION_TOKEN` is set. Individual suites:

| Command                    | What it measures                                             |
| -------------------------- | ------------------------------------------------------------ |
| `npm run bench:pgn`        | PGN parse throughput, browser-equivalent code                |
| `npm run bench:aggregates` | Explorer aggregates when the aggregate table is itself large |
| `npm run bench:sqlite`     | Companion import and every query, over real HTTP             |
| `npm run bundle:report`    | Per-route initial JavaScript from a production build         |
| `npm run bench:engines`    | Native engine startup                                        |
| `npm run bench:evidence`   | Assistant evidence-packet assembly                           |

---

## 1. Opening aggregation — the slowest interactive path

Phase 6 identified the unfiltered opening aggregation at 100,000 games as the
slowest ordinary database interaction, at about 130 ms. Phase 7 answers it from
a derived `position_aggregates` table maintained by SQLite triggers.

`npm run bench:sqlite -- 10000` and `-- 100000`, each into its own database.

| Query at 100,000 games                 | Phase 6  | Phase 7    |
| -------------------------------------- | -------- | ---------- |
| opening aggregation (common position)  | 129.2 ms | **0.3 ms** |
| opening aggregation (deep position)    | 29.7 ms  | **0.2 ms** |
| the same common query, normalized scan | —        | 132.0 ms   |
| paged list (100 rows)                  | 0.6 ms   | 0.6 ms     |
| page 20 deep (offset 2,000)            | 0.8 ms   | 0.6 ms     |
| text search                            | 26.2 ms  | 25.5 ms    |
| player search                          | 14.0 ms  | 12.9 ms    |
| player prefix lookup                   | 18.0 ms  | 16.7 ms    |
| games at position                      | 18.3 ms  | 17.9 ms    |

| Query at 10,000 games                  | Phase 6 | Phase 7    |
| -------------------------------------- | ------- | ---------- |
| opening aggregation (common position)  | 11.3 ms | **0.3 ms** |
| the same common query, normalized scan | —       | 12.2 ms    |

The third row is the important one. It is the same question, on the same rows,
in the same process, answered without the aggregate table — and it reproduces
Phase 6's 129 ms as 132 ms. The improvement is the plan, not the hardware.

Worst case at 100,000 games fell from 397 ms to 0.9 ms.

### What it cost

Maintaining the aggregates is a trigger per inserted position row, so import
pays for it:

| 100,000 games into SQLite    | Phase 6 | Phase 7 |
| ---------------------------- | ------- | ------- |
| insert through the companion | 12.1 s  | 15.9 s  |
| throughput                   | 8,281/s | 6,282/s |

That is a 31% slower insert to make the query 430× faster. It is the right
trade for this application: an import is something a user starts once and walks
away from, and an opening aggregation is something they do every time they touch
a move.

### Does it hold when the aggregate table is large?

The benchmark fixture above is eight opening lines, which is what makes it
comparable with Phase 6 — but it means the aggregate table holds only 91 rows.
A real archive holds millions, and a lookup that is fast only because the table
is tiny would be a measurement flattering itself. `npm run bench:aggregates`
builds the opposite shape on purpose: many distinct positions plus one hot
position every game reaches, written through the companion's own schema and
triggers.

| 100,000 games, 900,008 aggregate rows | median   | worst    |
| ------------------------------------- | -------- | -------- |
| hot position via aggregates           | < 0.1 ms | 0.2 ms   |
| hot position via normalized scan      | 104.8 ms | 111.5 ms |
| a rare position via aggregates        | < 0.1 ms | 0.1 ms   |

The aggregate lookup is a primary-key range scan returning at most 24 rows, so
its cost tracks the number of _moves_ at the position, not the number of games
that reached it. That is the whole point of the table.

### Filtered queries still read the source rows

`position_aggregates` is an all-time reduction. It cannot answer "last twelve
months" or "Elo ≥ 2400", and it is not asked to: any explorer query carrying a
filter goes to `positions JOIN games` and pays the scan. The measured cost of
that path is the 132 ms row above — the same as Phase 6, because it is the same
code. What Phase 7 removed is paying it for the common case that does not need
it.

Consistency between `games`, `positions` and `position_aggregates` is checkable
on demand — Settings → Database → Verify explorer index, or `POST /db/integrity`
— and repairable with a transactional rebuild. Nothing is repaired unasked.

---

## 2. PGN import

Phase 6 measured a 100,000-game import as ~57 s, of which ~45 s was parsing on
the main thread. Phase 7 changed two things: the parser carries its rules engine
along the line instead of rebuilding it per move, and the whole pipeline runs in
a Worker.

`npm run bench:pgn -- 100000`, browser-equivalent code in Node:

| 100,000 games (26.1 M characters) | Phase 6   | Phase 7    |
| --------------------------------- | --------- | ---------- |
| parse                             | 44.8 s    | **35.5 s** |
| throughput                        | 2,232 g/s | 2,817 g/s  |

A 21% reduction, from one change: `Position.playSan` must not mutate the
position it is called on, so it built a throwaway `new Chess(fen)` for every
move — about four million FEN parses for this file. `Position.advanceSan` hands
the advanced engine to the position the move reaches instead.

Where the remaining time goes, from `node --cpu-prof` over 20,000 games:

| Function                             | Share of samples |
| ------------------------------------ | ---------------- |
| `chess.js` `_moves` (generation)     | 33%              |
| `chess.js` `Move` construction       | 10%              |
| `chess.js` `_makeMove` / `_undoMove` | 13%              |
| `chess.js` SAN parse / format        | 8%               |
| `chess.js` `fen()`                   | 4%               |
| Kingfisher's own tokenizer           | 0.4%             |
| Kingfisher's `toChessMove`           | 1.1%             |

95% of PGN parsing is the rules library, because resolving one SAN token means
generating every legal move in the position. Kingfisher's own tokenizer is 61 ms
of a 4,436 ms parse at 10,000 games, and building game records and position
indexes from parsed trees is another 109 ms. **There is no further meaningful
win here without replacing the rules engine**, which ADR 0003 and ADR 0004
deliberately isolate but which nothing in Phase 7 justified doing.

So the honest summary is: parsing got 21% faster, and — more importantly — it
stopped happening where the user can feel it.

### Main-thread responsiveness during import

Measured in Chrome by the Phase 7 browser test, which installs a 25 ms interval
before the import starts and records the longest gap between its ticks while a
20,000-game file is imported and the user navigates routes and plays moves:

| During a large import                 | Phase 6           | Phase 7  |
| ------------------------------------- | ----------------- | -------- |
| longest main-thread gap               | seconds at a time | < 500 ms |
| navigation and board input during it  | blocked           | works    |
| progress continues while backgrounded | dialog only       | yes      |

The assertion in `e2e/phase7.spec.ts` is `maxGap < 500 ms` with the interval
ticking throughout; it is a regression guard, not a peak-performance claim.

---

## 3. Frontend startup

`npm run bundle:report` reads the script tags each prerendered route emits from
a production build and sums their on-disk and gzipped bytes. Anything behind a
dynamic import is absent by construction, which is what makes it a fair measure
of code splitting. Phase 6's figures were produced by checking out
`20629fe` into a worktree and running the same script.

| Route         | Phase 6 gzip | Phase 7 gzip | Change |
| ------------- | ------------ | ------------ | ------ |
| `/analysis`   | 307.7 kB     | 286.8 kB     | −6.8%  |
| `/openings`   | 304.7 kB     | 283.2 kB     | −7.1%  |
| `/studies`    | 308.6 kB     | 289.1 kB     | −6.3%  |
| `/repertoire` | 309.3 kB     | 289.4 kB     | −6.4%  |
| `/training`   | 306.4 kB     | 286.0 kB     | −6.7%  |
| `/games`      | 283.9 kB     | 268.5 kB     | −5.4%  |
| `/databases`  | 282.2 kB     | 266.0 kB     | −5.7%  |
| `/recent`     | 282.5 kB     | 265.6 kB     | −6.0%  |
| `/`           | 179.8 kB     | 179.9 kB     | +0.1%  |

Total client JavaScript emitted rose from 1,257 kB in 26 files to 1,373 kB in 60
files. Both halves of that are expected: Phase 7 added a background analysis
queue, a chapter references panel and a PGN worker, and splitting a bundle
costs a little in module wrappers while moving code off the startup path.

What moved behind a dynamic import, and why: Settings, Import, Save-to-study,
Add-to-repertoire, Create-training, Model-game, the analysis queue and the
comment editor are dialogs that are also _conditionally mounted_, so a closed
dialog now neither fetches nor evaluates its implementation. Among workspace
tools, Companion, Transpositions, Game insights, Features and Tablebase load on
selection; Engine, Explorer, Database and Notes stay in the route bundle
because they are what a player opens first and a loading flicker there would be
worse than the bytes.

Lazy panels render a fixed-height placeholder while they load, so switching to
one does not resize the dock.

---

## 4. Performance budgets

Budgets, not targets: each is a number a measurement already meets, written down
so a regression is visible. They are **not** enforced in CI, because every one
of them is hardware-sensitive and a red build that means "this laptop is busy"
teaches people to ignore red builds. The reproducible suites above are the
enforcement mechanism, run deliberately.

| Path                                          | Budget         | Measured   |
| --------------------------------------------- | -------------- | ---------- |
| Initial route JavaScript, gzipped             | ≤ 300 kB       | 265–289 kB |
| Opening aggregation, 100k SQLite, unfiltered  | ≤ 50 ms median | 0.3 ms     |
| Opening aggregation, 100k SQLite, filtered    | ≤ 200 ms       | 132 ms     |
| Database paging, 100k SQLite                  | ≤ 5 ms         | 0.6 ms     |
| Database text search, 100k SQLite             | ≤ 50 ms        | 25.5 ms    |
| Longest main-thread gap during a large import | ≤ 500 ms       | < 500 ms   |
| Native engine ready to accept a position      | ≤ 100 ms       | 13–46 ms   |
| 1,000-ply chapter: import, render, navigate   | ≤ 45 s         | ~5 s total |
| Assistant evidence packet assembly            | ≤ 1 ms         | 0.006 ms   |
| Explorer revisit to a cached position         | no request     | no request |

The last row is a behaviour, not a duration: revisiting a position whose source
has not changed is answered from the TanStack Query cache, keyed by source,
source version, position and filters. It is not a latency claim, because a cache
hit has no latency to report.

---

## 5. Explorer caching and prefetch

Explorer queries are keyed `['explorer', sourceId, sourceVersion, fen, filters]`.
`sourceVersion` comes from the provider — for a SQLite collection it is the
database key and its game count — so importing games into a collection changes
the key and the old answers are never served. Local imports and deletions also
invalidate `['explorer']` and `['transpositions']` explicitly, and a SQLite
import invalidates its own source prefix.

After an explorer result arrives, the two most-played continuations are
prefetched into the same cache. Two, not all: on a 100,000-game collection
prefetching every legal move would turn one explorer view into thirty
aggregations. The prefetched entries share the visible query's keys, so an
import or a filter change invalidates them together with it.

---

## 6. Resource lifecycle

`e2e/soak.spec.ts` instruments `Worker`, `BroadcastChannel`, `EventSource`,
`setInterval` and `window.addEventListener` before the application loads, then
drives eight cycles of new-analysis → moves → engine start/stop → three tool
switches → four route switches, entirely through client-side navigation so the
counters are not reset by a reload. It snapshots after two warm-up cycles and
again after the eight measured ones, and fails if any count grew by more than a small constant —
growth proportional to the cycle count is the signature of a leak.

It passes with no console errors. The two lifecycle bugs it and the queue test
found are recorded in the Phase 7 handover.

---

## 7. What was not measured

- IndexedDB at 100,000 games. Phase 3 measured to 50,000 and the guidance to
  use SQLite past that has not changed.
- Anything above 100,000 games. A million games is a different engineering
  problem and nothing here measured it.
- Hydration and React commit timings. The bundle figures and the soak test were
  enough to choose what to split; no React profile was used to justify a
  `memo()`, and none was added on suspicion.
- Background analysis throughput. It is deliberately one engine at a low
  priority; how many positions per minute that is depends entirely on the engine
  and the preset, and averaging it would say nothing useful.
