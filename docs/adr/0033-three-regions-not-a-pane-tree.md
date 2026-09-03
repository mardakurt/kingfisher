# 0033. Three regions, not a pane tree

Status: Accepted

## Context

Nine phases put fourteen tools in a workspace, all of them in one place: a
right-hand dock with a horizontally scrolling tab strip. On Analysis that was
thirteen equally weighted tabs, the last five off-screen behind a scrollbar
most people never noticed, and a player who wanted the engine below the board
instead of beside it had no way to say so.

The obvious answer is a docking system: draggable panes, a splitter tree,
arbitrary nesting, tab groups anywhere. Every professional IDE has one.

The obvious answer is wrong here, and it is worth being precise about why
rather than just asserting taste.

A pane tree makes the set of reachable layouts unbounded. Unbounded layouts
cannot be tested — you can test that the splitter works, but not that the
result is a usable chess workspace, because most of the states are not. They
also make it easy to produce a layout nobody wants: the single most valuable
thing on screen is the board, and a system that lets it be dragged to a 180px
corner will eventually put it there, usually by accident, usually while the
user was trying to do something else. Recovery then depends on the user
knowing there is a reset, which is the state Phase 9 shipped in and the
complaint that opened Phase 10.

Kingfisher is chess software. The user's goal is to look at a position, not to
arrange an environment.

## Decision

A workspace is a **board plus three named regions**: a side dock, an optional
lower panel, and the board column. Every non-board module declares a home
region and the regions it may be moved to; the board is not a placement at all.

No floating windows, no nesting, no arbitrary drop targets, two resize handles.

A layout is a plain record — a sparse map of module to region, a selected
module per region, and two sizes. Sparse on purpose: a module absent from the
map sits in its declared home, so adding a module in a later phase does not
require a migration of every saved layout to mention it.

Moving a panel is offered as a **menu item**, not only as a drag. "Move Engine
to the lower panel" is discoverable, works from the keyboard, works on a
touchscreen, and reads correctly to a screen reader; drag-and-drop is none of
those things and would have been the only way in.

## Consequences

The set of reachable layouts is small enough to enumerate, which is why the
Phase 10 E2E suite can cover the composer at all: move a panel, reload, assert
it is where it was left, reset, assert the default is back.

The board cannot be shrunk by rearrangement, because it cannot be rearranged.
This turned out to matter within a day: the first version of this design put
the movable lower panel _below_ the existing fixed move tree, which stacked two
210px blocks under the board and took it from 490px to 277px on a 1440x900
screen. The fix was to make the move tree the lower panel's default occupant
rather than its neighbour — so the default layout is unchanged, moving the
engine down puts it in a tab beside the move tree, and moving the move tree
away gives its height back. A Playwright test now holds the board above 400px
at that viewport, because this is exactly the kind of regression that arrives
as a side effect of an unrelated change.

Users who want a genuinely free-form environment do not get one. That is the
trade, taken deliberately.

Layouts are stored per device class (`desktop` / `compact`) rather than per
pixel width, split at the 1100px breakpoint the dock already used. A phone
cannot honour a three-region arrangement and does not try: modules placed in
the lower panel fold into the single bottom sheet. They stay _visible_ in the
tab strip rather than being pushed into the overflow menu — on a desktop they
had a panel of their own, and demoting the move tree to a menu entry because
the screen got narrower loses it where it is hardest to find again.

Reset removes the stored entry rather than writing the default into it, so an
untouched workspace and a reset one are the same thing. Writing an explicit
"this is the default" record is how saved layouts start silently pinning
themselves to a default the application has since moved on from.
