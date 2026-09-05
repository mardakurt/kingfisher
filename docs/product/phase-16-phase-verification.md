# Phases 1–15, capability by capability

What each phase built, the invariant that has to keep holding, and where the
evidence for it lives. This is the map to consult before changing something:
if a row's invariant is what your change would break, the tests named in that
row are the ones that should fail first.

Status values mean exactly this:

- **Held** — the invariant is asserted by the evidence named, and that evidence
  passed on the run recorded in the Phase 16 handover.
- **Held (repaired)** — the invariant was found broken during Phase 16 and the
  fix commit is named.

Nothing here is marked verified on the strength of an earlier report.

---

## Phase 1 — the chess domain

| Capability                      | Implementation                       | Invariant                                                                                            | Unit evidence                                         | Browser evidence                   | Status              | Regression                                                          | Fix                 |
| ------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------- | ------------------- | ------------------------------------------------------------------- | ------------------- |
| Legal moves, SAN, UCI           | `src/chess/position.ts`              | One rules implementation; `position.ts` is the only importer of `chess.js`                           | `position.test.ts`, `advance.test.ts`, `fuzz.test.ts` | `kingfisher.spec.ts`               | Held                | —                                                                   | —                   |
| FEN parsing                     | `src/chess/fen.ts`                   | Kingfisher's parser is stricter than the library beneath it; an impossible castling claim is refused | `fen.test.ts`, `variant-contract.test.ts`             | `phase14.spec.ts` (position setup) | **Held (repaired)** | `4k3/8/8/8/8/8/8/R4K1R w KQ` offered `O-O-O` and moved neither rook | `e83a9be`, ADR 0047 |
| Castling, en passant, promotion | `src/chess/position.ts`              | A castling right is a claim about where two pieces stand, and is checked                             | `variant-contract.test.ts`, `fuzz.test.ts`            | `kingfisher.spec.ts`               | Held (repaired)     | as above                                                            | `e83a9be`           |
| Repetition, fifty-move          | `src/chess/game.ts`                  | Threefold is counted along the line, not the tree                                                    | `fuzz.test.ts`, `advance.test.ts`                     | `reliability.spec.ts`              | Held                | —                                                                   | —                   |
| Standard chess only             | `src/chess/variant-contract.test.ts` | Never offer a move it cannot legally make; refuse rather than guess                                  | `variant-contract.test.ts`                            | —                                  | Held                | —                                                                   | —                   |

## Phase 2 — the game tree, PGN and persistence

| Capability          | Implementation                  | Invariant                                                            | Unit evidence                                      | Browser evidence                                              | Status | Regression | Fix |
| ------------------- | ------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------- | ------ | ---------- | --- |
| Immutable move tree | `src/chess/tree/tree.ts`        | Edits produce a new tree; a node knows the position it was played in | `tree` tests, `src/performance/large-tree.test.ts` | `phase7.spec.ts` (1,000-node), `phase8.spec.ts` (20,000-node) | Held   | —          | —   |
| PGN import/export   | `src/chess/pgn/`                | Comments, NAGs and nested variations survive a round trip            | `pgn` tests                                        | `kingfisher.spec.ts`                                          | Held   | —          | —   |
| Autosave and drafts | `src/persistence/autosave.ts`   | A draft is written before the document, so a crash costs the draft   | `autosave.test.ts`                                 | `reliability.spec.ts`                                         | Held   | —          | —   |
| Study chapters      | `src/persistence/repositories/` | Authored work survives reload                                        | repository tests                                   | `phase7.spec.ts`, `reliability.spec.ts`                       | Held   | —          | —   |

## Phase 3 — repertoire, training, IndexedDB at scale

| Capability                      | Implementation                         | Invariant                                                 | Unit evidence                                | Browser evidence                                | Status | Regression | Fix |
| ------------------------------- | -------------------------------------- | --------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------- | ------ | ---------- | --- |
| Canonical position identity     | `src/chess/fen.ts` `positionKey`       | Two move orders reaching a position are the same position | `repertoire.test.ts`, `transpositions` tests | `phase9.spec.ts` ("shared by every move order") | Held   | —          | —   |
| Repertoire by position          | `src/repertoire/`                      | A decision is keyed by position, not by move sequence     | `repertoire.test.ts`                         | `phase9.spec.ts`                                | Held   | —          | —   |
| Deterministic training schedule | `src/training/`                        | The same answers produce the same schedule                | training tests                               | `phase10.spec.ts`                               | Held   | —          | —   |
| IndexedDB migrations            | `src/persistence/schema/migrations.ts` | Forward-only, every historical version has a fixture      | migration tests                              | `reliability.spec.ts`                           | Held   | —          | —   |

## Phase 4–5 — explorer, providers, opening classification

| Capability              | Implementation                    | Invariant                                                         | Unit evidence                                         | Browser evidence                                   | Status              | Regression                                                   | Fix       |
| ----------------------- | --------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------- | ------------------- | ------------------------------------------------------------ | --------- |
| Provider abstraction    | `src/database/providers/`         | Every source answers the same shape; provenance is never lost     | `lichess.test.ts`, `persistent-local.test.ts`         | `reference-sources.spec.ts`                        | Held                | —                                                            | —         |
| Remote failure handling | `src/database/retry.ts`           | A remote failure offers the local source, never blanks evidence   | `retry.test.ts`, `lichess.test.ts`                    | `reference-sources.spec.ts`, `reliability.spec.ts` | **Held (repaired)** | Fetching a game by id had no deadline; a stall never settled | `3c9943f` |
| Opening classification  | `src/theory/`                     | Names come from the licensed dataset; nothing is invented past it | `openings.test.ts`, `opening-index.generated.test.ts` | `fresh-user.spec.ts`                               | Held                | —                                                            | —         |
| Explorer aggregates     | `src/database/local-aggregate.ts` | Filtered cells are exact, not estimated                           | `local-index.test.ts`, `cache.test.ts`                | `kingfisher.spec.ts`                               | Held                | —                                                            | —         |

## Phase 6 — engines and the companion

| Capability           | Implementation                                                    | Invariant                                                                                | Unit evidence                                                    | Browser evidence                                                           | Status              | Regression                                                                | Fix       |
| -------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------- | --------- |
| UCI session          | `src/engine/uci-session.ts`                                       | No result may be attributed to a position it was not computed for                        | `uci-session.test.ts`, `uci-adversarial.test.ts`                 | `reliability.spec.ts` ("stopped and restarted leaves no stale evaluation") | **Held (repaired)** | Unacknowledged stop reused the process; a crash never reached the session | `62428e8` |
| Transport liveness   | `src/engine/companion/transport.ts`, `stockfish/worker-client.ts` | A dead engine fails its waiters at once, not at the timeout                              | `transport-liveness.test.ts`                                     | —                                                                          | **Held (repaired)** | Waiters could not be woken; the queue stalled 10–20 s                     | `62428e8` |
| Engine panel failure | `src/stores/engine-store.ts`                                      | A dead engine shows an error, never "analysing" for ever                                 | `engine-store.test.ts`                                           | `reliability.spec.ts`                                                      | **Held (repaired)** | The queue marked its job failed; the interactive panel did not            | `c6e0b4e` |
| Capability rows      | `companion/src/engine-verify.mjs`                                 | Produced by interrogation, never inferred from a name                                    | `engine-verify` tests                                            | `engines.spec.ts`                                                          | Held                | —                                                                         | —         |
| Managed engine trust | `src/engine/trust.ts`, `companion/src/managed-engines.mjs`        | Digest-verified, single named member extracted, no shell; **not sandboxed**, and said so | `trust.test.ts`, `managed-engines.test.mjs`, `security.test.mjs` | `engines.spec.ts`                                                          | Held                | —                                                                         | ADR 0041  |

## Phase 7 — speed and scale

| Capability            | Implementation                                | Invariant                                                  | Unit evidence               | Browser evidence                         | Status | Regression | Fix |
| --------------------- | --------------------------------------------- | ---------------------------------------------------------- | --------------------------- | ---------------------------------------- | ------ | ---------- | --- |
| Worker PGN import     | `src/persistence/pgn-import.worker.ts`        | Cancelling keeps whole games and never duplicates on retry | `pgn-worker-client.test.ts` | `phase7.spec.ts`, `reliability.spec.ts`  | Held   | —          | —   |
| Worker lifecycle      | `persistent-local.ts`, `pgn-worker-client.ts` | No worker outlives its task                                | —                           | `phase7.spec.ts`, `soak.spec.ts`         | Held   | —          | —   |
| Background analysis   | `src/features/analysis-queue/`                | Pauses for interactive work; progress is resumable         | queue tests                 | `phase7.spec.ts`                         | Held   | —          | —   |
| Large tree navigation | `src/features/movetree/flatten.ts`            | A 20,000-node tree stays navigable                         | `large-tree.test.ts`        | `phase8.spec.ts` (126 ms End/Home/Right) | Held   | —          | —   |

## Phase 8 — study, review and research

| Capability                  | Implementation                        | Invariant                                           | Unit evidence                         | Browser evidence                        | Status              | Regression                 | Fix       |
| --------------------------- | ------------------------------------- | --------------------------------------------------- | ------------------------------------- | --------------------------------------- | ------------------- | -------------------------- | --------- |
| Self-analysis before reveal | `src/features/review/`                | Evidence is withheld until the player has committed | review tests                          | `phase8.spec.ts`, `phase10.spec.ts` §14 | Held                | ADR 0025, 0034             | —         |
| Decision journal            | `src/persistence/repositories/`       | A recorded decision is the one entered              | `phase9-entities.test.ts`             | `phase8.spec.ts`                        | Held                | —                          | —         |
| Structure and theme search  | `src/chess/structure.ts`, `themes.ts` | Deterministic from the position, not learned        | `structure.test.ts`, `themes.test.ts` | `phase8.spec.ts`                        | Held                | —                          | —         |
| Transpositions panel        | `src/repertoire/transpositions.ts`    | Lists only stored move orders                       | `transpositions` tests                | `reliability.spec.ts`                   | **Held (repaired)** | Went stale after an import | `7abc6bb` |

## Phase 9 — preparation and scale

| Capability                  | Implementation               | Invariant                                                        | Unit evidence             | Browser evidence | Status              | Regression                                           | Fix       |
| --------------------------- | ---------------------------- | ---------------------------------------------------------------- | ------------------------- | ---------------- | ------------------- | ---------------------------------------------------- | --------- |
| Preparation sessions        | `src/preparation/`           | A session carries an opponent through to a game-day sheet        | preparation tests         | `phase9.spec.ts` | Held                | —                                                    | —         |
| Calculation before evidence | `src/features/calculation/`  | Every source of evidence is hidden until lines are submitted     | calculation tests         | `phase9.spec.ts` | Held                | ADR 0030                                             | —         |
| Player search at scale      | `companion/src/database.mjs` | Latency is stable, not merely median-fast                        | `bench-player-search.mjs` | —                | **Held (repaired)** | The reported p95 was the cold first query relabelled | `b201a07` |
| Endgame library             | `src/features/endgame/`      | Stores what the player chose, with tablebase eligibility counted | endgame tests             | `phase9.spec.ts` | Held                | —                                                    | —         |

## Phase 10 — the workspace

| Capability               | Implementation                                     | Invariant                                                       | Unit evidence    | Browser evidence                             | Status | Regression | Fix      |
| ------------------------ | -------------------------------------------------- | --------------------------------------------------------------- | ---------------- | -------------------------------------------- | ------ | ---------- | -------- |
| One universal board      | `src/features/workspace/CanonicalBoardSurface.tsx` | Every surface renders the same board on the workspace position  | —                | `phase10.spec.ts` (per-route assertions)     | Held   | —          | ADR 0033 |
| Tool dock and layouts    | `src/features/workspace/`                          | Tabs, pinning and presets survive reload and device change      | layout tests     | `phase10.spec.ts`                            | Held   | —          | —        |
| Keyboard rebinding       | `src/features/shell/`                              | A rebind changes what the key does, not just what is documented | keybinding tests | `phase10.spec.ts` §37–39                     | Held   | —          | —        |
| Settings carry no secret | `src/features/shell/SettingsDialog.tsx`            | Exported settings contain no token                              | —                | `phase10.spec.ts` §21, `reliability.spec.ts` | Held   | —          | —        |

## Phase 11 — online accounts

| Capability           | Implementation                           | Invariant                                                                    | Unit evidence          | Browser evidence           | Status                | Regression                                                             | Fix       |
| -------------------- | ---------------------------------------- | ---------------------------------------------------------------------------- | ---------------------- | -------------------------- | --------------------- | ---------------------------------------------------------------------- | --------- |
| Lichess OAuth (PKCE) | `src/database/providers/lichess-pkce.ts` | The verifier never outlives the single-use code; no token in logs or backups | `lichess-pkce.test.ts` | `kingfisher.spec.ts`       | **Held (repaired)**   | The callback's identity fetch had no deadline — "Connecting…" for ever | `3c9943f` |
| Account sync         | `src/sync/account-sync.ts`               | A second sync imports nothing and says so                                    | `account-sync.test.ts` | `phase11.spec.ts` §23      | Held                  | —                                                                      | —         |
| Chess.com archives   | `src/sync/`                              | Walks published monthly archives; rate limiting is reported as such          | sync tests             | `phase11.spec.ts` §20, §25 | Held (fixture-tested) | —                                                                      | —         |
| Position report      | `src/features/position-report/`          | Cites its evidence or says why it cannot                                     | report tests           | `phase11.spec.ts` §36      | Held                  | —                                                                      | ADR 0037  |

## Phase 12 — database operations

| Capability                   | Implementation                           | Invariant                                                               | Unit evidence                              | Browser evidence                        | Status | Regression | Fix      |
| ---------------------------- | ---------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------- | ------ | ---------- | -------- |
| Copy / move / merge / dedupe | `src/database/collections/operations.ts` | **The source is never deleted until the destination confirms the copy** | `operations.test.ts`, `round-trip.test.ts` | `phase8.spec.ts`, `reliability.spec.ts` | Held   | —          | —        |
| Partial move honesty         | `operations.ts`                          | Games in both collections are reported, not hidden                      | `operations.test.ts`                       | —                                       | Held   | —          | —        |
| Cross-database search        | `src/database/collections/federated.ts`  | Sources are never silently merged                                       | `federated.test.ts`                        | `phase8.spec.ts`                        | Held   | —          | —        |
| Integrity and repair         | `src/persistence/integrity.ts`           | Finds a planted orphan; repair is safe                                  | `integrity.test.ts`                        | `reliability.spec.ts`                   | Held   | —          | ADR 0020 |

## Phase 13 — out of the box

| Capability                       | Implementation                        | Invariant                                                         | Unit evidence                                        | Browser evidence                                           | Status          | Regression                             | Fix                            |
| -------------------------------- | ------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------- | --------------- | -------------------------------------- | ------------------------------ |
| Works with nothing installed     | `public/reference/kingfisher-starter` | Explorer, players, model games and engine work on a fresh profile | pack tests                                           | `fresh-user.spec.ts` (incl. "did none of it by importing") | Held            | —                                      | —                              |
| Fifteen moves on a fresh profile | starter pack                          | A mainstream line is answered fifteen full moves deep             | `bench-explorer-depth.mjs`                           | `fresh-user.spec.ts`                                       | Held            | —                                      | —                              |
| Reference packs                  | `src/reference/`                      | Installed, not served; verified; reclaimable                      | `pack.test.ts`, `install.test.ts`, `manager.test.ts` | `reference-sources.spec.ts`                                | Held (repaired) | Pack went stale and grew without bound | `57dfece`, `9b401d9`, ADR 0039 |

## Phase 14 — the professional finish

| Capability          | Implementation                 | Invariant                                          | Unit evidence              | Browser evidence                          | Status          | Regression  | Fix       |
| ------------------- | ------------------------------ | -------------------------------------------------- | -------------------------- | ----------------------------------------- | --------------- | ----------- | --------- |
| Position setup      | `src/features/position-setup/` | Validates, and refuses an impossible position      | `variant-contract.test.ts` | `phase14.spec.ts`                         | Held (repaired) | see Phase 1 | `e83a9be` |
| PV preview          | `src/features/analysis/`       | Advances without moving the main board             | pv tests                   | `phase14.spec.ts`                         | Held            | —           | ADR 0044  |
| Play from here      | `src/features/play/`           | Isolated until "Analyze after"                     | play tests                 | `phase14.spec.ts`                         | Held            | —           | ADR 0044  |
| Visual system       | `e2e/visual.spec.ts`           | Compositions are gated per platform                | —                          | `visual.spec.ts` (Linux baselines in CI)  | Held            | —           | —         |
| Board sizing policy | `CanonicalBoardSurface.tsx`    | The board takes the room it is given, at any width | `board-size` tests         | `viewports.spec.ts`, `kingfisher.spec.ts` | Held            | —           | ADR 0040  |

## Phase 15 — engines, packs and depth

| Capability                     | Implementation                   | Invariant                                                          | Unit evidence                 | Browser evidence            | Status              | Regression                                           | Fix       |
| ------------------------------ | -------------------------------- | ------------------------------------------------------------------ | ----------------------------- | --------------------------- | ------------------- | ---------------------------------------------------- | --------- |
| Engine fleet                   | `src/engine/registry.ts`         | Ten engines, each interrogated; a CPU-appropriate binary is chosen | `registry.test.ts`            | `engines.spec.ts`           | Held (repaired)     | The system engine was never interrogated             | `5df63ce` |
| Searchmoves honesty            | `src/engine/uci-session.ts`      | A search the engine did not run is never presented                 | `uci-session.test.ts`         | —                           | Held                | —                                                    | `6897e09` |
| Reference indexing to 20 moves | `scripts/reference/`             | Positions indexed to ply 41                                        | `pipeline.test.mjs`           | `reference-sources.spec.ts` | Held                | —                                                    | —         |
| Opening name inheritance       | `src/theory/openings.ts`         | A deep position keeps the last named opening; no name is invented  | `openings.test.ts`            | `variation-brief.spec.ts`   | Held                | —                                                    | —         |
| Variation briefs               | `src/theory/variation-briefs.ts` | Authored at build time; never generated at runtime                 | `variation-briefs.test.ts`    | `variation-brief.spec.ts`   | Held                | —                                                    | —         |
| Backup completeness            | `src/persistence/backup.ts`      | Every store holding authored work round-trips                      | `backup-completeness.test.ts` | `reliability.spec.ts`       | **Held (repaired)** | Six stores of authored work were absent from backups | `53f21bb` |
| Pack metadata in backups       | `src/persistence/backup.ts`      | A restore says which sources were installed, without carrying them | `backup.test.ts`              | `reference-sources.spec.ts` | Held                | —                                                    | `266b3d2` |

---

## How to use this

Before changing something, find the row. If the invariant in that row is what
your change would alter, the evidence named there should fail — and if it does
not, the evidence is the thing to fix first.

Eight rows say **Held (repaired)**. Every one of those was a capability an
earlier phase reported as working, and every one was found by asking for the
evidence rather than by reading the report.
