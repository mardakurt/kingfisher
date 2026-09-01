# 0005 — No move classifier in Phase 1

**Status:** Accepted

## Context

Labelling moves as _inaccuracy_, _mistake_ and _blunder_ is the single most
requested feature in analysis tools, and the standard implementation is a
threshold on centipawn loss.

That implementation is wrong in ways that matter to a strong player. A 40 cp
loss in a sharp position where only one move holds is not the same mistake as a
40 cp loss in a quiet position with four reasonable continuations. A move that
drops from +6.2 to +4.8 is labelled worse than one that drops from +0.2 to
−0.4, when the second changed the result and the first did not. And a
classification that appears next to a move is read as a judgement, which means a
bad one actively teaches the wrong lesson.

## Decision

Define the vocabulary; do not implement a classifier yet.

`MoveClassification` exists in `chess/tree/types.ts` and `MoveNode.meta` can
carry it. Nothing produces one. When a classifier is built, its inputs are
already identified: evaluation swing measured in expected score rather than
centipawns, the spread across MultiPV lines, whether the best move is unique,
stability across depths, the practical alternatives available, and the position's
tactical sharpness.

## Consequences

- No misleading labels ship, and no threshold becomes load-bearing before it has
  been thought through.
- Nodes can already store the result, so adding a classifier is additive.
- Accuracy percentages are deliberately absent for the same reason: they compress
  a game into a number that rewards quiet positions.
