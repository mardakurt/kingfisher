# Workspace tabs

Phase 83. The owner's brief: open several working tabs — a position, an
analysis, a preparation, a database — switch between them, and have each keep
its state, as the announced ChessBase for Mac does in a strip under the
window's title.

## What a tab is

A tab is a **place** and, when the place has a board, the **board's work**.

- The place is the route and its query (`/games?q=Carlsen`, `/preparation`).
  Anything a page keeps in its address comes back with the tab.
- The board's work is the analysis document: the tree, the cursor, the
  orientation, which document it is (untitled, a chapter, a database game) and
  whether it held edits not yet written to that document.

There is one analysis store and one board, as there has always been
(`AGENTS.md`, "One board"). Only the **active** tab's work is in the store. An
inactive tab's work is a snapshot, taken when the tab was left and put back
with `openDocument` when it is entered again. Two tabs never share a tree, and
no second store exists that a component could read by mistake.

## Where it is kept

- The **list** of tabs — id, place, title, order, which is active — is view
  state, kept in `localStorage` under `kingfisher.workspace-tabs`, like the
  workspace layout.
- An inactive tab's **board work** is authored work, so it goes where the
  active draft goes: the `drafts` store, under the id `tab:<id>`. That store is
  already in `PORTABLE_STORES`, so a backup carries every tab's unsaved
  analysis, and no schema migration is needed. A `tab:` draft that no tab in
  the list names — after a restore, or a cleared `localStorage` — is offered
  back as a tab on startup rather than left invisible.
- The active tab's work is the existing `active` draft. Entering a tab (or
  opening a new one) writes that draft at once, before the tab's own copy is
  removed — left to autosave's debounce, a reload in the gap put the previous
  tab's board back and lost this one's work, which is what the first version
  of `e2e/workspace-tabs.spec.ts` caught. Autosave also treats every open as a
  new document (`generation`), since two untitled analyses look identical.
  The launch rules (Phase 72: a fresh launch holds the draft) are unchanged.
- A switch waits for the page load's draft restore to settle
  (`workspaceRestored`), so a tab clicked in the moment after a reload cannot
  file an empty board as its work.

## Leaving a tab with unsaved chapter edits

Autosave is debounced, so a person can leave a study chapter a moment after
editing it. The snapshot records that the work was not yet saved, and the
chapter is reopened as unsaved when the tab is entered, so autosave writes it
then — through the same revision check, so a chapter changed meanwhile by
another window is reported as a conflict, never overwritten. Closing a tab
that holds unsaved chapter edits asks first.

## Interaction

- The strip sits under the page header on every route, full width, with the
  tabs sharing it equally up to a comfortable maximum, and **+** at its end.
- The sidebar navigates _within_ the current tab, as a browser's address bar
  does. **+** opens a new tab on a fresh analysis board.
- A tab closes with its ×, a middle click, or the command palette. The last
  tab cannot be closed; it is where the application is.
- The title is the page's own: `Analysis: <document>`, `Library`,
  `Preparation against <opponent>`. A route that knows a better title than its
  section name publishes it with `useTabTitle`.
- Commands: _New tab_, _Close tab_, _Next tab_, _Previous tab_, _Duplicate
  tab_, reachable from the palette; the Mac application binds ⌘T, ⌘W and
  ⌃Tab in its menu.
- At most twelve tabs. A thirteenth would leave each tab too narrow to name
  what it holds; the command says so rather than opening a tab nobody can read.

## What it deliberately does not do

- It does not keep a separate engine per tab. The engine follows the board, as
  it always has; a search running in a tab that is left is stopped by the
  existing position guard.
- It does not preserve every page's scroll position or unsubmitted form. What
  a page keeps in its address survives a switch; the Library keeps its search
  and filters there for that reason.
