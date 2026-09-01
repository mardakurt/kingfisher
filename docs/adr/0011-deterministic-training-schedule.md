# 0011 — Training scheduling is deterministic and legible

**Status:** Accepted

## Context

Training needs spaced repetition, but a hidden adaptive score would make due
dates impossible to explain or reproduce. Chess items also have several answer
shapes: one best move, candidates, evaluation bands, and plans.

## Decision

Each item stores a small schedule state: streak, interval, ease, due date,
review count, and lapses. `Again`, `Hard`, `Good`, and `Easy` are pure
transformations of that state at a supplied timestamp. The UI previews every
resulting interval before the user grades.

New items walk three fixed learning steps (same day, one day, three days)
before the ease factor applies, with two departures from textbook SM-2. A lapse
costs a step rather than resetting the interval, because forgetting one move of
a line is not forgetting the line. And `Easy` graduates an item out of the
learning steps immediately: without that, the first three reviews ignore the
grade entirely and all four buttons schedule the same day, which reads as
though the choice did nothing.

Review history is append-only in a separate store. Advancing the schedule and
writing the review share one transaction. Item modes keep structured answers;
free-form prose is not compared by a pretend natural-language grader.

An answer is checked against what the item's author recorded — moves, an
evaluation band, or nothing at all — never against an engine. `training/answer.ts`
returns `correct`, `partial`, `incorrect` or `unchecked`, and the review history
stores the checked outcome where there was one and the reviewer's own grade
where there was not. Items also record whether their accepted moves came from
the user, an engine line, or a repertoire, and say so when the answer is shown.

## Alternatives considered

- **Random review order:** simple but does not retain difficult material.
- **Opaque adaptive scheduling:** potentially tunable, but hard to test and
  impossible for the user to audit.
- **One puzzle-only item type:** cannot represent evaluation and planning work.

## Consequences

- Identical input state, grade, and time always produce the same due date.
- Scheduling can evolve behind a versioned pure function without changing the
  authored training content.
- The system records the user's judgement of recall; it does not claim to
  understand free-form chess prose.
