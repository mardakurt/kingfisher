# 0017. One workspace context and one tool dock

Status: Accepted

## Context

By the end of Phase 4 the product had strong tools attached to the wrong
places. The engine, the opening explorer, the tablebase probe, the structural
feature panel and the companion all existed, but each one had been wired into
Analysis by hand. Studies — the route whose entire purpose is sustained
analysis — had none of them. A repertoire position could not be handed to the
engine. An opening position could not be checked against the database without
first copying a FEN into another route.

Every route had also grown its own board invocation. They agreed on the piece
renderer but not on the surrounding layout, the resize behaviour or which
interactions were allowed, which is how Studies ended up with a board that did
not track the selected node.

The obvious fix — give each route its own copy of the panels — is what
produced the problem in the first place.

## Decision

Two seams, both deliberately thin.

**`ChessWorkspaceProvider`** reads the analysis store and publishes the tree,
the cursor, the FEN, the orientation and the document. It owns no chess state
of its own. It is a view onto the store that already exists, not a second game
state system, because two sources of position truth is exactly the bug class
this phase set out to remove.

The context deliberately does **not** carry the board's surface mode. An
earlier version derived it from the pathname and the document kind, which made
a game opened from Games read-only in Analysis and silently removed the
ability to add a variation to your own game. Whether a surface is interactive
is a property of the surface, so the surface declares it.

**`WorkspaceToolDock`** renders the tools for a named workspace from a single
table. Adding a tool to Studies is now an entry in that table rather than a
new panel tree. Tools read the workspace context; none of them keep a position
of their own, so none of them can drift from the board.

`CanonicalBoardSurface` is the one full-size board pipeline. Its modes are
`interactive`, `read-only`, `preview` and `training`; coordinate maths,
orientation and piece placement are shared across all of them.

## Consequences

Studies, Openings, Repertoire, Preparation, Training and Analysis draw the
same board and offer the same research tools, with per-route tool sets and a
per-route remembered tab.

Inactive tools are unmounted rather than hidden, so a collapsed dock issues no
database queries and starts no engine.

The cost is a table that has to be maintained: a tool that is added to the
registry but not to a route's list will simply not appear there, and nothing
will fail loudly. That is an acceptable trade for removing six divergent panel
trees, but it is the thing to check first when a tool is missing somewhere.
