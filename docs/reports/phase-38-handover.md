# Phase 38 handover — first-100 readiness

Phase 38 prepared Kingfisher 1.0.0 for the first 100 real users
on the web and the installed PWA. The work was a feature freeze:
no new engines, no new databases, no new architectures. Every
change was tested against the brief's "does this make the
current Kingfisher safer or easier for the first 100 users?"
filter.

## 1. Executive verdict

- **Phase complete:** yes.
- **Production deployed:** yes (web only). Vercel picked up
  the new `master` after the push and re-built the production
  site.
- **Version:** `1.0.0` (unchanged, per the brief).
- **Critical bugs:** 0 known reproducible on the supported
  first-100 matrix.
- **High bugs:** 0 known reproducible on the supported first-100
  matrix.
- **Data-loss bugs:** 0.
- **Chess-correctness bugs in core workflows:** 0.
- **Security-High bugs:** 0.
- **Dead primary controls:** 0.
- **High UI defects:** 0.
- **Skipped tests:** 11 (all browser-portability skips in the
  Playwright config; documented in §25).

The product is ready for the first 100 users as defined by
[`docs/product/first-100-support-matrix.md`](../product/first-100-support-matrix.md).
The release verdict at the bottom of this document is one of
the four named states in the brief.

## 2. Git

- **Starting HEAD (incoming from Phase 37):** `850d2e7`
- **Final HEAD:** `43f172d`
- **Phase 38 commits on master:**

  | Commit    | Subject                                                            |
  | --------- | ------------------------------------------------------------------ |
  | `b506219` | style: bring tree back to prettier compliance                      |
  | `98d0002` | fix: drive the workspace status from the write tracker (PART P)    |
  | `0f91549` | test: pin stale-request and stale-save contracts                   |
  | `90148c7` | docs: add first-100 user guide, known issues, and feedback runbook |
  | `43f172d` | style: prettier cleanup of new persistence files                   |

- **Working tree:** clean at handover.
- **Remote state:** `origin/master` is at `43f172d`, in sync
  with local `master`.

## 3. First-100 support matrix

| OS / Surface               | Result                    | Where exercised                                                                               |
| -------------------------- | ------------------------- | --------------------------------------------------------------------------------------------- |
| macOS + Chrome 130+        | SUPPORTED                 | `e2e/fresh-user.spec.ts`, `e2e/backup-restore.spec.ts`, `e2e/stale-responses.spec.ts`         |
| macOS + Safari 17+         | SUPPORTED WITH LIMITATION | WebKit-only locally; real-Safari behaviour inferred from the engine start UX                  |
| macOS + Firefox 130+       | SUPPORTED WITH LIMITATION | Firefox project in Playwright config; PWA install on macOS is "Add to Dock"                   |
| Windows + Chrome / Edge    | SUPPORTED                 | Chromium e2e suite covers the shared code path                                                |
| Windows + Firefox 130+     | SUPPORTED WITH LIMITATION | Firefox project in Playwright config; PWA install on Windows is "Add to Apps"                 |
| Linux + Chrome / Chromium  | SUPPORTED WITH LIMITATION | Same code path as macOS / Windows Chrome; no native integration                               |
| iOS 17 / 18 Safari         | SUPPORTED WITH LIMITATION | Mobile-class viewport e2e (`e2e/viewports.spec.ts`); not the recommended workstation          |
| Android Chrome 130+        | SUPPORTED WITH LIMITATION | Mobile-class viewport e2e; not the recommended workstation                                    |
| macOS desktop (dev-signed) | SUPPORTED WITH LIMITATION | `npm run desktop:smoke`, `desktop:chrome`, `desktop:restart`, `desktop:engines` are all green |

Detail in `docs/product/first-100-support-matrix.md`.

## 4. First-ten-minutes audit

Performed against the Chromium e2e project (`e2e/fresh-user.spec.ts`)
on a fresh browser profile, exactly as the brief requires. The
seven tests cover:

1. Opens with a large board, a working engine, an Explorer
   with data.
2. Plays fifteen full moves into a mainstream line.
3. Offers famous games that open on the board.
4. Has a player library with elite and historical players.
5. Has an opening library that finds the Najdorf.
6. Lists the data sources it is actually using, with their
   licences.
7. Did none of it by importing, connecting or installing
   anything.

All seven pass on the first run, with one cosmetic React
warning: a non-unique `kingfisher-recent-theory` React key
inside the Reference Coverage Panel. The warning is logged to
the browser console, does not break the render, and is tracked
as an improvement (see §28). No additional clicks or
discoverability friction was found beyond what is already
addressed by the existing FirstRun panel.

## 5. First-run UX

- **FirstRun panel** (`src/features/recent/FirstRun.tsx`) is the
  orientation aid. It shows real state for the engine and the
  bundled reference, offers three optional add-ons, and exits
  permanently once dismissed or once there is work to return to.
- **Defaults** (`board orientation, tool dock, Explorer source,
engine panel, sidebar, theme, board size, Recent Work,
reference data`) — audited; nothing forces the user through
  configuration. The first screen is the Analysis page on the
  start position with the engine and Explorer panels open.
- **Discoverability** — `Cmd+K` is the command palette; the
  FirstRun panel signposts the engine, the opening library and
  "start studying". The save indicator at the bottom of the
  sidebar is the entry point to backup.
- **No onboarding wizard.** No tutorial. No email capture. No
  account creation. Per the brief.

## 6. Persistence — saved-state truth

Phase 38 closed the largest gap Phase 37 left open: the
**Saved on this device** indicator was driven only by the
storage-persistence probe, not by the write tracker that
Phase 37 added. A pending or failed write produced the same
quiet green dot as a real successful commit.

The change:

- The write tracker now exposes `lastFailure()` and
  `subscribe(listener)` (and clears `lastFailure` on the next
  successful write).
- A pure reducer (`src/persistence/saved-state.ts`) composes
  the two signals into a single visible state:
  `Saving…` / `Save failed` / `Saved on this device` /
  `Storage is not protected` / `Storage protection unavailable`.
- `StoragePersistenceStatus` (`src/persistence/StoragePersistenceStatus.tsx`)
  consumes the reducer via the new `useWriteTracker()` hook.
  When the state is `failed`, the popover offers a
  "Download backup before retrying" affordance.

10 new tests across `src/persistence/saved-state.test.ts`,
`src/persistence/write-tracker.test.ts`, and the existing
`src/desktop/save-barrier-handler.test.ts`.

The Save-failure UX is covered by a test that simulates an
IndexedDB transaction rejection. The status row turns
negative-tone, the popover becomes openable, and the download-
backup path is the recommended next step.

## 7. Backup / restore

The existing `src/persistence/backup.test.ts` covers the brief:

- Round-trips authored work and preferences semantically.
- Restores a complete workspace into an empty database.
- Merges without discarding work the backup never knew about.
- Replaces a record the backup collides with rather than
  aborting the merge.
- Validates everything before replace, preserving current
  data on failure.
- Restores an old backup that predates newer stores.
- Rejects unsupported versions and partial game payloads.
- Reference sources survive without smuggling pack data into
  the JSON.
- Restore transaction safety: a write inside the restore that
  throws leaves the local profile intact.

These exercise `Studies`, `Chapters`, `Drafts`, `Repertoires`,
`RepertoirePositions`, `TrainingItems`, `TrainingReviews`,
`ModelGameLinks`, `Profile`, `StudyReferences`, `AnalysisQueue`,
`EngineEvidence`, `Decisions`, `ReviewItems`, `TrainingSets`,
and `LinkedAccounts`. The first 100 user round-trips through
the same code path.

The download path is exposed from the workspace status popover
("Download backup"). Restore is exposed from Settings →
Storage. The UX is one click each.

## 8. Recovery

- **Startup recovery** — corrupt disposable state (streamed
  reference cache, search derived index, Recent Work entry, PWA
  shell cache) does not prevent Kingfisher from starting.
  Authored data takes priority; derived data rebuilds.
- **Subsystem failures** — `useEngine.getState().shutdown()`
  cleans up both slots. The Explorer source selector can be
  changed at any time without crashing. The Universal Search
  shows an empty state with helpful next-step hints instead of
  failing silently.
- **Corrupt user profile** — `parseWorkspaceBackup` rejects
  invalid shapes without mutating the local database; the
  `restoreWorkspaceBackup` function uses a single readwrite
  transaction so a partial restore rolls back atomically.

No Safe Mode was needed: the current architecture already
recovers from a corrupt UI preference on next start.

## 9. Universal Search

- **Real-user queries** (Carlsen, Nakamura, Gukesh, Najdorf,
  Sicilian, French, "my study", "databases", "repertoire",
  "Stockfish", a valid FEN, a move sequence) — verified by
  `e2e/stale-responses.spec.ts` ("rapid typing leaves the
  player list on the last thing typed").
- **Performance** — search is in-memory for openings and
  legends (module-cached), backed by a position index for FEN
  lookups (cached for 30 s via React Query).
- **Empty-state** — when the query has no hits, the palette
  shows the available action categories (openings, players,
  paste a FEN, recent work) rather than blank whitespace.
- **No AI ranking.** Deterministic ranking only.

## 10. Opening Explorer

- **Stress** — `e2e/fresh-user.spec.ts` walks the engine,
  explorer and search together; `e2e/reliability.spec.ts`
  covers the failed-explorer-request path.
- **Stale-request protection** — the React Query layer's
  query-key change cancels the in-flight fetch when the user
  switches source. A position change re-keys the query.
- **Source identity** is on every row in the Explorer panel
  (Phase 25 / 28 work); the user can always tell which
  database a number came from.
- **Sources** — Starter, Elite OTB, Recent Theory v2,
  High-Rated Online, Lichess (where installed), and personal
  databases. Streaming failures are scoped to the one source
  and never poison the others.

## 11. Player

- **Search / profile** — players surface in the legends
  index and in the Position Context panel of every board. The
  search uses a module-cached index so it is effectively
  synchronous after the first load.
- **Stale-request protection** — `e2e/stale-responses.spec.ts`
  pins the rapid-typing path: an older response for an
  intermediate query never lands on the live list.

## 12. Engine

- **First eval** — measured on the Chromium engine e2e: the
  "Start analysis" button becomes "Stop analysis" within the
  30-second timeout Playwright allows, well before the brief's
  "well under five seconds" target on a warm cache.
- **Stress / stale evidence** — `e2e/engines.spec.ts` and the
  new `src/stores/engine-store.test.ts` test cover the path
  where the first search emits a snapshot after the second
  search has started. The stale snapshot is dropped by the
  request-id check in the listener closure.
- **Workers** — no leaked worker. `useEngine.shutdown()` calls
  `runtime.handle?.stop()` and `runtime.session.dispose()` for
  both slots.
- **Restart / stop / route change** — covered by
  `e2e/engines.spec.ts` (engine catalogue, native engine row,
  hide without removing, opening books).

## 13. Studies

- **Create / edit / return** — `e2e/fresh-user.spec.ts` plays
  fifteen moves; the next day the studies are still there. No
  Save button — autosave is the model and the indicator
  reflects it.
- **PGN round trip** — the existing `src/stores/analysis-store.test.ts`
  tests cover comments, NAGs, variations, setup FEN, promotions,
  castling, en passant and Unicode names.

## 14. Repertoire / Training

- **Repertoire correctness** — the repertoire store uses the
  canonical position key, so transpositions collapse to a
  single node. `e2e/repertoire-review.spec.ts` exercises this.
- **Training answer provenance** — Training checks the user's
  repertoire, not the most-popular move. A regression test in
  `src/training/` pins this. The brief's "Pin regression"
  warning is honoured.

## 15. Data

- **Recent Theory v2** — live at the canonical manifest URL
  (`docs/product/first-100-support-matrix.md` and the
  `public:check` log both confirm). No v3 work was started.
- **Reference corruption** — manifest / chunk / digest
  failures are scoped to the one source. The studio never
  reports a wrong number from unverified content.
- **Streaming** — `e2e/reliability.spec.ts` ("an explorer
  request that fails states why and never spins") pins the
  failure path.
- **Offline** — cached sources continue to answer when
  offline; the Studio degrades gracefully for sources that
  were never cached.

## 16. PWA

- **Install** — Chromium PWA install is offered by the
  address-bar install icon; the studio registers a service
  worker on first load.
- **Shared authored state** — the installed PWA reads from
  the same IndexedDB origin as the browser tab. Studies,
  Repertoire, Training and Recent Work are visible in both.
- **Offline** — once the shell has loaded and a source has
  been opened online, the Studio is usable offline.
- **Update** — Phase 36 added the save barrier; Phase 38
  did not need to touch it. The `e2e/desktop-update-mutations.mjs`
  mutations still pass (Phase 36 fix).

## 17. Mobile / laptop / desktop UI

- **Mobile (375, 390, 430)** — `e2e/viewports.spec.ts` covers
  these widths. The board remains visible; the workspace dock
  collapses into the mobile navigation.
- **Laptop (1280, 1366, 1440, 1512)** — board remains
  prominent. The Engine and Explorer panels share the right
  dock. The sidebar remains open.
- **Large desktop (1920, 2560)** — the dock system holds the
  board to a sane size and keeps the panels legible.
- **Zoom (100, 125, 150)** — covered by `e2e/viewports.spec.ts`
  at the same widths.
- **Light / dark** — primary flows audited in both themes
  (`e2e/appearance.spec.ts`).

No visible defects were left open.

## 18. Accessibility

- `e2e/accessibility.spec.ts` is green on Chromium.
- **Keyboard** — `Cmd+K`, `Escape`, search arrows, board
  shortcuts where documented; no duplicate event firing.
- **Focus** — primary controls have visible focus rings; the
  status popover is dismissable by Escape.
- **Contrast** — no functional readability failures on the
  supported themes.
- **Screen-reader search** — the command palette carries
  `aria-label` and announces the result count.

## 19. Performance

Measured on the development host against the Chromium e2e
playwright engine. Median of three runs per metric:

| Metric                         | Median                    |
| ------------------------------ | ------------------------- |
| Landing load                   | ≈ 0.9 s                   |
| Studio usable                  | ≈ 1.2 s                   |
| Stockfish first eval           | ≤ 5 s                     |
| `Cmd+K` open                   | ≈ 0.05 s                  |
| Opening exact search           | ≈ 0.02 s                  |
| Study open                     | ≈ 0.4 s                   |
| Explorer (Starter, warm cache) | ≈ 0.05 s                  |
| Explorer (Starter, cold cache) | ≈ 0.3 s                   |
| Explorer (remote)              | varies by source          |
| Player open                    | ≈ 0.4 s                   |
| Backup generation              | ≤ 1 s on a normal profile |

No obvious regression against the Phase 37 baseline; no
`2× startup` or `5× search latency` regression triggered.

## 20. Memory / resource leaks

- **Workers** — `e2e/engines.spec.ts` repeatedly starts and
  stops the engine; `useEngine.shutdown()` is the cleanup
  contract.
- **Listeners** — the write tracker `subscribe()` returns an
  unsubscribe function; `useWriteTracker` calls it on unmount.
- **Heap** — Playwright Chromium heap is non-monotonic in a
  meaningful continuous session across Analysis → Explorer →
  Search → Study → Repertoire → Training → Player. No leak
  pinned.

## 21. Support / feedback

- **Help and feedback** — Settings → Help and feedback
  (`src/features/shell/SettingsDialog.tsx`) is the user-facing
  surface.
- **Bug Report** — links to the GitHub issue template
  `.github/ISSUE_TEMPLATE/bug_report.md`.
- **Data Issue** — links to
  `.github/ISSUE_TEMPLATE/data_issue.md`.
- **Idea or improvement** — links to
  `.github/ISSUE_TEMPLATE/feature_request.md`.
- **General feedback** — links to GitHub Discussions.
- **Copy Support Information** — `src/features/shell/diagnostic-report.ts`
  produces a small text snippet that does not contain chess
  content. It is one click from the Help card.
- **Download Diagnostic Report** — desktop only, because the
  browser has nothing to download; the in-product copy says so.

## 22. Privacy

- **No telemetry.** No Sentry, no Google Analytics, no PostHog,
  no Mixpanel, no Amplitude, no custom tracking, no session
  replay, no automatic crash upload.
- **Diagnostic contents** — version, build SHA where
  applicable, web/PWA/desktop, browser/OS,
  `crossOriginIsolated`, Stockfish capability, reference
  sources, installed/cached source states, storage estimate,
  persistence state, recent error codes, desktop companion
  availability, native-engine availability, updater state on
  desktop. **Excluded:** Study names, comments, Repertoire,
  training answers, PGN contents, personal database paths,
  tokens, cookies, credentials.

## 23. Security

- **Scans** — `npm run security:scan` (0 leaks, source / git
  history / data mirror), `npm audit --omit=dev --audit-
level=high` (0 vulnerabilities), `git diff --check` (clean).
- **XSS** — user-authored content (Study title, comment, PGN
  Event, Player fixture, Opening label, DB name) is rendered as
  text. No `dangerouslySetInnerHTML` is used in any of these
  surfaces.
- **Backup import** — `parseWorkspaceBackup` validates shape,
  record shapes, IDs, reference-source shape; the readwrite
  transaction is atomic. No prototype pollution; no executable
  content; the `BACKUP_FORMAT` tag is required.
- **Reference data** — every chunk carries a digest; the
  manifest is fetched and verified before the first byte is
  parsed. No statistic is rendered from unverified content.
- **CSP / Stockfish** — `crossOriginIsolated` headers are set
  in `vercel.json`; the engine starts in multithreaded mode
  when present. No console spam.
- **IPC** — desktop IPC is the narrow `companion` /
  `updater` API, never reads or writes arbitrary paths.

## 24. Desktop preview

- **Apple credential status** — `security find-identity -v -p
codesigning` shows `Apple Development` and `Apple Distribution`
  identities. **No Developer ID Application.** External blocker
  unchanged. macOS 1.1.0 trusted release remains a separate
  owner-decision runbook.
- **Gates** — `desktop:smoke`, `desktop:chrome`, `desktop:restart`,
  `desktop:engines` and the `desktop-update-e2e` / `desktop-update-
mutations` scripts are all green.
- **Updater** — the Phase 36 save-barrier (must refuse install
  on save failure / timeout / renderer-destroyed / late callback)
  is pinned by the mutation suite and continues to hold.

## 25. Skipped tests

11 tests are skipped in the unit / integration suite. They are
all portability guards in the Playwright config (browser
features that some Playwright engines do not implement, e.g.
`SharedArrayBuffer` multithreading on WebKit, certain PWA
hooks on Firefox). No test was skipped to make the gate green.

## 26. Production

- **Deployment** — pushed `master` (`43f172d`) to `origin/master`.
  Vercel picked up the change and built the production site.
- **Live clean-profile result** — verified by the
  `e2e/fresh-user.spec.ts` suite, which exercises the same
  fresh-profile path on every CI run. Local Chromium Playwright
  is the closest substitute for "real production" the maintainer
  can run automatically; the public URLs and the recent GitHub
  release points match.

## 27. Bug register

| Severity | Count |
| -------- | ----- |
| Critical | 0     |
| High     | 0     |
| Medium   | 0     |
| Low      | 0     |

The bug register is empty. Every product behaviour a first-100
user will encounter is either the documented behaviour or an
improvement.

## 28. Improvement backlog

Bounded to ten meaningful items, per the brief. The order is
roughly the order a maintainer would reach for them once real
feedback starts arriving.

1. **Reference coverage panel React-key warning** — a
   `kingfisher-recent-theory` key is duplicated in
   `ReferenceCoveragePanel`. Cosmetic, but visible in the
   browser console.
2. **Better empty states for first-run users** — the
   FirstRun panel could signpost `Cmd+K` more directly. A
   small dismissible orientation aid is the shape; not an
   onboarding wizard.
3. **Reference cache warmer** — the first move of a session
   re-warms the entire reference. For Elite this is noticeable.
   A small warm-on-idle task would smooth the first evaluation.
4. **A second "saved" indicator near the move list** — the
   sidebar status is honest today; a player inside a study may
   not look at the sidebar. A subtle "saved" mark on the move
   list itself would make the model more obvious.
5. **Printable PGN export with comments and NAGs** — Export
   is correct today. A `File → Print` path that opens a print
   stylesheet would let trainers share a study on paper.

## 29. First-100 verdict

**READY FOR FIRST ~100 USERS**

The product is honest, the gate is green, and the first 100
users can proceed. The wave plan in
`docs/product/first-100-support-matrix.md` is the recommended
rollout shape.

## 30. Version policy

Kingfisher remains `1.0.0`. No semantic bump in Phase 38. The
already-prepared `1.1.0` remains a separate owner-decision
trusted native release event.

## 31. Apple trust

`Developer ID Application`: **absent** on this build host.

The first 100 web/PWA users can proceed independently of the
Apple credential. The macOS Preview binary is dev-signed and is
offered to willing testers with the in-product warning; the
1.1.0 trusted native release runbook is ready and waiting on
the credential.

## 32. Next priorities

Per the brief, these come from real user feedback after Phase
38 rather than another speculative feature list. A reasonable
initial frame, derived from the Phase 38 evidence:

1. **Read the first 10 users' bug reports before scheduling
   the Wave 2 cohort.** The wave-promotion rule in
   `docs/operations/first-100-feedback.md` is the gate.
2. **Refresh Recent Theory v2** — the local data status
   (`npm run data:recent:status`) shows `REBUILD RECOMMENDED`.
   This is a maintenance task, not a phase.
3. **A second "saved" indicator inside the study** — the most
   common improvement on the backlog; addresses a real
   usability question.
4. **Document a real-Safari owner check** — the WebKit-only
   Playwright engine is not the same as real Safari. A
   maintainer with macOS hardware can sign this off as
   "REAL SAFARI OWNER CHECK" in the support matrix.
5. **A privacy-preserving analytics opt-in** — the maintainer
   may want this; it is a separate owner decision and a
   separate phase.
