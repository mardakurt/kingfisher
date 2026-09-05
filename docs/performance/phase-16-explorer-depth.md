# How deep the reference packs actually answer

Measured with `node scripts/bench-explorer-depth.mjs`, on 5 September 2026,
against the packs as published. Every number here is reproducible with that
command; plies are half-moves throughout, with the full-move equivalent beside
them, so "twenty moves deep" can never quietly become twenty plies.

## What changed in Phase 16, and why the old number was unreadable

Phase 15 measured the same thing and reported it as a limitation it could not
resolve: the hand-written corpus was "topical for twelve to fifteen moves and
legal thereafter", so a miss at ply thirty could mean either

- the pack is shallow, or
- the corpus walked down a move nobody has actually played.

Those call for opposite responses — rebuild the pack, or fix the corpus — and
one number was being reported for both. Guessing which was happening is what
made the deep figures a floor rather than a measurement.

The fix is not a better guess. At the ply where a line stops being answered,
the benchmark now reads the row for the position the move was played _from_
and asks whether the pack lists that move:

| Verdict          | What the pack says                                    | What it means                                        |
| ---------------- | ----------------------------------------------------- | ---------------------------------------------------- |
| **pruned**       | the parent lists the move, with a game count          | the pack saw it played and did not keep what follows |
| **never played** | the parent is there and does not list the move at all | no game in this pack ever played it                  |
| **answered**     | the whole line is present                             | nothing stopped                                      |

Only the first is a statement about pack depth. No authored judgement enters
this — it is read out of the same rows the explorer reads.

The corpus also grew from 31 lines to **45**, adding the families the old one
had no entry for: the Dragon (Yugoslav Attack), Richter-Rauzer, Rossolimo,
Alapin, Queen's Gambit Accepted, Queen's Indian, the Nimzo-Indian Rubinstein,
the QGD Exchange, the Two Knights, the Evans Gambit, the King's Gambit, the
Alekhine, the Modern Defence and the London System. Every line is replayed
through `src/chess/position.ts` before it is used, and an illegal or ambiguous
move fails the run loudly — which is how four mistyped moves in the new lines
were found rather than silently shortening what they were meant to measure.

## Results

Corpus: 45 lines, median 32 plies, shortest 24, longest 40.

| Pack               | Games   | Positions | 10 plies | 20 plies | 30 plies | 40 plies |
| ------------------ | ------- | --------- | -------- | -------- | -------- | -------- |
| Kingfisher Starter | 172,376 | 246,870   | 100.0%   | 60.0%    | 10.3%    | 0.0%     |
| Elite OTB          | 407,538 | 5,438,808 | 100.0%   | 71.1%    | 17.9%    | 25.0%    |
| Recent Theory      | 44,200  | 918,069   | 97.8%    | 51.1%    | 5.1%     | 0.0%     |

Continuous answers — how far a player clicking down one line gets before the
panel goes blank:

| Pack               | Median   | Worst    | Best     |
| ------------------ | -------- | -------- | -------- |
| Kingfisher Starter | 20 plies | 10 plies | 36 plies |
| Elite OTB          | 23 plies | 10 plies | 40 plies |
| Recent Theory      | 19 plies | 5 plies  | 30 plies |

## Why the lines stop — the finding

| Pack               | Pruned by the pack | Never played in it | Answered to the end |
| ------------------ | ------------------ | ------------------ | ------------------- |
| Kingfisher Starter | 20                 | 24                 | 1                   |
| Elite OTB          | **10**             | **32**             | 3                   |
| Recent Theory      | 6                  | 39                 | 0                   |

**On Elite OTB, the binding constraint is the size of the corpus, not the depth
of the index.** Thirty-two of the forty-five lines stop because the exact
continuation has never been played in 407,538 elite games — not because
Kingfisher declined to index it. Only ten stop at a position the pack chose not
to keep, and those are the frequency threshold doing what ADR 0046 says it
does: a move played once at ply twenty-six does not earn a stored position.

That reframes the headline. "17.9% at thirty plies" is not "the explorer runs
out at move fifteen". It is "a specific fifteenth move from a book is often not
in four hundred thousand games", which is a fact about how many elite games
exist, and is fixed by more games rather than by more indexing. The one number
with no authoring risk at all — the most-played chain, following whatever the
pack itself says is commonest — reaches **41 plies (20.5 moves)** on both Elite
and Recent Theory.

## What this does not measure

- It says nothing about whether a _useful_ number of games remains at ply
  thirty. A position answered by two games is answered, and the explorer shows
  the count; the benchmark counts presence, not weight.
- It measures the built packs. A user's own imported database is a different
  population and is not covered here.
- The corpus is authored, so its _shape_ is still a choice. What is no longer
  a choice is the interpretation of a miss, which is now read from the data.

## Reproducing

```bash
node scripts/bench-explorer-depth.mjs
node scripts/bench-explorer-depth.mjs --pack .packs/kingfisher-elite-otb --pack .packs/kingfisher-recent-theory
```
