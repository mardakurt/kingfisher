# 0032. One list of position actions, and a trail that names where it goes

Status: Accepted

## Context

Two measurements, taken by walking the product rather than reading it.

Kingfisher had accumulated a dozen position-level actions across nine phases,
each arriving where it was built: "add to repertoire" in a document menu, "find
model games" in a dock tab, "search structure" in a panel inside a tab. Every
one was reachable and no two the same way, so the cost of a professional
workflow was measured in hunting rather than in clicks.

And research is a series of departures — repertoire, model game, structure
search, analysis, back to the repertoire — for which the browser's history is
the wrong tool. Not because it cannot go back, but because it cannot say
_where_, and because returning to `/repertoire` with the position and filters
reset is returning somewhere else.

## Decision

**One definition of the actions, three consumers.** The list lives in one
module and is rendered by the board's menu, the toolbar menu and the command
palette. "How do I get from here to a training item" then has one answer that
can be learned once.

**Not permanent buttons.** Twelve controls around a board is how a workspace
stops looking like a chess application. The actions live in menus and on keys.

**New keys take what was free.** `C` has opened the comment editor since Phase
1, so calculation is `⇧C`. A new feature does not get to evict a binding people
have learned, and the collision list is written down beside the shortcut table
rather than discovered by a user whose comment editor stopped opening.

**The trail records departures, not URLs.** A stop carries the destination's
label, the position, and whatever route-specific context that route needs to
rebuild what was on screen. The context is opaque to the history: a typed union
of every route's state would have to change every time a route gained a
control.

**Session-scoped and bounded.** Twelve stops. Persisting the trail would mean
restoring a week-old research context at startup, which is not continuity, it
is confusion.

**Focus mode is not persisted; compact density is.** Focus is something entered
for twenty minutes of hard analysis and left; restoring it on next launch
presents a chrome-less application to somebody who has forgotten they turned it
on. Compact is a standing preference about how someone likes their workstation,
so it persists — and it removes padding and chrome height only. It does not
touch text size or hit targets, which is the trade "compact mode" usually makes
and the reason it usually fails somebody working for eight hours.

## Consequences

Adding a position action means adding it in one place, and it appears in the
menu, the palette and the keyboard help together.

The trail is a convenience rather than a guarantee: it records a departure only
when a route pushes one, so a hand-off from a route that has not been taught to
push simply offers no "back to" control. That degrades to the browser's own
back button rather than to something broken.

Density is applied through one root attribute, so any surface can opt in from
CSS without a prop threaded through the layout, and turning it off is
guaranteed complete.
