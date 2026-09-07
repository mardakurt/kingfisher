# 0051 — Two engine slots, and the measurement behind them

**Status:** accepted (Phase 19)

## Context

Phase 18 proved four native engines can search at once through one companion,
each answering about its own position — a real correctness result, since UCI
output carries no request identity and a mis-attribution would look exactly
like a working comparison. It also stated plainly that this is **not** a
four-engine comparison view: `SlotId` is `'primary' | 'secondary'` and there is
no third slot.

Phase 19 was asked to decide whether there should be, by experiment rather than
by preference: run two, three and four engines on ordinary laptop hardware and
see what it costs.

## The measurement

`npm run bench:engine-concurrency` holds the user's budget fixed, splits it N
ways exactly as `shareResources` does in the application, runs N sessions of
the **same** engine on the **same** middlegame position for the same movetime,
and reports the depth each reached. One engine repeated is deliberate: with
four different engines the depths differ for reasons that have nothing to do
with sharing.

Stormphrax 8.0.0, `go movetime 4000`, macOS 26.6.2 on an Apple M3 Pro,
12 logical cores, 18 GB.

**A capable machine — 12 threads, 1024 MB:**

| Engines | Each gets  | Depths reached | Median | vs one engine |
| ------: | ---------- | -------------- | -----: | ------------: |
|       1 | 12t 1024MB | 24             | **24** |             — |
|       2 | 6t 512MB   | 22, 23         | **23** |        **−1** |
|       3 | 4t 341MB   | 21, 23, 23     | **23** |        **−1** |
|       4 | 3t 256MB   | 21, 22, 22, 22 | **22** |        **−2** |

**A modest one — 4 threads, 256 MB:**

| Engines | Each gets | Depths reached | Median | vs one engine |
| ------: | --------- | -------------- | -----: | ------------: |
|       1 | 4t 256MB  | 23             | **23** |             — |
|       2 | 2t 128MB  | 21, 23         | **23** |         **0** |
|       3 | 1t 85MB   | 21, 21, 21     | **21** |        **−2** |
|       4 | 1t 64MB   | 22, 22, 22, 22 | **22** |        **−1** |

Wall time was the movetime in every row: nothing stalls, and no combination
exceeded the budget it was given.

Two readings, and the second is the one that matters. On a capable machine a
third engine costs about one ply, which is cheap. On a modest one the split
reaches **one thread each at three engines**, and the cost is two ply — and
below that the split stops mattering because it has hit the floor, while the
engines go on competing for the same physical cores.

## Decision

**Two slots. Not three, and not four.**

Not because three is unaffordable — on the better machine it plainly is
affordable — but for two reasons the measurement does not settle and one it
does.

**A third reading invites being counted.** Two engines disagreeing is a signal
to look at the lines; the panel says so and the documentation says so. Three
engines produce a majority, and a majority is a verdict wearing the costume of
evidence. This project does not put a fictional number in front of a chess
judgement, and "two of three prefer Nf5" is exactly that number. It would be
the easiest wrong reading in the product to arrive at and the hardest to
prevent.

**The comparison is built on two readings, not on N.** `compareEngines` is
about agreement between a pair — where the lines diverge, how far they agreed
first, which shared prefix to show. Generalising it is not a matter of adding a
slot; it is a different feature, and a different feature designed to answer a
question this project has decided not to ask.

**And on a normal laptop a third engine costs two ply of every engine.** The
player who most wants a third opinion is the one least able to afford it.

## Consequences

- `SlotId` stays `'primary' | 'secondary'`. `MAX_SESSIONS` stays 4 in the
  companion, because the lab drives four to check attribution and background
  analysis takes a session of its own — the limit is a resource ceiling, not a
  claim about the interface.
- The resource ceiling stays divided by `MAX_SESSIONS` rather than by the
  number running. It under-uses a machine running one engine, and it is the
  safe direction: a ceiling that rose as sessions closed would let the first of
  four take everything and keep it.
- No document may say Kingfisher compares three or four engines. The lab is a
  companion-level attribution check and is described as one.
- If this is revisited, the experiment is `npm run bench:engine-concurrency`
  and the argument to answer is the majority-vote one, not the resource one.
