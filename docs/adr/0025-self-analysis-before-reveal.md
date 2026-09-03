# 0025. Self-analysis first: an immutable decision record and a reveal gate

Status: Accepted

## Context

Every previous phase made Kingfisher better at telling the player what the
engine thinks. That is the easy half, and past a certain strength it is the
half that stops helping: a player who opens a position with the evaluation
already on screen does not calculate, they read. The engine becomes a substitute
for thinking rather than a check on it.

The workflow that actually produces improvement is the opposite order — decide,
commit the decision, then look. Doing that by convention (a Notes field, a
promise to oneself not to peek) does not survive contact with a real study
session, because the evidence is one tab away and there is no record afterwards
of what was genuinely believed beforehand.

## Decision

**The reveal gate is a property of the workspace, not a habit.** In Review, the
engine, Explorer, tablebase, repertoire, structure and model-game tools are
withheld until the player submits. They are not merely empty: the dock states
that computer evidence is hidden during self-analysis, because "empty" and
"hidden by your own choice" are different states and a workspace that confuses
them looks broken.

**The decision record is structured, not prose.** Candidate moves entered on a
board rather than typed as UCI, an evaluation estimate as a band and an
optional number, a plan, calculation notes, an optional confidence, and the
move the player would actually play. Nothing in the record is generated: there
is no place for the application to write an opinion into the player's own
account of their thinking.

**Pre-reveal fields freeze at reveal.** `revealedAt` is set once and never
cleared, and `updateDecision` refuses after it is set. This is the refusal that
gives the journal its value. After reveal the player has seen the engine, and a
"correction" made then is no longer a record of their judgement — it is a
record of the engine's, wearing the player's name. Themes and notes can still
be added afterwards through a separate annotate path, because tagging what
happened is not rewriting it.

**Reveal compares; it does not grade.** The post-reveal panel shows the
player's estimate, the engine's evidence and the difference between them, and
calls it a comparison. Outside tablebase-eligible positions the engine is
strong evidence, not truth, and the wording never promotes it. Candidates are
listed against what the engine and the database say about them; none of them
is labelled a blunder, a mistake or brilliant.

**Review candidates are suggested from facts, with the fact shown.** A position
enters the queue because of an evaluation swing, a change of top move, a large
MultiPV separation, a manual mark, a repertoire deviation or a tablebase result
change — and the row states which, in those terms: "suggested because engine
evaluation changed from +0.4 to -1.1". Nothing is auto-accepted; the queue
offers ignore, mark critical, create a training item, or add to a study.

**Themes are chosen by the player.** The taxonomy is a starting list plus
custom tags, assigned by hand. Deriving a theme from an engine score would be
inventing a diagnosis from a number that does not contain one.

## Consequences

The improvement summary can only ever count what the player actually recorded.
That is the point: a summary saying "candidate generation: 9" is nine positions
the player tagged, each of which can be opened. There is no derived skill
score, no accuracy percentage and no trend the data does not support.

The reveal gate is the property most easily broken by an unrelated change
elsewhere — a tool panel gaining a default, a dock refactor forgetting the
flag. A regression would not look like a failure; it would look like a helpful
engine line appearing a little earlier than intended. So the browser test
asserts the _absence_ of evidence before reveal, and the immutability of the
record after it, rather than only the happy path.

Because the record is immutable after reveal, a player who submits by accident
cannot edit their way out of it. They can delete the record and start again.
That is the correct trade: a journal that can be quietly revised is not
evidence of anything.
