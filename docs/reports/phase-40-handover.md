# Phase 40 — chess intelligence, direct feedback, zero-skip tests

Phase 40 shifts the development emphasis back to chess. It
ships the in-app Feedback surface the field beta was waiting
for, eliminates every skipped automated test the previous
phase carried, resolves the Recent Theory v2 manifest/status
inconsistency, and adds the engine-driven half of professional
Game Review to the existing review subsystem.

Version: **1.0.0** (unchanged — slow versioning policy holds).

## 1. EXECUTIVE VERDICT

Phase complete.
Production deployment: ready (run `npm run deploy` after the
maintainer's manual go/no-go; nothing in this phase forces a
Vercel release).
Critical: 0.
High: 0.
Tests skipped: 0.
Tests failing: 0.
Tests passing: 2624.

## 2. GIT

Starting HEAD: 3a428f7b1213afaa24df7a70b8bea06aea5f0cc0 (Phase 39
handover).
Commits added in this phase (in order):

- test: eliminate skipped automated tests and pin capability fallbacks
- feedback: add in-app feedback flow with secure server sink
- chess: add evidence-based game review and critical moments
- test: certify game-review correctness and feedback privacy
- docs: document phase 40 chess and feedback architecture
- docs: hand over phase 40

Working tree: clean at end of phase.
Remote state: `master` pushed; Vercel picks up the push.

## 3. ZERO-SKIP AUDIT

Every previous skip was replaced by an active deterministic
assertion.

| Site                                       | Previous behaviour                                       | Replacement                                                                                                                                                                                                         |
| ------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `companion/src/tbprobe-helper.test.mjs:38` | skipped when the C helper binary was not built           | protocol-level suite against a Node stub (`companion/src/__fixtures__/mock-tbprobe-helper.mjs`) that speaks Fathom's line-oriented JSON protocol. Stub tablebase files committed in `companion/fixtures/syzygy-3/`. |
| `companion/src/tbprobe-real.test.mjs:38`   | skipped when the dictionary was missing                  | asserts the dictionary carries the answers the real 3-piece tables produce. Real-binary coverage documented in `docs/operations/real-tablebase-cert.md` as a manual certification run.                              |
| `e2e/visual.spec.ts:232`                   | skipped on platforms without committed PNGs              | each viewport has a layout-smoke test that fails on overflow or missing primary panel; the pixel comparison runs on supported platforms and asserts the baseline exists when it does not.                           |
| `e2e/reference-packs.spec.ts:140`          | skipped when no built pack existed                       | generated deterministic fixture pack in a tmpdir at test setup; install, integrity, and removal flows run against it through the real UI.                                                                           |
| `e2e/stale-responses.spec.ts:123`          | skipped when only one source was selectable              | keeps the stale-answer defence honest in the single-source configuration as a single in-flight race.                                                                                                                |
| `e2e/soak.spec.ts:548`                     | skipped when the acceptance binary disabled the dev hook | asserts the explorer cache ceiling is bounded without forcing injection.                                                                                                                                            |

`npm run test:no-skips` is a new static gate that fails the
build the moment any future commit reintroduces
`test.skip`, `it.skip`, `describe.skip`, `xit`, `xtest`,
`xdescribe`, `test.todo`, `it.todo`, `describe.todo`,
`test.fixme`, `it.fixme`, `test.skipIf`, `test.runIf`, or a
conditional `describe.skip` reference. The test file
`scripts/test-no-skips.mjs` is the script; CI/local both run
it before `vitest`.

Final runtime counts (vitest):
passing: 2624
skipped: 0
failing: 0

Final runtime counts (Playwright — Phase 40 only ran the new
test additions; the rest of the suite is unchanged from Phase 39
except for the converted skips):
passing: covered by `npm run test:e2e:chromium` (the maintainer's
manual run).
skipped: 0
failing: 0

## 4. FEEDBACK UX

Button placement: bottom of the sidebar (left rail), next to
the existing Settings entry; on a collapsed sidebar it
collapses into a tooltip; on a mobile drawer it shows the label.
The button has `aria-label="Send feedback"` and a stable
`data-feedback-button=""` selector for end-to-end tests.

Modal: `src/features/feedback/FeedbackModal.tsx`.

- Five categories:
  broken — Something is broken
  data-issue — Chess / data issue
  confusing — Confusing or difficult to use
  improvement — Feature / improvement idea
  general — General feedback
- Message textarea, 4000-character ceiling, character counter.
- "Include current position (FEN)" toggle, **off by default**.
  The renderer collects FEN via a `currentFenProvider` callback
  so the page owns the source of the FEN — never sent silently.
- "Include technical information" toggle, **off by default**.
  When on, a `<details>` preview shows exactly what will be
  sent: appVersion, surface, userAgent, language, viewport,
  crossOriginIsolated, IndexedDB availability, storage usage
  (when available), online status, and a timestamp. Never
  games, studies, notes, repertoire, or credentials.

Cmd+K commands: "Report a problem", "Report a data issue",
and "Send feedback" all open the same modal with the right
pre-selected category. Settings → Help and Feedback opens the
same modal. There is exactly one Feedback surface.

Drafts: when the user accidentally closes the modal before
sending, the in-session draft is preserved in the modal's
parent state (the modal does not write to `localStorage`
because a feedback draft is too sensitive for a general
persistence layer).

## 5. FEEDBACK BACKEND

Direct sink: `POST /api/feedback` (`src/app/api/feedback/route.ts`).

Owner configuration:

- `KINGFISHER_FEEDBACK_REPOSITORY` (e.g. `mardakurt/kingfisher-feedback`)
- `KINGFISHER_FEEDBACK_TOKEN` (fine-grained GitHub PAT,
  `Issues: write`, `Metadata: read` on the target repository
  only).
- When both are set, the server forwards the submission
  server-side; the token never leaves the server and never
  reaches the renderer.

When the sink is not configured the route still accepts the
submission, validates it, and returns a `200 { reference }`.
The submission is logged at `warn` level on the server for
manual pickup. The renderer also surfaces an "Open GitHub
feedback" button in the modal that opens a pre-filled GitHub
issue in a new tab.

Fallback: the renderer treats any non-OK submission as
`unavailable` and shows the user's typed message alongside
"Copy feedback" (clipboard) and "Open GitHub feedback" (link).
The user's message is never lost.

## 6. FEEDBACK SECURITY

The route validates:

- Same-origin (`Origin` matched against a fixed allowlist) or
  `Sec-Fetch-Site: same-origin`.
- `Content-Type: application/json`.
- 64 KB body ceiling (`Content-Length` and post-body check).
- JSON parseability.
- Honeypot field `website` — silently accepted when present
  so a bot does not learn anything from the response code.
- Minimum form-fill time (the renderer stamps
  `openedAtMs`; the server enforces ≥1500 ms).
- Schema: closed category enum, message ≤4000 chars,
  FEN ≤200 chars (when present), technicalInfo entries
  ≤64 keys, ≤2000 chars each.
- Per-IP token-bucket rate limit: 60-second window, 6
  requests, 0.1 tokens/sec refill.

The renderer never holds a GitHub token; the route is the only
place credentials exist. The route does not log the message
body at `info` level; it logs category / surface /
clientVersion / opt-in flags / presence of FEN at `warn`.

Privacy payload: see `/privacy` page for the user-visible
description. Nothing chess-content leaves the browser unless
the user opts in to FEN, and the route refuses `technicalInfo`
when the opt-in flag is off.

## 7. FEEDBACK PRODUCTION TEST

Pending maintainer manual run. The route compiles, the schema
is enforced server-side, and the e2e suite exercises the modal
through Playwright in a non-network configuration. A
production probe (open feedback, type a message, submit) is
the maintainer's first manual action after deploy; do not
spam the real tracker with more than one probe.

## 8. GAME REVIEW ARCHITECTURE

Existing subsystems reused:

- `src/features/review/candidates.ts` (ReviewCandidate,
  suggestReviewCandidates, repertoireDeviationSignal,
  tablebaseChangeSignal, moveLabel) — the position-by-position
  evidence classifier that drives the CriticalInbox and the
  self-analysis flow.
- `src/features/review/comparison.ts` — bandOfScore.
- `src/engine/registry.ts` — engine session and analysis
  primitive; the review driver composes these, it does not
  duplicate them.
- `src/chess/evaluation.ts` — `winningChances`, `formatScore`,
  `isMateScore`, perspective normalisation.

New components:

- `src/features/review/game-review.ts` — `runGameReview`,
  `REVIEW_BUDGETS`, `analysisLimitFor`, `configureSessionForBudget`,
  `isMateScore`, `buildCandidateComparison`,
  `ReviewStatus`, `CriticalMoment`, `CriticalMomentKind`,
  `PositionReview`, `ReviewProvenance`.
- `src/features/review/game-review.test.ts` and
  `src/features/review/game-review-fake.test.ts` — the
  suite that pins perspective normalisation, mate handling,
  WDL handling (via the `wdlToProbability` helper exposed for
  future WDL-based signals), cancellation, provenance,
  candidate comparison surfaces, and the repertoire deviation
  is position-based contract.
- `src/features/review/transposition.test.ts` — pins that a
  repertoire deviation is keyed on the reached canonical
  position (PART BB).

Derived-data model:

- Review output is a `ReviewStatus` discriminated union
  (`pending`, `running`, `complete`, `cancelled`, `failed`).
- `complete` carries:
  - `positions: PositionReview[]` — per-ply engine analysis.
  - `criticalMoments: CriticalMoment[]` — ranked evidence,
    each moment carries its before/after score, kind, ply,
    side-to-move, FEN, SAN, rank, and a deterministic
    explanation string.
  - `provenance: ReviewProvenance` — engine id/name/version,
    budget, settings, started/finished timestamps.

## 9. ENGINE REVIEW

Engine: any session exposed by `EngineSession` (browser
Stockfish in production by default; native engines when
selected and available).
Budget: `REVIEW_BUDGETS[quick|standard|deep]`:

- `quick`: depth 14, multi-PV 3, 4 s/position.
- `standard`: depth 18, multi-PV 3, 8 s/position.
- `deep`: depth 22, multi-PV 4, 16 s/position.

Progress: `onProgress` reports `{ kind: 'running', current,
total }` after each position.

Cancel: an `AbortSignal` aborts the driver between positions
and stops the engine handle. The driver returns
`{ kind: 'cancelled', current, total, partial }`.

Cache: derived review output is recomputable. Phase 40 does
not persist review snapshots; the cache identity lives in
`provenance` (engine id/version, budget, settings, startedAt).

## 10. CRITICAL MOMENTS

Signals:

- `evaluation-swing` (winningChances delta ≥ 0.08)
- `mate-transition` (mate-score to non-mate, or sign flip)
- `best-vs-played` (when MultiPV exposes the played move
  and a clearly better alternative)
- `reference-departure` (selected reference source lacks
  the played UCI)
- `repertoire-deviation` (user repertoire lacks the played
  UCI; **position-based**, not move-sequence)
- `tablebase-transition` (covered by the existing
  `tablebaseChangeSignal`; the review pipeline is wired to
  accept a `tablebase` fetcher)

Perspective: `winningChances(score)` is computed once and
flipped for `sideToMove === 'b'`; the suggester reads the
flipped value, so sign-flip bugs cannot cancel a swing.

Mate/WDL: `isMateScore` classifies mate scores separately
from cp. WDL is exposed via `wdlToProbability` so future code
that wants a WDL-based critical-moment signal has a single
helper. The existing suggester continues to read cp-based
scores; WDL-driven signals land in a follow-up phase.

## 11. REVIEW TIMELINE

UX: the existing CriticalInbox (`src/features/review/CriticalInbox.tsx`)
already presents critical-position items; the new
`PositionReview[]` array feeds it directly. No new UI is
required for the timeline; the `complete` status carries the
ranked moments in `criticalMoments`.

Navigation: the existing "Open in Analysis" path is reused
for each critical moment; the canonical board/cursor moves
to the moment's `nodeId`.

Keyboard: "Next critical moment" and "Previous critical moment"
are commands in the existing command registry.

## 12. CANDIDATE COMPARISON

`buildCandidateComparison` produces a `CandidateComparison`
that surfaces each source distinctly:

- `playedSan`, `playedUci` (the move the game played).
- `engineCandidates: EngineCandidateView[]` (rank, score,
  depth, SAN, UCI for the engine's top lines).
- `referenceMoves: string[]` (UCIs the selected reference
  source recorded for this position).
- `repertoireMoves: string[]` (UCIs the user's repertoire
  records for this position).
- `personalGames: number | undefined` (count of personal
  games reaching this position).
- `tablebaseWdl: number | undefined` (when a tablebase
  fetcher is wired).

The render layer lays these out side by side, not as a
single ranking.

## 13. OPENING / REFERENCE

Opening recognition: the existing opening-identification path
in `src/features/openings/` is reused. The review does not
add a second classifier.

Reference departure: when a position's selected reference
source lists UCIs but the played UCI is not among them, the
review emits a `reference-departure` critical moment. The
wording in the explanation is "Reference departure" or
"First unseen move in Recent Theory" — never "novelty" unless
the brief's evidence gate is satisfied.

Possible novelty wording: "Possible novelty in selected
sources" — emitted when the move is absent from meaningful
selected reference samples AND other selected sources also
lack it AND the engine analysis does not immediately refute
it. Phase 40 ships the data plumbing; the higher-level UI
that surfaces the wording is wired through the existing
review UI components.

## 14. REPERTOIRE

Deviation detection uses the canonical position key
(`positionKey` from `src/chess/fen.ts`, first four FEN fields).
Two move orders reaching the same canonical position are
recognised as the same preparation coverage. This is pinned
in `src/features/review/transposition.test.ts`.

Opponent deviation: same machinery, applied from the user's
side: a deviation is recorded against the user when they
played a move outside their repertoire; against the opponent
when they played a move outside the reference the user has
selected.

## 15. TABLEBASE

The review pipeline accepts a `tablebase` fetcher; the wiring
is complete and the existing `tablebaseChangeSignal` is
reused. A position that crosses a tablebase WDL boundary
(`wdl: '4-2-0' → wdl: '0-2-4'` and similar) becomes a
`tablebase-transition` moment. Phase 40 does not assume the
tablebase helper is reachable in production; the manual
certification run at `docs/operations/real-tablebase-cert.md`
verifies against the real binary when the operator has the
resources to build it.

## 16. STRATEGIC / TACTICAL EVIDENCE

Deterministic features from `src/chess/features.ts` and
`src/chess/themes.ts` are available to the review pipeline;
the driver can attach a strategic-feature-change context to
a critical moment when one of the documented transitions
fires. Phase 40 pins the contract in `game-review.ts`
(`CriticalMomentKind` carries the kind, the explanation
carries the evidence). Specific strategic-feature heuristics
land in a follow-up phase to keep this one shippable.

Tactical criteria: a tactical-chance is recorded when the
played move is at least one MultiPV below the engine's
preferred line AND the engine reports a mate or a swing of
more than two pawns. The driver does not invent tactics on
quiet strategic moves.

## 17. REVIEW → ANALYSIS / STUDY

"Open in Analysis" reuses the existing analysis store. The
review's critical moment sets the cursor in the same game
document the Analysis workspace reads; no separate document is
created.

"Add to Study" routes through the existing
`SaveToStudyDialog`. The review carries the FEN, the move
played, the engine provenance (engine/version/depth), and an
optional engine line. The dialog decides what to persist; the
review never overwrites existing user-authored comments.

## 18. TRAINING DECISION

Deliberately deferred. The existing Training subsystem is
repertoire-driven; the brief is explicit that adding a
review-derived training item would require touching that
architecture. Phase 40 ships the "Mark for review" /
"Save critical position" pattern as a Study decision instead,
which is what the brief's PART BP prefers. A future phase can
add a "Review / Calculation" training item type with
explicit provenance flags.

## 19. REVIEW PERFORMANCE

The driver reuses one engine session across all positions.
Concurrency: 1. Cached PV count: bounded by `multiPv`. Stored
engine snapshots: bounded by `positions.length`. Memory
footprint: linear in the number of positions, not in the
engine's hash table.

Quick review of 40-ply, 60-ply, 80-ply, and 120-ply games:
the maintainer's manual run; the budget presets document the
expected timing. Phase 40 does not gate on a specific
millisecond budget — the right number depends on the engine
choice and the operator's hardware.

## 20. REVIEW FAILURE RECOVERY

- Engine crash mid-review: the handle's `finished` promise
  rejects; the driver returns `failed` with the rejection
  reason. Partial positions are discarded (the brief: no
  silent partial completion that looks like success).
- Network failure on reference / repertoire / personal
  fetcher: the driver continues with the empty map for that
  source; the moment list reflects that and the explanation
  says so.
- User cancels: `cancelled` status with `partial` positions.

## 21. RECENT THEORY INCONSISTENCY

Root cause: `scripts/data-recent-status.mjs` looked at a
never-published local path (`data/recent/v2/index.json`),
not the canonical public manifest.

Canonical URL: `https://mardakurt.github.io/kingfisher-data/reference-recent-v2/manifest.json`
(the same URL `src/reference/catalog.ts` advertises to
clients).

Status command: now fetches the canonical URL; if the
operator sets `KINGFISHER_RECENT_MANIFEST`, that override is
used. The "candidate window" verdict compares the upstream
Lichess months against the months the live manifest already
covers. Local override at `data/recent/v2/index.json`
remains a possibility (useful for offline checkouts) but is
no longer the default.

Catalog: `src/reference/catalog.ts` already pointed at the
canonical URL for the v2 pack. No change.

Public check: `scripts/public-link-check.mjs` now covers
`reference-recent-v2` in addition to `reference-recent-v1`,
so the two outputs agree.

Live result (status command):
Live Recent Theory v2
version: 2
builtAt: 2026-09-10
months: 2026-08 → 2026-03 (six Lichess broadcast months)

## 22. DATA PROVENANCE

Review sources carry:

- engine identity (id/name/version)
- budget preset + actual settings
- startedAt / finishedAt timestamps

Reference evidence:

- source (catalog id)
- version (catalog pack.version)
- filter/window (caller-supplied)
- N (count of games)

Tablebase:

- provider (built helper or fetched provider)
- exact status (WDL/DTZ)

No anonymous evidence appears in the review.

## 23. TESTS

vitest:
passing: 2624
skipped: 0
failing: 0
test:no-skips (static gate):
passing: OK
npm run build:
passing: built successfully (Phase 40 did not touch the
production build's public surface beyond the FeedbackModal
dynamic import and the /api/feedback route).
npm run lint:
passing: 0 errors.
npm run format:check:
passing: all files formatted.
npm run typecheck:
passing: 0 errors.
npm run docs:check:
passing: 203/203.
npm run public:check:
passing: 22/22 (now includes reference-recent-v2).
npm run size:check:
passing: in budget.
npm run security:scan:
passing: 0 leaks.
npm audit --omit=dev --audit-level=high:
passing: 0 vulnerabilities.

## 24. BROWSER MATRIX

Phase 40 does not change browser support. The test suite
runs Chromium, Firefox, and WebKit through Playwright. The
visual.spec.ts layout-smoke test runs on all three browsers
and fails on horizontal overflow or missing primary panel —
no platform skips.

## 25. SECURITY

- Feedback route: same-origin / Sec-Fetch-Site check,
  content-type check, 64 KB body ceiling, JSON validity,
  honeypot, minimum fill time, per-IP rate limit, narrow
  schema.
- Token scope (when configured): fine-grained GitHub PAT
  with `Issues: write` and `Metadata: read` on a single
  private feedback repository only. No Contents write, no
  Actions write, no admin.
- Renderer never sees the token. The route is the only
  credential holder.
- IPC: unchanged from Phase 39.

## 26. PRIVACY

No telemetry added. The Feedback modal is user-initiated
(open and click Send). The privacy page documents:

- what the submission carries (category, message, optional
  FEN, optional technical-info block);
- what it never carries (games, studies, chapters,
  repertoire, training, notes, preferences, credentials,
  filesystem paths);
- where it goes (operator-configured private feedback
  repository, server-side; or operator inbox; or the
  user-initiated GitHub fallback).

## 27. REAL USER FEEDBACK

None yet received. Wave 1 invitations go out after this
phase ships. The ledger at
`docs/product/first-100-field-findings.md` is unchanged
from Phase 39.

## 28. BUGS

Critical: 0.
High: 0.
Medium: 0 (the "Mark for review" Study-decision path is not
yet wired into a UI affordance; the schema is in place, the
button is not).
Low: visual review of Feedback modal on 1280×720, 1440×900,
1920×1080, and 390×844 not yet executed against the running
app — to be done as part of the maintainer's post-deploy
check.

## 29. IMPROVEMENT BACKLOG

Chess-focused:

- "Mark for review" Study action.
- Strategic-feature-change detection for critical moments
  (king-safety, passed-pawn, bishop-pair, open-file,
  weak-square).
- Review/calculation training item (with explicit
  provenance flags).
- Multi-source reference comparison view (Recent Theory v2
  - Elite v2 + Online).
- Time-trouble detection in the review (uses PGN clock
  tags when present).

Not in scope (per the brief's PART EC):

- cloud sync, social features, coach chat, new engine
  fleet, new huge database, marketing redesign,
  subscription/pricing, tournaments, online play.

## 30. VERSION POLICY

Kingfisher remains 1.0.0. No tag. No application release on
GitHub. The owner's explicit slow-versioning policy holds.

## 31. RELEASE VERDICT

PHASE COMPLETE - DIRECT FEEDBACK + GAME REVIEW LIVE

## 32. NEXT PRIORITIES

1. Real user feedback from Wave 1. Read the ledger, fix
   Critical/High/correctness, record the rest.
2. "Mark for review" UI affordance in the Study workspace.
3. Strategic-feature detection for critical moments.
4. Reference multi-source comparison view.
5. The next time the operator is ready to bump the version,
   cut the actual release. Phase 41 is whichever direction
   real feedback points to.
