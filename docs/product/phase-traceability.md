# Phase traceability — does what the handovers said shipped still exist?

Phase 49 audit, 2026-09-12. Every phase handover in `docs/reports/` (13,
15–21, 23–29, 31–48) and the two product handovers (22, 27-final) were
read for the capabilities they reported as shipped. Each capability is
mapped below to the code that holds it today, the automated test that
would fail if it went, and — where it matters — the live check made in
this phase. Grouped by capability, not by task bullet; a handover's
hundred implementation items collapse to the few things a user can
still do.

Phases 1–22 were traced capability by capability at the time in
[`phase-verification.md`](phase-verification.md); that document names
203 source, test and documentation files. **All 203 still exist**
(checked by script in this phase), and the capabilities it lists are
re-exercised by the suites named there, which are part of the Phase 49
gate. This document therefore summarises 1–22 and traces 23–48 in full.

Status values: **Held** — present, tested, and exercised this phase;
**Held (repaired)** — present, but a regression was found and fixed in
Phase 49 (named); **Superseded** — deliberately replaced, and by what;
**Never shipped** — the handover said so itself.

## Phases 1–22 — the workstation (summary)

| Capability                                               | Code                                                          | Automated                                                         | Status           |
| -------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------- |
| Rules, FEN, SAN/UCI, standard chess only                 | `src/chess/position.ts`, `fen.ts`                             | `position`, `fen`, `fuzz`, `variant-contract` tests               | Held             |
| Immutable game tree, PGN round trip                      | `src/chess/tree/`, `src/chess/pgn/`                           | tree and pgn suites; **`round-trip-corpus.test.ts` (Phase 49)**   | Held (repaired)  |
| Autosave, drafts, revisions, migrations                  | `src/persistence/`                                            | `autosave`, `migrations`, `reliability.spec.ts`                   | Held             |
| Canonical position identity everywhere                   | `positionKey()`                                               | `repertoire`, `transpositions`; `phase9.spec.ts`                  | Held (repaired)  |
| Repertoire, training schedule, review of decisions       | `src/repertoire/`, `src/training/`, `src/features/review/`    | `repertoire-review.spec.ts`, `phase10.spec.ts`, `phase11.spec.ts` | Held             |
| Explorer over separate sources, never merged             | `src/features/explorer/`, `src/reference/`                    | `source-comparison.spec.ts`, `reference-sources.spec.ts`          | Held             |
| Theory Book (names only, no counts)                      | `src/theory/theory-book.ts`                                   | `theory-book.spec.ts` asserts no counts; `theory-book.test.ts`    | Held (repaired)  |
| Engines: UCI session, browser Stockfish, companion       | `src/engine/`, `companion/`                                   | `uci-session`, `uci-adversarial`; `engines.spec.ts`               | Held             |
| Native engine catalogue by interrogation                 | `src/engine/registry.ts`, `scripts/install-engines.mjs`       | `registry.test.ts`; `desktop:engines`                             | Held             |
| Databases: IndexedDB and SQLite collections, move/dedupe | `src/database/`, `companion/src/database.mjs`                 | `database-chaos.test.mjs`; `phase7.spec.ts`, `phase12` flows      | Held             |
| En Croissant read-only import, verified encoding         | `src/database/encroissant/`                                   | `decode.test.ts` against a real database                          | Held             |
| Players: packs, legends, search                          | `src/reference/players.ts`, `src/features/search/players.ts`  | `players.spec.ts`; **`players.test.ts` (Phase 49 rows)**          | Held (repaired)  |
| Studies, chapters, notes, annotations                    | `src/features/studies/`, `src/features/notes/`                | `phase8.spec.ts`, `kingfisher.spec.ts`                            | Held             |
| Preparation, model games, opening files                  | `src/features/preparation/`, `model-games/`, `opening-files/` | `phase9.spec.ts`, `opening-walk.spec.ts`                          | Held             |
| Endgame and tablebase (bundled 3-piece, remote)          | `companion/src/tbprobe-*.mjs`, `src/tablebase/`               | `tbprobe-real.test.mjs`; `phase9.spec.ts`                         | Held             |
| Settings with a consumer for every preference            | `src/features/shell/settings-contract.ts`                     | `settings.spec.ts` — one assertion per preference                 | Held             |
| Desktop shell: origin per profile, companion lifetime    | `desktop/src/origin.mjs`, `services.mjs`                      | `origin.test.mjs`; `desktop:restart`, `desktop:smoke`             | Held             |
| macOS window chrome, one rectangle                       | `desktop/src/window-chrome.mjs`                               | `desktop:chrome` (109 checks); `window-chrome.spec.ts`            | Held             |
| Chess960                                                 | `src/chess/chess960.ts` (capability record only)              | `chess960.test.ts` — refused, not played                          | Held (by design) |

Repairs in this group made in Phase 49: the Theory Book panel located a
line by its move string, not its positions (a Réti-order Catalan read as
"King's Indian Attack"); a bare `[%clk]` comment doubled on each PGN
round trip; and a surname query ranked a titled namesake above the world
champion. Each has a test that fails on the previous code.

## Phase 23 — public preview launch

| Capability                               | Code                                                | Automated                              | Live (Phase 49)                                     | Status          |
| ---------------------------------------- | --------------------------------------------------- | -------------------------------------- | --------------------------------------------------- | --------------- |
| Landing page as a separate surface       | `src/app/landing/LandingPage.tsx`, `landing.css`    | `docs:check` (JSON-LD, FAQ, footer)    | `https://kingfisher-chess.vercel.app/` fact-checked | Held            |
| Release channels (web stable, macOS DMG) | `src/release/public-urls.ts`, `macos-download.json` | `macos-download.test.ts`, `docs:check` | `desktop:public:verify -- --landing --full`         | Held            |
| CI cost reduction (heavy gates manual)   | `.github/workflows/ci.yml` and the manual workflows | —                                      | master CI green again after Phase 49 (`ci.yml` fix) | Held (repaired) |

## Phase 24–26 — public surface hardening, deployment, 1.0

| Capability                                                      | Code                                                      | Automated                                    | Live (Phase 49)                           | Status                                                                                                     |
| --------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Strict CSP, COOP/COEP, no third-party script                    | `vercel.json`, `next.config.ts`                           | `security.test.ts` (search), `security:scan` | headers read on the production origin     | Held                                                                                                       |
| `/install`, `/privacy`, `/security`, `/terms`, `/data-licences` | `src/app/{install,privacy,security,terms,data-licences}/` | `docs:check` route checks; `public:check`    | every route 200                           | Held                                                                                                       |
| `security.txt` with the advisory flow                           | `public/.well-known/security.txt`                         | `docs:check`                                 | `public:check`                            | Held                                                                                                       |
| Secret scanning of tree and history                             | `scripts/security-scan.mjs` (gitleaks)                    | run in the gate                              | 0 findings, 483 commits                   | Held                                                                                                       |
| Vercel production for landing and studio                        | `.vercel/project.json`, `scripts/vercel-deploy.mjs`       | `deploy:status` (needs a token)              | production at `07052ff` before this phase | Held — **deploys are CLI-made; the project has no Git link** (see the final certification, deployment row) |
| Kingfisher 1.0.0 release semantics                              | `docs/release/1.0.0.md`, GitHub release `v1.0.0`          | —                                            | asset still served                        | Superseded by 1.1.0 (and 1.1.1)                                                                            |

## Phase 27–29 — data intelligence, continuity, project size

| Capability                                              | Code                                                                  | Automated                                       | Live (Phase 49)                           | Status |
| ------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------- | ------ |
| Reference pack pipeline, seekable zstd, early rejection | `scripts/build-reference-pack.mjs`, `scripts/reference/packs.mjs`     | pack builder tests, `pack.test.ts`              | four packs read by `bench-explorer-depth` | Held   |
| Content-addressed chunk reuse across pack versions      | `src/reference/install.ts`, `store.ts`                                | `install.test.ts`                               | —                                         | Held   |
| Landing and studio on separate origins                  | `src/middleware.ts`, `middleware-host-rules.ts`                       | host-rule tests                                 | both hosts answer from one deployment     | Held   |
| Persistent-storage detection and degradation            | `src/persistence/storage-persistence.ts`, `StoragePersistenceStatus`  | `storage-hydration.test.ts`; `settings.spec.ts` | —                                         | Held   |
| Caches outside the repository                           | `scripts/workspace-audit.mjs`, `operations/local-workspace-layout.md` | `workspace:audit` in the gate                   | 0 B inside the checkout                   | Held   |

## Phase 31–33 — universal search, recent work, public accuracy

| Capability                                                                       | Code                                                                     | Automated                                                                            | Live (Phase 49)                                                         | Status          |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | --------------- |
| Universal Search (⌘K): commands, players, openings, studies, FEN, move sequences | `src/features/search/universal-search.ts`, `move-sequence.ts`, `rank.ts` | `rank.test.ts`, `move-sequence.test.ts`, `security.test.ts`; `accessibility.spec.ts` | 25 opening and 51 player queries benchmarked (`final-certification.md`) | Held (repaired) |
| Recent Work / Continue                                                           | `src/features/recent/RecentWorkspace.tsx`, `research-history-store.ts`   | `research-history-store.test.ts`; `phase11.spec.ts`                                  | walk                                                                    | Held            |
| Storage-quota warning before a large install                                     | `src/reference/storage-quota.ts`                                         | `storage-quota.test.ts`                                                              | —                                                                       | Held            |
| lastAccessed-indexed cache eviction                                              | `src/reference/tiered-streaming-cache.ts`                                | `tiered-streaming-cache.test.ts`; `soak.spec.ts`                                     | —                                                                       | Held            |
| One source of public URLs; `docs:check`                                          | `src/release/public-urls.ts`, `scripts/docs-check.mjs`                   | run in the gate                                                                      | 299 → 338 checks after Phase 49 additions                               | Held            |

## Phase 34 — PWA

| Capability                                    | Code                                               | Automated                                       | Live (Phase 49)                                     | Status |
| --------------------------------------------- | -------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------- | ------ |
| Host-aware web manifest                       | `src/app/manifest.webmanifest/route.ts`            | `docs:check`                                    | `/manifest.webmanifest` on the studio               | Held   |
| Service worker: offline shell, update check   | `public/sw.js`, `src/features/shell/` registration | `settings.spec.ts` (SW rows), `phase14.spec.ts` | production install prompt (see final certification) | Held   |
| `noindex` on the studio, index on the landing | `src/app/robots.ts`, `middleware-host-rules.ts`    | `docs:check`                                    | headers read                                        | Held   |

## Phase 35–36 — polished DMG, updater infrastructure

| Capability                                              | Code                                                                    | Automated                                                                        | Live (Phase 49)                              | Status                                                                                  |
| ------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------- |
| Branded DMG: volume, icon, two visible items            | `desktop/electron-builder.yml`, `desktop/scripts/build-dmg-*`           | `verify-dmg.mjs`; `desktop:dmg:verify`                                           | verified on the 1.1.1 DMG                    | Held                                                                                    |
| Updater engine (`electron-updater`), feed in the bundle | replaced: `desktop/src/sparkle-updater.mjs`, `native/sparkle/bridge.mm` | `sparkle-updater.test.mjs`, `sparkle-bundle.test.mjs`, `update-service.test.mjs` | `desktop:update:real`; public 1.1.0 → 1.1.1  | Superseded — by Sparkle in 1.1.8 (Phase 54); 1.1.0–1.1.7 are still fed `latest-mac.yml` |
| Build identity: version, build number, commit, channel  | `desktop/src/build-identity.mjs`                                        | `build-identity.test.mjs`                                                        | _Settings → Diagnostics_ on the packaged app | Held                                                                                    |
| Signing/notarisation pipeline and verifiers             | `scripts/desktop-mac-sign.mjs`, `-notarize`, `-trust-verify`            | `desktop:sign:verify`, `desktop:notary:verify`, `desktop:trust:verify`           | run on the 1.1.1 artefacts                   | Held                                                                                    |
| Preview channel (pre-release, build-numbered filename)  | `scripts/desktop-mac-preview-publish.mjs`, `update-service.mjs`         | `macos-download.test.ts` (filename rule)                                         | not used this phase (stable release instead) | Held                                                                                    |

The Phase 35 rewrite of `electron-builder.yml` dropped `extraResources`;
every packaged build to Phase 45 launched empty. Phase 46 restored it and
Phase 47 made it structurally impossible (`required-resources.mjs`, the
`afterPack` and `afterSign` hooks). Recorded here because a handover said
"opens correctly from Finder" about a bundle that did not.

## Phase 37–39 — save barrier, truthful save status, first-100 preparation

| Capability                                          | Code                                                               | Automated                                                                  | Live (Phase 49) | Status |
| --------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------- | --------------- | ------ |
| Save barrier before quit and before an update       | `desktop/src/save-barrier.mjs`; `src/persistence/write-tracker.ts` | `save-barrier.test.mjs`, `write-tracker` tests; `desktop:update:real` step | update flow     | Held   |
| Truthful save status ("Save failed", never "Saved") | `src/persistence/saved-state.ts`, `StudySaveStatus.tsx`            | `saved-state.test.ts`; `accessibility.spec.ts` live region                 | —               | Held   |
| Support matrix, known issues, user guide            | `docs/product/first-100-*.md`                                      | `docs:check` links                                                         | reviewed        | Held   |
| Diagnostics report with redaction                   | `src/features/shell/diagnostic-report.ts`                          | `diagnostic-report.test.ts`                                                | walk            | Held   |

## Phase 40 — Game Review

| Capability                                    | Code                                                           | Automated                                                               | Live (Phase 49)                                      | Status                         |
| --------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------ |
| Review a game: progress, critical moments     | `src/features/review/`, `src/features/analysis-queue/`         | `game-review-fake.test.ts`, `analytics.test.ts`; `analyse-game.spec.ts` | walk                                                 | Held                           |
| Candidate comparison at a critical moment     | `src/features/review/candidates.ts`, `comparison.ts`           | `candidates.test.ts`, `comparison.test.ts`                              | walk                                                 | Held                           |
| Mark for Review, Decision Journal             | `src/features/review/DecisionJournal.tsx`, `CriticalInbox.tsx` | `phase11.spec.ts`                                                       | walk                                                 | Held                           |
| No fake accuracy, no fake rating              | `game-review-fake.test.ts` asserts their absence               | —                                                                       | —                                                    | Held                           |
| Feedback route (server-side sink, honest 503) | `src/app/api/feedback/route.ts`, `src/features/feedback/`      | `route.test.ts`, `feedback-sink.test.ts`                                | production answers 503 `unconfigured`; fallback used | Held — **sink not configured** |

## Phase 41 — strategic review, source comparison, calculation training

| Capability                                          | Code                                                                            | Automated                                                      | Live (Phase 49) | Status |
| --------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------- | ------ |
| Strategic context card (feature transitions)        | `src/chess/feature-transitions.ts`, `review/StrategicContextCard.tsx`           | `feature-transitions.test.ts`                                  | walk            | Held   |
| Multi-source comparison, each source its own column | `src/reference/multi-source-comparison.ts`, `review/ReviewSourceComparison.tsx` | `multi-source-comparison.test.ts`; `source-comparison.spec.ts` | walk            | Held   |
| Calculation training from review provenance         | `src/features/review/calculation-training.ts`, `src/features/calculation/`      | `calculation-training.test.ts`, `calculation/tree.test.ts`     | walk            | Held   |
| Clock parsing into the review                       | `src/chess/clock.ts`                                                            | `clock.test.ts`; `round-trip-corpus.test.ts`                   | —               | Held   |
| Marked-review transposition identity                | `positionKey` in the journal                                                    | review tests                                                   | —               | Held   |

## Phase 42 — engine arrows, Copy FEN, deployment

| Capability                                   | Code                                                           | Automated                                          | Live (Phase 49)                                               | Status          |
| -------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------- | --------------- |
| Best-move arrows, two engines, hover tooltip | `src/features/board/BoardShapes.tsx` (engine layer)            | `engines.spec.ts` "played while an arrow is drawn" | web and desktop walks                                         | Held            |
| Copy FEN / Copy PGN / Copy position          | `src/features/analysis/useCopyActions.ts`                      | `accessibility.spec.ts` (palette), unit tests      | walk                                                          | Held            |
| Production deploy on push                    | Vercel Git integration (`master`), `scripts/vercel-status.mjs` | `npm run deploy:status`                            | linked 2026-09-13; the no-op `deploy-*.yml` workflows removed | Held            |
| Browser matrix projects                      | `playwright.config.ts`                                         | —                                                  | Firefox/WebKit could not launch until Phase 49                | Held (repaired) |

## Phase 43–44 — certification, Safari, first-100 field

| Capability                                  | Code / doc                                     | Automated     | Live (Phase 49)            | Status              |
| ------------------------------------------- | ---------------------------------------------- | ------------- | -------------------------- | ------------------- |
| Fresh-user suite (a brand-new installation) | `e2e/fresh-user.spec.ts`                       | in the matrix | matrix                     | Held                |
| Real Safari checklist                       | `docs/operations/real-safari-certification.md` | —             | not performed by a human   | External limitation |
| Field findings register (real reports only) | `docs/product/first-100-field-findings.md`     | —             | no field reports exist yet | Held                |

## Phase 45–46 — desktop packaging and hardening

| Capability                                                               | Code                                                      | Automated                                | Live (Phase 49)           | Status |
| ------------------------------------------------------------------------ | --------------------------------------------------------- | ---------------------------------------- | ------------------------- | ------ |
| Packaged harnesses: smoke, chrome, restart, engines, suspend, walk, soak | `scripts/desktop-*.mjs`, `scripts/desktop-lib/launch.mjs` | `desktop:certify`                        | run on the Phase 49 build | Held   |
| Service revival with a crash-loop budget                                 | `desktop/src/revival.mjs`, `services.mjs`                 | `revival.test.mjs`; fault walk           | fault walk                | Held   |
| Companion refuses writes to a deleted backing file                       | `companion/src/server.mjs`                                | `database-chaos.test.mjs`                | —                         | Held   |
| PGN file association, drop, Open Recent                                  | `desktop/src/files.mjs`, `menu.mjs`                       | `files.test.mjs`, `menu.test.mjs`; smoke | smoke                     | Held   |
| Damaged backup never damages the profile                                 | `src/persistence/backup.ts`                               | backup tests; `backup-restore.spec.ts`   | web and desktop walks     | Held   |

## Phase 47 — trusted release

| Capability                                   | Code                                                                         | Automated                                                                    | Live (Phase 49)                    | Status                                      |
| -------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------- |
| Developer ID signing, notarisation, stapling | `scripts/desktop-mac-sign.mjs`, `desktop-mac-notarize.mjs`, `build.mjs`      | `desktop:sign:verify`, `desktop:notary:verify`, `desktop:trust:verify`       | 1.1.1 artefacts                    | Held                                        |
| Required-resources contract and boot gate    | `desktop/src/required-resources.mjs`, `desktop/scripts/verify-package*.mjs`  | `builder-config.test.mjs`; `verify-dmg`                                      | 1.1.1 DMG                          | Held                                        |
| Native update window, fifteen states         | removed with Phase 54; Sparkle draws its own window                          | `desktop:update:real` drives it through `scripts/desktop-lib/sparkle-ui.mjs` | Sparkle → Sparkle, 1.1.7 → Sparkle | Superseded — by Sparkle in 1.1.8 (Phase 54) |
| Titled-player roster (8,339, Wikidata CC0)   | `public/data/players/titled-players.json`, `src/reference/titled-players.ts` | `titled-players.test.ts`, `players:roster:check`                             | 51 queries benchmarked             | Held (repaired)                             |
| Opening search by the names players use      | `src/features/search/openings.ts`                                            | `openings.test.ts` (31 queries)                                              | 25 queries benchmarked             | Held                                        |
| Public DMG verifier, byte for byte           | `scripts/desktop-public-verify.mjs`                                          | run against the public asset                                                 | 1.1.0 and 1.1.1                    | Held                                        |

## Phase 48 — full screen, palette, landing, update polish

| Capability                        | Code                                                                           | Automated                                                      | Live (Phase 49)                                                                                 | Status |
| --------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------ |
| Full-screen chrome collapse       | `desktop/src/main.mjs` (fullscreen relay), `useDesktop.ts`, `globals.css`      | `fullscreen-ipc.test.mjs`; `desktop:chrome` full-screen checks | `desktop:chrome -- --packaged` on the first build carrying it                                   | Held   |
| Command palette single focus ring | `src/features/command/` (`[data-palette-search]`)                              | `accessibility.spec.ts` "one focus ring"                       | matrix                                                                                          | Held   |
| Landing hero from a real capture  | `scripts/landing-captures.mjs`, `public/landing/img/workspace-2026-09-19.webp` | `docs:check`, `e2e/landing-chrome.spec.ts`                     | recaptured for 1.1.1; all three images and the social card recaptured in Phase 71 by one script | Held   |
| Update dialog copy                | `desktop/src/update-protocol.mjs`                                              | `update-protocol.test.mjs`                                     | dialog harness                                                                                  | Held   |

## What a handover claimed that was not true

Recorded so the pattern is visible, not to relitigate it.

| Handover | Claim                                                     | Reality                                                                                               | Resolution                        |
| -------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------- |
| 35, 36   | the packaged application "opens correctly from Finder"    | it exited on "This build is incomplete"; no web server in the bundle                                  | Phase 46/47; contract in code     |
| 43       | "the matrix run on Chromium, Firefox and WebKit passed"   | Firefox and WebKit failed at launch on the leaked Chrome channel; they could not have run             | Phase 49 (`playwright.config.ts`) |
| 42, 44   | "both Vercel projects auto-deploy from master"            | the Vercel project has no Git link and the workflow's secrets were never set; every deploy was by CLI | owner action, recorded            |
| 47, 48   | CI green implied by the gate lists                        | master CI was red on every push since the release (`electron-updater` missing in the quality job)     | Phase 49 (`ci.yml`)               |
| 47       | "macOS 11 or later" on the release page and in the bundle | Electron 44 needs macOS 13; the bundle's plist declared 11.0                                          | Phase 49 (`platform-floor.mjs`)   |
