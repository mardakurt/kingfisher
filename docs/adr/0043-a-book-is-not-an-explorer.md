# 0043. A book is not an explorer

Status: Accepted

## Context

Kingfisher now has both an opening explorer and opening books. The obvious
thing to do is put the book's weights into the explorer's table as another
column, next to the games and the score.

## Decision

They are separate panels, and a book move never appears in the explorer's
table.

## Consequences

The distinction is not cosmetic. An explorer answers _what has been played
here_, from a population you can name, count and re-derive. A book answers
_what to play here_, from somebody's weights — and the somebody is the point:
two books disagree in ways no number of games can settle, and a weight has no
denominator to check it against.

A column of counts with an opinion in it is the exact confusion this
application spends its effort avoiding. So the book gets its own panel, its own
numbers, and a line naming the book they came from.

Three rules follow:

**Books are searched in order and never merged.** The first enabled book that
knows the position answers. An averaged weight is a number neither author would
recognise.

**Kingfisher's own book is derived, not authored.** It weights each move by how
often strong players in the installed reference chose it. No opinion Kingfisher
does not already publish, and a weight whose population you can ask about — more
than an anonymous `.bin` offers. Moves under 2% of a position's games are left
out: that is a fact for the explorer, not advice.

**Engines never play from their own book.** `setoption name OwnBook value
false` goes to every engine that declares the option, at session construction,
before anything the caller configures. Not a preference. An engine answering
from an internal book returns a move instantly with no search behind it, and the
analysis panel would report that as an evaluation at depth 0 — a number the
engine never computed. `BookPath` is not offered for the same reason.
