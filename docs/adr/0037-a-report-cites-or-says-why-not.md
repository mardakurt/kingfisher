# 0037. A report cites its sources, or says why it has none

Status: Accepted

## Context

By Phase 10 the evidence about a position was spread across at least six
panels: reference statistics in the explorer, repertoire decisions in another,
model games in a third, personal results in a fourth, the decision journal in a
fifth, pinned engine lines in a sixth. Each is right where it belongs while you
are doing that particular kind of work. None of them answers "what do I know
about this position" without visiting the other five.

A consolidated report is the obvious answer and the dangerous one. The moment
evidence from six sources is arranged on one screen, two failure modes appear
that none of the individual panels had:

1. **Laundered provenance.** A number lifted out of the explorer and printed
   next to a number from the user's own games looks like one authority
   speaking. "The database says 62%" is a claim nobody can check.
2. **An implied recommendation.** Any move printed at the top of a list is read
   as advice. A report that says "e5" without saying why it chose e5 has made a
   recommendation while appearing to state a fact.

## Decision

**Every section carries its own citation, and the citation travels with the
text.** "Lichess Masters · 18,431 games" is a source; "the database" is a
rumour. The Markdown export repeats each citation under its heading, because a
report pasted into a study without its sources is exactly the unattributed
claim this rule exists to prevent.

**A section with no evidence says why it has none.** "Lichess is rate limiting
this client" and "no repertoire covers this position" are different facts and
must never both render as an empty space. This is what stops a failed lookup
reading as a position nobody has played.

**No move is highlighted as best.** A highlighted move carries the rule that
selected it — "Most played", "Highest scoring among moves with at least 100
games", "Most recently played" — and the sample threshold is written into the
label rather than hidden in the code, because a threshold the reader cannot see
is a judgement disguised as arithmetic. Three wins in three games is not a 100%
scoring move, and the threshold is what keeps it out.

Engine evidence stays in its own section, attributed to the engine and depth
that produced it. Mixing it into the move list would blur a claim about what
people have played with a claim about what a search calculated.

**Sources are queried independently.** One failing source empties its own
section and nothing else. A report that vanished because the explorer was rate
limited would hide the repertoire and journal evidence that was available the
whole time.

## Consequences

The assembly is a pure function over already-fetched evidence, so the
provenance and highlight rules are tested without a database or a network —
including a test asserting that no criterion anywhere contains "best",
"recommended", "strongest" or "should". That test is the guard against a later
change quietly turning the report into an oracle.

The report adds no new evidence and starts no engine. Everything in it was
already knowable; what is new is that it is answerable in one place, with
every claim attributable to the thing that made it.
