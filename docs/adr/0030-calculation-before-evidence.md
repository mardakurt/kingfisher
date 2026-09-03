# 0030. Calculation records a search, and the gate lives in the dock

Status: Accepted

## Context

ADR 0025 established self-analysis for a game already played: record the
judgement, then reveal. Phase 9 needed the same discipline for a position the
player is calculating _now_ — during preparation, in a study, at any board.

The difference between the two is not the workflow, it is the artefact. A
review captures a judgement; calculation captures a _search_, and a search has
a shape. Where the player's analysis forked, and which fork they never looked
at, is the most useful thing about it afterwards — and it is exactly what a
flat list of candidate lines destroys.

## Decision

**A calculation tree, not the game tree.** `GameTree` is durable, carries
revisions and has an undo stack; calculation is a scratch record of eight
minutes' thinking, most of which is discarded. Putting it in a game tree would
mean a save path and a conflict story for something whose value is that it is
free until submitted.

**Moves advance the position.** Playing 1...Rd8 2.Qe2 walks the variation the
way it is calculated, rather than collecting two moves at one position the way
the candidate board does. Replaying a move already entered navigates to it
rather than duplicating it: a player retracing a line means "take me back
there".

**The candidate list is derived from the tree's roots.** The moves considered
at the position _are_ the top-level branches, so maintaining a second list
beside them would create two things that can disagree.

**The gate lives inside the tool dock.** This is the load-bearing decision. The
alternative — every workspace passing a `locked` prop — means the guarantee
depends on nine call sites remembering, and is one refactor away from leaking
an engine line into a session somebody asked to be blind. The dock reads the
calculation store directly, so a workspace that has never heard of calculation
still withholds evidence correctly.

**Submitting writes a `DecisionRecord`.** The same record self-analysis writes,
with the tree attached. So a calculation lands in the same journal, inherits
the same frozen-at-reveal guarantee, and feeds the same calibration and
coverage analytics as the review of a played game.

**Blindfold is part of the same idea.** Hiding the pieces is a stronger version
of hiding the engine, so it is a control in the same panel rather than a
separate mode. The overlay leaves the squares clickable — entering a move you
cannot see is the exercise — and the position stays available to assistive
technology, because hiding it is a training choice a sighted user made about
themselves, not a property of the position.

## Consequences

Calculation sessions are not persisted until submitted. Closing the tab loses
one, which is correct for a scratch artefact and would be wrong for anything
else.

The reveal is one-way, as in review. A player who submits by accident cannot
un-see the evidence, and the record is frozen; they can delete it and start
again. A journal that can be quietly revised is not evidence of anything.

The dock's `locked` mechanism now takes an `except` list, because the
calculation panel itself must stay usable while everything around it is
withheld. That is the only exception, and it is stated in the type.
