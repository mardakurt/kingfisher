# Architecture decision records

Short notes on decisions that were not obvious, kept so that a future reader
(including a future us) can tell the difference between a considered choice and
an accident.

Format: context, decision, consequences. One file per decision, numbered in the
order taken. Superseded records stay, marked as such.

| #                                                          | Decision                                                       | Status   |
| ---------------------------------------------------------- | -------------------------------------------------------------- | -------- |
| [0001](0001-stack-and-shell.md)                            | Next.js App Router for a client-heavy workspace                | Accepted |
| [0002](0002-own-move-tree-and-pgn.md)                      | Own game tree and PGN implementation                           | Accepted |
| [0003](0003-own-board-renderer.md)                         | Own board renderer behind an internal interface                | Accepted |
| [0004](0004-engine-architecture.md)                        | Engine behind a provider interface; WASM fetched at setup      | Accepted |
| [0005](0005-move-classification.md)                        | No move classifier in Phase 1                                  | Accepted |
| [0006](0006-database-providers.md)                         | One database interface, real implementations only              | Accepted |
| [0007](0007-state-split.md)                                | Four stores plus a query cache                                 | Accepted |
| [0008](0008-local-persistence.md)                          | IndexedDB behind repositories, no dependency, migrations       | Accepted |
| [0009](0009-canonical-position-identity.md)                | Canonical position key for the local index                     | Accepted |
| [0010](0010-position-keyed-repertoires.md)                 | Position-keyed repertoires and explicit opponent replies       | Accepted |
| [0011](0011-deterministic-training-schedule.md)            | Deterministic, legible spaced repetition                       | Accepted |
| [0012](0012-transactional-workspace-backups.md)            | Versioned transactional local backup                           | Accepted |
| [0013](0013-large-local-database-queries.md)               | Summary paging, adaptive joins and Worker exploration          | Accepted |
| [0014](0014-counting-a-filtered-page.md)                   | A page reports `hasMore`; a total is opt-in                    | Accepted |
| [0015](0015-native-companion.md)                           | An optional local companion for engines and SQLite             | Accepted |
| [0016](0016-grounded-assistant.md)                         | The assistant is given evidence, not asked what it knows       | Accepted |
| [0017](0017-shared-workspace-and-tool-dock.md)             | One workspace context, one tool dock, one board surface        | Accepted |
| [0018](0018-provider-health-and-lichess-authentication.md) | Typed provider health; Lichess as an authenticated source      | Accepted |
| [0019](0019-document-revisions-and-tab-conflicts.md)       | Chapter revisions; cross-tab conflicts detected, never merged  | Accepted |
| [0020](0020-integrity-checks-and-safe-repair.md)           | Integrity rules state facts; repair only removes dead pointers | Accepted |
| [0021](0021-pgn-worker-pipeline.md)                        | One PGN grammar, run in a Worker behind acknowledged batches   | Accepted |
| [0022](0022-background-analysis-scheduling.md)             | One background engine; the foreground wins; final answers only | Accepted |
| [0023](0023-explorer-position-aggregates.md)               | A derived aggregate table for the unfiltered explorer          | Accepted |
