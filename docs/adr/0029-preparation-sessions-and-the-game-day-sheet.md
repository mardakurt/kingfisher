# 0029. Preparation sessions reference; the game-day sheet is owned

Status: Accepted

## Context

Kingfisher could prepare an opening. It could not prepare a _game_ — an
opponent, a colour, a round, on a date — which is the unit a professional
actually works in. The missing piece was not analysis; it was a frame around
analysis that already existed.

The obvious shape for that frame is a folder: copy the relevant lines, model
games and positions into a session so everything is in one place. It is also
the wrong shape, and it fails in a specific way. A player who prepares on
Tuesday and plays on Saturday edits their repertoire in between. A session
holding copies shows them Tuesday's lines on Saturday morning and gives no
indication that it is doing so.

## Decision

**A session holds ids.** Repertoires, studies, opening files, model-game links
and review items are referenced by identifier, so opening a session a week
later shows what those records say _now_. The session owns no chess.

**Except the sheet, which it owns outright.** The game-day sheet is the
document read twenty minutes before the round, and it is not derivable: which
eight positions matter is a judgement, and the value of a preparation sheet is
entirely in what was left off it. Generating one from the repertoire tree would
produce a document nobody reads.

So a sheet card carries its own FEN, its own line, and the player's own
reason — deliberately duplicating the position rather than pointing at one.
That is not inconsistent with the rule above; it is the reason for the
exception. A card must still read correctly when it is printed, exported, or
opened on a phone in a playing hall with the rest of the database unavailable.

**Ordering is content.** The sheet is read top to bottom under time pressure,
so the order is editable and is preserved in every export.

**The exports are boring on purpose.** A self-contained printable page with no
external references (a stylesheet that has not loaded when the print dialog
opens produces an unusable sheet at exactly the wrong moment), Markdown
carrying every FEN, and PGN that Kingfisher itself can read back. There is no
PDF: producing one in the browser means shipping a rendering library, and a
fragile subsystem whose only job is to reproduce what the print dialog already
does correctly is not worth the bytes or the bugs.

## Consequences

A session is cheap. Creating one for every round of an event costs almost
nothing, because it stores a title, a colour, some ids and whatever the player
curated.

Deleting a session deletes nothing else, which is what a frame should do.

A sheet card can go stale in one specific way: the position it names is a
snapshot, so a repertoire change after the card was made is not reflected in
its printed line. That is the correct trade for a document whose purpose is to
be readable away from the machine, and it is bounded — a card is made days
before it is read, not months.
