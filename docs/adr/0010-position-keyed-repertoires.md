# 0010 — Repertoires are position maps, not move-order trees

**Status:** Accepted

## Context

Opening knowledge is normally entered as lines, but lines are not its identity.
`1.Nf3 d5 2.d4` and `1.d4 d5 2.Nf3` can reach the same position. Storing those
as two unrelated trees duplicates notes, hides coverage, and makes deviations
depend on move order rather than chess.

Opponent continuations also need to be distinguished from the moves the user
intends to play. Otherwise the application cannot say whether the user or the
opponent left preparation.

## Decision

A repertoire is a map keyed by the canonical position key from ADR 0009. The
compound `[repertoireId, positionKey]` index is unique. Adding a line upserts
each position, so transpositions converge in storage rather than being repaired
afterward.

Own-side moves carry one of four roles: main, alternative, candidate, or avoid.
Opponent moves are stored on their position with `expected: true`; they do not
count as prepared answers. Coverage and evidence-backed gaps are derived from
the map. No second repertoire tree exists.

## Alternatives considered

- **PGN chapters as repertoires:** simple, but move-order identity makes
  transpositions and coverage unreliable.
- **A graph of named opening nodes:** expressive, but creates a second chess
  tree with synchronization and migration costs.
- **Store only own moves:** smaller, but cannot distinguish an opponent
  deviation from missing preparation.

## Consequences

- Lookup, transposition convergence, coverage, and deviation checks are
  deterministic and independently tested.
- The UI may still present lines for authoring; persistence remains position
  based.
- One opponent position can contain several expected continuations without
  pretending they are user move choices.
