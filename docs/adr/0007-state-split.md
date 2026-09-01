# 0007 — Four stores plus a query cache

**Status:** Accepted

## Context

One global store is the default outcome and the wrong one: every engine `info`
update would invalidate selectors watching the game tree, and persistence would
have to filter out three quarters of the state.

Splitting per component is the opposite failure — the game tree would end up
duplicated in several places.

## Decision

Split by what the state _is_.

| Store               | Holds                                                | Persisted    |
| ------------------- | ---------------------------------------------------- | ------------ |
| `analysis-store`    | Game tree, cursor, orientation, undo/redo            | No           |
| `engine-store`      | Engine status, identity, latest analysis snapshot    | No           |
| `ui-store`          | Dialog and palette visibility, active panel, notices | No           |
| `preferences-store` | Themes, board and piece sets, engine defaults        | localStorage |

Two rules:

1. **The tree and the cursor stay together.** They are not independent — a
   deletion moves the cursor, an undo restores both — and keeping two stores in
   sync on every edit is the class of bug that corrupts a game.
2. **Derived values are never stored.** Current position, legal destinations,
   main line and displayed evaluation are all computed from the tree.

Server and cache state stays out of Zustand entirely: explorer lookups go
through TanStack Query, keyed by position and filters.

The engine session object lives in a module-level variable, not in a store. It
owns a Web Worker, it is not serialisable, and nothing should re-render because
a pointer to it changed.

## Consequences

- A running engine re-renders the engine panel and the evaluation bar, not the
  move tree.
- Persistence is one small store with an explicit `partialize`.
- Evaluations written into the tree bypass the undo history deliberately;
  otherwise an engine would fill it with entries the user never made.
- Cost: four imports instead of one in components that touch several categories.
  Worth it.
