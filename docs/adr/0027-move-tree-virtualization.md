# 0027. Virtualize the move tree, after measuring that it needed it

Status: Accepted

## Context

Phase 7 measured a 1,000-node chapter and found it comfortable, and deliberately
did not virtualize on that evidence. Virtualization is not free in a move tree:
it is not a flat list, and the things that make a tree readable — nested
variations, variable-height comments, branch connectors, context menus,
keyboard navigation — are exactly the things a naive windowing implementation
destroys.

So Phase 8 built the case first: a realistic ~20,000-node analysis tree with
2,000 branches distributed through the main line and periodic comments, then
profiled initial render, scroll, move navigation, branch expansion, comment
editing, and save/reload.

## Decision

**Flatten once, mount a window.** The tree is flattened into an ordered row
list in a single pass, memoized on the tree; rendering mounts only the rows in
view plus an overscan margin. Row heights vary, and the flattening records
enough about each row for the window to be placed without mounting the rows
above it.

**Chess readability is a constraint, not a trade-off.** Nesting depth,
connectors, comments and NAGs render as they did. A benchmark that turned the
tree into a flat move list would be green and useless.

**Navigation does not depend on mounting.** `←`, `→`, `↑`, `↓`, `Home` and `End`
operate on the flattened order and scroll the target into view, so focus
navigation never requires the invisible nodes between here and there to exist
in the DOM. This is the property that actually decides whether a large tree is
usable, and it is asserted directly.

## Consequences

Measured in the browser on a 20,000-node branched study:

| step                            | measured |
| ------------------------------- | -------- |
| create and save the chapter     | 61 ms    |
| reload and render               | 213 ms   |
| `End`, `Home`, `→` in sequence  | 177 ms   |

Fewer than 100 list items are mounted at any time, against 20,000 rows.

The flattening pass is the new cost and it runs on every tree change. It is a
single linear walk over nodes that already exist in memory, and it is memoized,
so an edit pays it once rather than once per rendered row.

A row's height must be known or estimated before it is mounted, so a comment
whose wrapped height differs from the estimate can cause a small scroll
adjustment as it comes into view. That is visible only while scrolling
extremely long comment runs, and is the accepted cost of not measuring 20,000
rows up front.
