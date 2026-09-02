# Phase 6 measurements

What Phase 4 shipped and Phase 5 never timed. All numbers come from the
scripts in `scripts/`, which drive the companion over its real HTTP and SSE
transport with the payloads `src/companion/import.ts` sends — not a private
fast path — so they are the costs a user actually pays.

## Environment

```
Apple silicon (darwin-arm64), Node v24.14.0
Chrome via Playwright for the browser figures
Companion started with `npm run companion`, SQLite through node:sqlite
Caches warm: each measurement discards a warm-up run
```

Medians over twenty runs unless stated. The median rather than the mean
because one request in twenty routinely lands on a checkpoint or a cold page
and costs ten times the rest; a mean reports that as the typical experience,
which it is not. The worst case is given separately because it is also worth
knowing.

## SQLite companion

`npm run bench:sqlite -- 10000` and `-- 100000`, each into its own database.

| Query                        | 10,000 games | 100,000 games |
| ---------------------------- | ------------ | ------------- |
| paged list (100 rows)        | 0.7 ms       | 0.6 ms        |
| page 20 deep (offset 2,000)  | 0.6 ms       | 0.8 ms        |
| text search                  | 2.1 ms       | 26.2 ms       |
| player search                | 1.3 ms       | 14.0 ms       |
| player prefix lookup         | 1.3 ms       | 18.0 ms       |
| opening aggregation (common) | 11.3 ms      | 129.2 ms      |
| opening aggregation (deep)   | 2.3 ms       | 29.7 ms       |
| games at position            | 2.0 ms       | 18.3 ms       |

Worst cases at 100,000 games: text search 131 ms, opening aggregation 397 ms.

| Import                         | 10,000 games | 100,000 games |
| ------------------------------ | ------------ | ------------- |
| parse PGN (browser-equivalent) | 4.4 s        | 44.8 s        |
| insert through the companion   | 0.7 s        | 12.1 s        |
| throughput                     | 14,246 g/s   | 8,281 g/s     |
| database on disk               | 23 MB        | 237 MB        |

Two things the table says plainly. Paging does not care about collection size,
because it is answered from an index. Everything that scans — text search,
player lookup, opening aggregation — grows roughly linearly, so the common
aggregation at 100,000 games is the slowest interactive path at about 130 ms.
And **parsing dominates import**: four fifths of the time is the browser
reading PGN, not SQLite writing it.

Not extrapolated past 100,000. A million games is a different engineering
problem and this measured nothing about it.

## Native engine startup

`npm run bench:engines`, three runs each after a discarded warm-up, timed from
the start request rather than from process spawn, and including the companion's
HTTP and SSE transport.

| Engine     | `uciok` | `readyok` | first line | bestmove (depth 10) |
| ---------- | ------- | --------- | ---------- | ------------------- |
| Lc0        | 37 ms   | 46 ms     | 501 ms     | 8,320 ms            |
| Stormphrax | 7 ms    | 13 ms     | 40 ms      | 40 ms               |

Both are ready to accept a position in well under a tenth of a second, which is
the number that matters for switching engines. The gap afterwards is what the
engines _are_: Lc0 evaluates a neural network per node, so its first line costs
half a second and a fixed depth costs eight — an unhelpful measure for an MCTS
engine, included only to show it is not a startup cost.

Stockfish WASM is not here. It loads into a Web Worker and has no process to
time from this script; the browser suite exercises it instead.

## Companion evidence packet

`npm run bench:evidence`, 200 runs each. Local assembly only — the model's own
latency is not Kingfisher's to report.

| Case                             | median   | worst    |
| -------------------------------- | -------- | -------- |
| ordinary position                | 0.004 ms | 0.027 ms |
| large explorer result (40 moves) | 0.004 ms | 0.506 ms |
| every source present             | 0.006 ms | 0.018 ms |
| build only, without rendering    | 0.001 ms | 0.003 ms |

A full packet with two engines, forty database moves, repertoire, features,
personal results, notes and model games renders to about 1,600 characters in
six microseconds. Assembling the evidence is not, and is nowhere near becoming,
a reason the assistant feels slow.

## What was not measured

No before-and-after numbers are claimed for Phase 6. The engine, provider and
persistence changes were made for correctness, and none of them was chosen on
the basis of a measurement or is claimed to have improved one.
