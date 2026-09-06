# Architecture decision records

Short notes on decisions that were not obvious, kept so that a future reader
(including a future us) can tell the difference between a considered choice and
an accident.

Format: context, decision, consequences. One file per decision, numbered in the
order taken. Superseded records stay, marked as such.

| #                                                                 | Decision                                                         | Status   |
| ----------------------------------------------------------------- | ---------------------------------------------------------------- | -------- |
| [0001](0001-stack-and-shell.md)                                   | Next.js App Router for a client-heavy workspace                  | Accepted |
| [0002](0002-own-move-tree-and-pgn.md)                             | Own game tree and PGN implementation                             | Accepted |
| [0003](0003-own-board-renderer.md)                                | Own board renderer behind an internal interface                  | Accepted |
| [0004](0004-engine-architecture.md)                               | Engine behind a provider interface; WASM fetched at setup        | Accepted |
| [0005](0005-move-classification.md)                               | No move classifier in Phase 1                                    | Accepted |
| [0006](0006-database-providers.md)                                | One database interface, real implementations only                | Accepted |
| [0007](0007-state-split.md)                                       | Four stores plus a query cache                                   | Accepted |
| [0008](0008-local-persistence.md)                                 | IndexedDB behind repositories, no dependency, migrations         | Accepted |
| [0009](0009-canonical-position-identity.md)                       | Canonical position key for the local index                       | Accepted |
| [0010](0010-position-keyed-repertoires.md)                        | Position-keyed repertoires and explicit opponent replies         | Accepted |
| [0011](0011-deterministic-training-schedule.md)                   | Deterministic, legible spaced repetition                         | Accepted |
| [0012](0012-transactional-workspace-backups.md)                   | Versioned transactional local backup                             | Accepted |
| [0013](0013-large-local-database-queries.md)                      | Summary paging, adaptive joins and Worker exploration            | Accepted |
| [0014](0014-counting-a-filtered-page.md)                          | A page reports `hasMore`; a total is opt-in                      | Accepted |
| [0015](0015-native-companion.md)                                  | An optional local companion for engines and SQLite               | Accepted |
| [0016](0016-grounded-assistant.md)                                | The assistant is given evidence, not asked what it knows         | Accepted |
| [0017](0017-shared-workspace-and-tool-dock.md)                    | One workspace context, one tool dock, one board surface          | Accepted |
| [0018](0018-provider-health-and-lichess-authentication.md)        | Typed provider health; Lichess as an authenticated source        | Accepted |
| [0019](0019-document-revisions-and-tab-conflicts.md)              | Chapter revisions; cross-tab conflicts detected, never merged    | Accepted |
| [0020](0020-integrity-checks-and-safe-repair.md)                  | Integrity rules state facts; repair only removes dead pointers   | Accepted |
| [0021](0021-pgn-worker-pipeline.md)                               | One PGN grammar, run in a Worker behind acknowledged batches     | Accepted |
| [0022](0022-background-analysis-scheduling.md)                    | One background engine; the foreground wins; final answers only   | Accepted |
| [0023](0023-explorer-position-aggregates.md)                      | A derived aggregate table for the unfiltered explorer            | Accepted |
| [0024](0024-structural-position-identity.md)                      | Pawn-skeleton key and structure signature, both deterministic    | Accepted |
| [0025](0025-self-analysis-before-reveal.md)                       | Evidence withheld until submission; the record freezes at reveal | Accepted |
| [0026](0026-exact-filtered-explorer-cells.md)                     | Exact year/rating cells for filtered explorer, never buckets     | Accepted |
| [0027](0027-move-tree-virtualization.md)                          | Move-tree virtualization, adopted after measuring 20,000 nodes   | Accepted |
| [0028](0028-rules-engine-experiment.md)                           | Rules-engine replacement measured and rejected; chess.js stays   | Accepted |
| [0029](0029-preparation-sessions-and-the-game-day-sheet.md)       | Sessions reference work; the game-day sheet is owned outright    | Accepted |
| [0030](0030-calculation-before-evidence.md)                       | A calculation tree, and the evidence gate inside the dock        | Accepted |
| [0031](0031-local-tablebases-split.md)                            | Tablebase capability read from files; probing delegated          | Accepted |
| [0032](0032-position-actions-and-research-navigation.md)          | One position-action list; a trail that names its destination     | Accepted |
| [0033](0033-three-regions-not-a-pane-tree.md)                     | Three named regions, not an unbounded pane tree                  | Accepted |
| [0034](0034-concealment-is-subtractive.md)                        | Concealment is a capability no call site can undo                | Accepted |
| [0035](0035-online-accounts-reuse-the-import-pipeline.md)         | A synced game is an imported game, with no second pipeline       | Accepted |
| [0036](0036-a-custom-engine-earns-its-key.md)                     | A custom engine earns its registry key by completing a handshake | Accepted |
| [0037](0037-a-report-cites-or-says-why-not.md)                    | A report cites its sources, or says why it has none              | Accepted |
| [0038](0038-a-managed-probe-helper-not-a-decoder.md)              | A managed Syzygy probe helper, not a decoder of our own          | Accepted |
| [0039](0039-reference-packs-are-installed-not-served.md)          | Reference packs are sharded, verified and installed, not served  | Accepted |
| [0040](0040-board-priority-is-a-policy.md)                        | Board size is a policy over the chrome, never a pixel preference | Accepted |
| [0041](0041-engine-trust-and-the-sandbox-we-do-not-have.md)       | Three engine trust levels; no sandbox is claimed for a binary    | Accepted |
| [0042](0042-pkce-instead-of-a-pasted-token.md)                    | Lichess sign-in through PKCE; supersedes 0018's token decision   | Accepted |
| [0043](0043-a-book-is-not-an-explorer.md)                         | A book states a preference; an explorer counts games             | Accepted |
| [0044](0044-preview-and-practice-state-stays-outside-analysis.md) | Preview and practice state stays outside Analysis                | Accepted |
| [0045](0045-relations-are-pseudo-legal-geometry.md)               | Relations are pseudo-legal geometry                              | Accepted |
| [0046](0046-a-frequency-threshold-that-falls-with-depth.md)       | A pruning threshold that falls with depth, so deep lines survive | Accepted |
| [0047](0047-standard-chess-only-and-the-castling-claim.md)        | Standard chess only; a castling right is a claim, and is checked | Accepted |
| [0048](0048-chess960-needs-a-rules-decision-first.md)             | Chess960 needs a licensing decision before it needs code         | Accepted |
