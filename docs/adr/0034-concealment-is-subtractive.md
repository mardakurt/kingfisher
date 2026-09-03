# 0034. Concealment is a capability the caller cannot undo

Status: Accepted

## Context

Four workflows exist to withhold evidence: Review records a judgement before
showing the engine, Calculation captures a search before showing anything,
Guess the Move asks for a move, and Training asks a question. Each was built in
a different phase and each expressed "hide the answer" differently:

- Review passed `showEvaluationArtifacts={revealed}` to the board.
- The tool dock withheld tool _mounts_, so a hidden tool issues no query.
- Calculation drew an overlay over its own private board.
- Training simply did not render the dock until the answer was shown.

Four mechanisms, no single place to check whether a route was safe, and nothing
stopping a fifth workflow from getting it wrong. Worse, the failure does not
look like a failure. A leaked evaluation bar does not throw, does not log, and
does not look broken — it looks like a helpful number in the corner of the
board, and the user will read it before they notice it should not be there.

`showEvaluationArtifacts` also did not cover everything. A stored `!` on the
next move is the answer, written on the board, and no route was hiding it.

## Decision

One record, `BoardCapabilities`, resolved in one function, with two properties
that make it worth having.

**Declared, never inferred.** The capabilities come from the surface that
renders the board, not from the pathname. The same document is editable in
Analysis and frozen in a preview card, so this is a property of the surface. An
earlier version inferred from the route and the document kind and made a game
opened from Games read-only in Analysis, silently removing the ability to add a
variation to your own game — inference on this seam has already cost us once.

**Subtractive, and applied last.** `resolveBoardCapabilities` takes the mode's
base record, applies the caller's overrides, and _then_ clears everything that
could carry the answer. A call site therefore cannot re-enable the evaluation
bar inside a concealed session, including by passing the wrong prop by
accident. The ordering is the whole mechanism, and it is what the unit tests
are for: the test that matters is the one where a caller explicitly asks for
`showEvaluation: true` alongside `conceal: true` and does not get it.

Concealment withholds the evaluation, the legal-move hints, and both the
display and the editing of annotations. It does **not** withhold moves —
answering is the exercise.

## Consequences

Adding a fifth concealing workflow is one flag rather than a checklist. Review
now passes `conceal={!revealed}` instead of remembering which artefacts leak,
and gained annotation concealment it never had.

`CanonicalBoardSurface` writes `data-board-conceals="evidence"` when it is
withholding, so the E2E assertion reads the component's own claim rather than
checking that a bar happens to be absent — a test that passes because the
engine was not running proves nothing about concealment.

The dock's separate mount-withholding stays. It is a different guarantee: the
capability record stops the board _showing_ evidence, the lock stops a tool
_fetching_ it. Calculation's lock in particular lives inside the dock rather
than being passed down by each workspace, because a guarantee that depends on
nine call sites remembering is one refactor away from leaking.
