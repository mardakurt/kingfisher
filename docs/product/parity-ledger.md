# Parity acceptance ledger

_Version 1, frozen 2026-09-26 (Phase 86). The program gate of the parity
program that follows the 2026-09-24 market and product strategy audit. It
maps every P0 and P1 requirement of that audit to its target workflow, the
state verified in this repository, the design, the modules, the data it
depends on, its tests, its evidence and a status. Changing a status or a
criterion needs an entry in §5; changing the comparator baseline needs a
decision record (§2)._

**Statuses**, and nothing else: `not started`, `in progress`, `blocked`,
`partial`, `complete`. There are no percentages and no aggregate score.
`partial` is not `complete`. A row is `complete` only when its acceptance
criteria passed on the real data, hardware, operating system and packaged
product the claim is about.

**Evidence authority.** Every "verified state" names where it comes from,
because these are different things and a lower one does not prove a higher
one:

| Mark    | Authority                                                                                                  |
| ------- | ---------------------------------------------------------------------------------------------------------- |
| **P85** | A run recorded in the Phase 85 handover or `docs/release-evidence/phase-85/`; re-runnable, not re-run here |
| **P86** | Run in Phase 86, recorded in §4 or `docs/release-evidence/phase-86/`                                       |
| **src** | The code exists; nothing in this ledger ran it end to end                                                  |
| **—**   | Nothing exists                                                                                             |

## 1. Release truth, 2026-09-26

Seven authorities, checked separately, not inferred from one another:

| Authority                                | Value                                                                                                                                        | How checked                                             |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `package.json` / `desktop/package.json`  | 1.3.1 / 1.3.1                                                                                                                                | `node -p "require('./package.json').version"`           |
| Public descriptor                        | `src/release/macos-download.json`: 1.3.1, build 856, commit `d04b206`, `Kingfisher-1.3.1-arm64.dmg`, SHA-256 `ffe69f60…ea426a8`              | read                                                    |
| Git                                      | tag `v1.3.1` → `d04b206`; `master` is ahead of it (Phase 85/86 work, including two user-visible web fixes and one companion fix since 1.3.1) | `git rev-parse v1.3.1^{commit}`, `git log v1.3.1..HEAD` |
| GitHub release                           | `v1.3.1`, latest, 2026-09-26T11:17:51Z; the DMG is 192,003,879 bytes, with ZIP, appcast and manifest                                         | `gh release view v1.3.1`                                |
| Landing / install page (production)      | names `Kingfisher-1.3.1-arm64.dmg` and `ffe69f60…ea426a8`                                                                                    | `curl https://kingfisherchess.app/install`              |
| Deployed web app                         | `bb7419b` at the start of Phase 86 — current for everything the web build reads at that time                                                 | `npm run deploy:status`                                 |
| Downloadable artifact matches descriptor | **P85**: `desktop:public:verify -- --landing --full` 67/67 at 1.3.1                                                                          | not re-run in Phase 86: nothing about the DMG changed   |

Consequence: the Mac application a person downloads today is 1.3.1 and
does not contain `876ff13` (common text search at 10M, 50 s → 405 ms). The
web application does. No version is bumped to make these agree; the next Mac
release carries them (`docs/operations/after-a-fix.md` §B).

## 2. The comparator baseline, frozen

**Baseline B1, 2026-09-26.** The comparator is ChessBase 26 with Mega
Database 2026 (Windows, 2025-11-11) and ChessBase for Mac as announced
2026-09-21, described from the publisher's current pages and its own
reviewer, as listed with sources in [`chessbase-parity-audit.md`](chessbase-parity-audit.md)
§1 and its source list. No ChessBase licence or Windows machine is
available, so B1 is documentation-derived, and says so.

B1 is a set of workflows and performance criteria, not a feature list:

| #     | Workflow                                                                                             | Criterion                                                                                                  |
| ----- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| B1.1  | Search a multi-million-game reference by header, position, material, manoeuvre, theme and annotation | Header and exact-position warm < 1 s; complex ≤ 10 s at 1M, ≤ 60 s at 10M; equal to an exhaustive oracle   |
| B1.2  | Opening Report from a named population                                                               | Continuations, pioneers, popularity by year, Elo classes, typical routes, model games, exercises           |
| B1.3  | Batch novelty / repertoire scan over new games                                                       | Named corpus and date; transpositions; review before write-back; reversible                                |
| B1.4  | Opponent preparation                                                                                 | Explicit identity; recent vs career; repertoire intersection; offline game-day sheet                       |
| B1.5  | Deep / overnight analysis                                                                            | Survives reload, sleep, quit; checkpointed; result provenance                                              |
| B1.6  | Remote engines                                                                                       | A second machine analyses with identity, heartbeat, cancellation and failure handling                      |
| B1.7  | Database maintenance                                                                                 | Duplicates, integrity, names; copy/move verified before delete; interruption leaves old or new, never half |
| B1.8  | Interoperability with ChessBase files                                                                | CBH/CBV read with a preservation matrix; export a collaborator can open                                    |
| B1.9  | Continuity across devices and with a team                                                            | Two devices, offline edits, conflicts, scoped sharing, revocation                                          |
| B1.10 | Native Windows                                                                                       | Packaged harness on real Windows hardware                                                                  |

B1 changes only through a decision record in `docs/adr/`.

## 3. The ledger

### P0.1 — Professional reference data and corpus update pipeline

Target workflow: update corpus → report → model games → save study.
Modules: `scripts/build-reference-pack.mjs`, `scripts/reference/packs.mjs`,
`src/reference/`, `companion/src/database.mjs`, `companion/src/import-jobs.mjs`,
`.github/workflows/data-monthly.yml`. Data: Lichess database exports (CC0),
Lichess broadcasts (CC BY-SA 4.0), `THIRD_PARTY_DATA.md`; no licensed
annotated master corpus exists (owner: "start a public-domain set").

| Criterion                                                                 | Verified state                                                                                                                                                                                                                           | Tests / evidence                                              | Status      |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------- |
| A named ≥ 1M corpus imported and queried end to end                       | **P85**: Lichess 2014-07, 1,048,440 games, through the product's import path; explorer, games at a position, player, preparation, duplicates answered in ms; packaged and browser Part E 36/36                                           | `docs/release-evidence/phase-85/real-scale-1m/`               | complete    |
| The same path at 10M                                                      | **P85**: 10,680,708 games imported **search-only** (headers, content, line index); per-position rows skipped for want of ~330 GB. **P86**: the storage cause measured and a compact posting index proven equivalent on real games (§4.2) | `real-scale-10m/`; `docs/design/compact-position-postings.md` | partial     |
| A real incremental update, upstream → installed app                       | **P85**: Elite v2 → v3 and Starter v4 → v5 picked up by an installed app on production; monthly workflow run 36202154660                                                                                                                 | `evidence/update-cycle/` (maintainer's Mac)                   | complete    |
| Counts and samples reconciled against an independent reader               | **P85**: index answers equal the linear read (Kingfisher's own replay) — not an independent program                                                                                                                                      | —                                                             | not started |
| Dates, ratings, identities, annotations survive the path                  | **src**: the companion keeps full headers and movetext; not asserted end to end on an annotated corpus (Lichess standard has none)                                                                                                       | —                                                             | partial     |
| Every visible aggregate links to backing games, or says the source cannot | **src**: companion sources link to games; reference packs are aggregates and do not carry game postings; whether each pack surface says so is not audited                                                                                | —                                                             | partial     |
| A versioned pack schema preserving per-game facts and postings            | —: packs are continuation aggregates with year/Elo histories                                                                                                                                                                             | —                                                             | not started |

### P0.2 — Indexed professional search and query engine

Target workflow: one query model used by Library, Position, Preparation,
reports, repertoire scan and novelty. Modules: `companion/src/database.mjs`,
`companion/src/move-search.worker.mjs`, `src/features/games/research-filters.ts`,
`docs/design/search-mask.md`.

| Criterion                                                                     | Verified state                                                                                                                                                                                        | Tests / evidence                                    | Status      |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------- |
| One explicit query AST shared by every search surface                         | —: each surface has its own repository method; the search mask builds its own request                                                                                                                 | —                                                   | not started |
| Material / theme / route ≤ 10 s at 1M, ≤ 60 s at 10M, equal to the oracle     | **P85**: 1M 1.5–2.7 s; 10M 30.0–39.3 s; index hits equal linear-read hits on 30,000 games                                                                                                             | `real-scale-1m/`, `real-scale-10m/`                 | complete    |
| Header and exact-position warm queries sub-second at 10M                      | **P85**: headers, player, preparation, duplicates in ms at 10M; **exact position not measured at 10M** (no per-position rows). **P86**: compact postings answer it in ms (§4.2, at the probe's scale) | `real-scale-10m/queries-with-real-player.txt`; §4.2 | partial     |
| Annotation text in variations; combined query; saved queries rerun and diffed | **src**: saved research filters exist (`research-filters.ts`); rerun-and-diff after an update does not                                                                                                | —                                                   | partial     |
| An incremental index over authored work (studies, Team, repertoire, notes)    | —: authored-work search walks stores and reparses Team PGNs                                                                                                                                           | —                                                   | not started |
| Index integrity check, cancellation, progress, corruption rebuild             | **src**: companion "Verify explorer index" and aggregate rebuild; `database-chaos.test.mjs`                                                                                                           | unit                                                | partial     |

### P0.3 — Durable analysis jobs and remote engines

Modules: `src/engine/deepen.ts`, `src/features/engine/deepen-store.ts`,
`useDeepAnalysisResume.ts`, `src/features/shell/BackgroundActivityCentre.tsx`,
`companion/src/remote-engines.mjs`, `docs/design/remote-engines.md`.

| Criterion                                                                                          | Verified state                                                                                                                                            | Tests / evidence                                    | Status   |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | -------- |
| An eight-hour job surviving suspend and quit/relaunch, packaged                                    | **P85**: 8.35 h on packaged 1.3.0; 60 s full stop at 2 h; quit and relaunch at 4 h; resumed from checkpoint; 1,000 positions                              | `docs/release-evidence/phase-85/deep-night/`        | complete |
| Reload, route change, companion restart and a forced engine crash **during the same run**          | **P85**: reload by e2e; engine chaos 18/18 and walk with faults separately; not in one run                                                                | `e2e/deep-analysis.spec.ts`; `desktop:engine-chaos` | partial  |
| A general job model (queue, states, budgets, atomic write-back, one-undo batch) for every job kind | **src**: deep analysis and the analysis queue each have their own; no shared job record with the fields the brief lists                                   | —                                                   | partial  |
| A second machine completes a job over the network                                                  | **P85**: built; tested between two companions on one machine over loopback, including a host killed mid-search. No second machine (owner, §0 of Phase 85) | `companion/src/remote-engines-server.test.mjs`      | blocked  |
| Late UCI output cannot enter another session or job                                                | **P85**: `src/engine/uci-adversarial.test.ts`; a process that does not acknowledge stop is failed                                                         | unit                                                | complete |

### P0.4 — Large-database interoperability and maintenance

Modules: `src/database/chessbase/`, `src/database/encroissant/`,
`src/database/collections/operations.ts`, `companion/src/database-maintenance.mjs`,
`docs/data/chessbase-archive-format.md`.

| Criterion                                                                        | Verified state                                                                                                                                                | Tests / evidence                              | Status      |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ----------- |
| CBH/CBV read, verified against ChessBase's own output                            | **P85 and earlier**: encoder reproduces ChessBase's bytes for 421 games; `.cbv` read back against the publisher's PGN for 8,895 games                         | `src/database/chessbase/*.test.ts`            | complete    |
| A field-by-field preservation matrix from verified fixtures                      | **src**: the format document describes fields; a machine-readable matrix per field (variations, comments, NAGs, arrows, clocks, keys, deletions) is not built | —                                             | not started |
| Export a collaborator's program opens                                            | **P85**: CBH export read back by Kingfisher's reader; **not opened in ChessBase** (no licence)                                                                | `e2e/chessbase-export.spec.ts`                | blocked     |
| Duplicates, integrity, name normalisation, reversible entity merge/split         | **src**: duplicates and integrity exist; reversible entity merge/split does not                                                                               | unit                                          | partial     |
| Interruption of copy, move, import, export, repair, reindex: old or verified new | **src**: verify-before-delete invariant and chaos tests for the companion; a forced-kill drill across all six operations not recorded                         | `database-chaos.test.mjs`, `operations` tests | partial     |

### P0.5 — Complete opening and opponent workflows

Modules: `src/features/explorer/`, `src/features/games/BatchDepartureDialog.tsx`,
`src/repertoire/scan.ts`, `src/features/preparation/` and the report.

| Criterion                                                                         | Verified state                                                                                               | Tests / evidence                                             | Status      |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | ----------- |
| Opening Report with population-labelled history, pioneers, Elo classes            | **P85**: shipped; each figure labelled with its population; history from packs only, not companion databases | `e2e/opening-report.spec.ts`, `e2e/position-history.spec.ts` | partial     |
| Batch novelty/departure with corpus and date, review queue, reversible write-back | **P85**: batch departure shipped; the review-queue and one-undo write-back parts not audited in P86          | `e2e/batch-departure.spec.ts`                                | partial     |
| Opponent / repertoire intersection and an offline game-day sheet                  | **P85**: preparation reads packs and companion databases (`e00a9f3`); sheet exists                           | Part E W4                                                    | partial     |
| A repertoire maintenance inbox (new games, surprises, stale evidence, conflicts)  | —                                                                                                            | —                                                            | not started |
| The six brief workflows end to end, timed against a baseline                      | **P85**: Phase 85's own six workflows 36/36 packaged and browser; the brief's six, and task timing, not run  | `docs/release-evidence/phase-85/packaged/`                   | partial     |

### P0.6 — Secure continuity and collaboration

| Criterion                                         | Verified state                                                                                                                                                                                                         | Status   |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Threat model and decision record                  | `docs/adr/00xx-optional-account-sync.md` is **Proposed**. The owner decided (2026-09-24/25) "file exchange only; no server, no hosted share". A hosted or self-hosted service is therefore out of scope until reversed | blocked  |
| Two devices, offline edits, conflicts, revocation | — (portable backups and signed-off file exchange exist; no sync)                                                                                                                                                       | blocked  |
| A coach shares one assignment, not the team       | **src**: Team packets and assignments by file; no identity or access control                                                                                                                                           | blocked  |
| Complete local export with no service             | **P85**: portable backups; `PORTABLE_STORES`                                                                                                                                                                           | complete |

### P0.7 — Windows native delivery

| Criterion                                                     | Verified state                                                                                                                                               | Status  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| Packaged Windows harnesses on real hardware; signed installer | —; `docs/design/windows.md` states the size of the work. No Windows machine or certificate (owner)                                                           | blocked |
| A user-visible capability matrix, browser / macOS / Windows   | `README.md` says Windows, Linux and Intel Macs are not built and not supported; `platform-parity.md` compares browser and macOS only, with no Windows column | partial |

### P0.8 — Reliability and release evidence

| Criterion                                                         | Verified state                                                                                                                                                                                                                                          | Status   |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Unit, type, lint, format, build, e2e, benchmark, diff check green | **P86** at Phase 86's commits: see §4.4                                                                                                                                                                                                                 | partial  |
| Complete Firefox / WebKit matrix                                  | **P85**: 1,419/1,492 with five filed; **P86**: the five resolved, each repeated on three engines (§4.1); a full matrix re-run not yet done in P86                                                                                                       | partial  |
| Every packaged macOS gate on one bundle                           | **P85**: `desktop:certify` 10/10 and the rest on build 856                                                                                                                                                                                              | complete |
| Packaged Windows gates                                            | blocked with P0.7                                                                                                                                                                                                                                       | blocked  |
| Fault coverage list in the brief                                  | **src/P85**: stale engine output, companion death, index corruption, interrupted pack update, cross-tab conflict, move interruption, origin persistence, upgrade from the previous release; remote disconnect only over loopback; sync conflicts absent | partial  |

### P1

| Item                                                        | Verified state                                                                                                   | Status      |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------- |
| Saved query workspaces; opening/endgame/tactical keys       | **src**: saved research filters; no keys, no rerun-and-diff                                                      | partial     |
| Multi-game tactical / centipawn analysis, safe write-back   | **src**: analysis queue over several games; no one-undo batch write-back audited                                 | partial     |
| CTG read or verified conversion                             | —                                                                                                                | not started |
| Timed/scored coach questions, rubrics, cohort evidence      | **P85**: question points and timers shipped (`e2e/question-points-timer.spec.ts`); rubrics and cohorts absent    | partial     |
| Direct DGT capture                                          | — (depends on user research the brief requires first)                                                            | not started |
| Explainable model-game recommendations                      | **src**: model games are curated and source-linked; no ranking with an exposed rule                              | not started |
| Signed, content-addressed engine and team evidence packages | **P85**: shared evaluations keep engine, depth and origin through export/import; not signed or content-addressed | partial     |
| Remappable shortcuts; full command-palette coverage         | **src**: fixed shortcuts and a command palette; no remapping                                                     | partial     |
| Linux / macOS Intel decision                                | — (no documented segment decision)                                                                               | not started |
| Accessibility audit and dense professional lists            | **src/P86**: keyboard and accessibility e2e; a density setting; no WCAG audit record                             | partial     |
| Entity administration, reversible merge/split               | **src**: player aliases; no merge/split history                                                                  | partial     |
| Repertoire maintenance automation                           | — (see P0.5 inbox)                                                                                               | not started |

## 4. Phase 86 evidence

### 4.1 The five matrix failures

`docs/reports/phase-85-browser-matrix.md`, "resolved in Phase 86": four spec
defects and one application defect (fonts preloaded and never drawn),
72/72 and 75/75 across Chrome, Firefox and WebKit with repeats, each fix
shown to matter by restoring the old behaviour. Commits `d4843ea`, `4561a64`.

### 4.2 The 330 GB problem

100,445 real broadcast games imported through the product's path: 3.80 GB,
85.8% of it the position side. A posting index built from the same rows
(`scripts/probe-compact-postings.mjs`) holds that side in 179.9 MB instead of
3,257.7 MB (2,110.2 MB without structure search, which it does not carry):
1,791 bytes a game instead of 32,433. It answered 2,984 positions × 3 filters,
the games reaching each, and 500 games' moves identically (0 mismatches), with
SAN derived for 9,040 moves and no hash collision in 6,017,030 positions;
explorer p95 2.155 → 0.753 ms. Estimated at 10,680,708 games: 38–43 GB instead
of about 330 GB. Proposed as companion schema 3, not yet built:
`docs/design/compact-position-postings.md`,
`docs/release-evidence/phase-86/compact-postings/`. Found on the way: the
real-scale bench failed at its first checkpoint under `--bulk` (`b3a57d1`).

### 4.3 Machine

MacBook (Apple silicon, arm64), macOS (Darwin 27.0.0), Node 24.14.0; 460 GB
disk with 76 GB free at the start of Phase 86.

### 4.4 Gates

Recorded in the Phase 86 handover with each command's result.

## 5. Change log of this ledger

| Date       | Change                                                                 |
| ---------- | ---------------------------------------------------------------------- |
| 2026-09-26 | Version 1: baseline B1 frozen; every P0/P1 row given a verified status |
