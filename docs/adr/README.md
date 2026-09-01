# Architecture decision records

Short notes on decisions that were not obvious, kept so that a future reader
(including a future us) can tell the difference between a considered choice and
an accident.

Format: context, decision, consequences. One file per decision, numbered in the
order taken. Superseded records stay, marked as such.

| #                                     | Decision                                                  | Status   |
| ------------------------------------- | --------------------------------------------------------- | -------- |
| [0001](0001-stack-and-shell.md)       | Next.js App Router for a client-heavy workspace           | Accepted |
| [0002](0002-own-move-tree-and-pgn.md) | Own game tree and PGN implementation                      | Accepted |
| [0003](0003-own-board-renderer.md)    | Own board renderer behind an internal interface           | Accepted |
| [0004](0004-engine-architecture.md)   | Engine behind a provider interface; WASM fetched at setup | Accepted |
| [0005](0005-move-classification.md)   | No move classifier in Phase 1                             | Accepted |
| [0006](0006-database-providers.md)    | One database interface, real implementations only         | Accepted |
| [0007](0007-state-split.md)           | Four stores plus a query cache                            | Accepted |
