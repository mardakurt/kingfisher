# Phase 43 findings

Issues found during the Phase 43 system-certification sweep, with the
regression that proves each fix. Phase 43 is "certify the whole product";
the items below are the defects that survived into it and the work that
moved them out.

A BUG entry below is something that was wrong. An IMPROVEMENT is a
behaviour that works but is now better.

## BUGS

### Bug-43-A1 — `featureTransitions` was computed in review sessions but never stored on the review item

**Severity:** High.
**Subsystem:** Review / critical moments.
**Reproduction:**

1. Mark a position in a real game where a structural change happens
   (passed pawn, bishop pair, king shield, etc.).
2. The review session shows a "CriticalMoment" with the transitions.
3. Quit the session and reopen the same review item from
   `CriticalInbox`. No "Strategic context" panel — only the engine and
   reference evidence.
   **Root cause:** `game-review.ts` computed `strategicContext` on
   `CriticalMoment` for the live review session, but the
   `CreateReviewItemInput` for `upsertReviewItem` did not carry it. The
   field existed, the storage did not.
   **Fix:** Add `strategicContext?: readonly FeatureTransition[]` to
   `ReviewItemRecord`, to `CreateReviewItemInput`, and to the validation
   predicate. Compute and store it in both mark paths (`ReviewWorkspace`
   mark-critical) and the suggest path (`SuggestCandidates`) using a
   shared `strategicContextForNode(tree, nodeId)` helper that reads
   parent/child FENs from the tree. Render it inside the expanded
   `CriticalInbox` row via the new `StrategicContextCard`.
   **Regression:** `src/features/review/strategic-context.test.ts` exercises
   root, missing-node, and ordinary-move cases.
   `src/persistence/repositories/review.test.ts` persists a transition list
   and proves a refresh-without-transitions does not wipe the stored one.

### Bug-43-A2 — `lichess-masters` source labelled as just "Masters" in the explorer picker

**Severity:** Low.
**Subsystem:** Explorer / source labels.
**Reproduction:**

1. Open the explorer.
2. Open the source picker.
3. The Lichess Masters option reads `Masters — Online`. A user scanning
   the picker cannot tell which site this comes from.
   **Root cause:** `LichessExplorerProvider.constructor` set
   `this.name = masters ? 'Masters' : …` — a short name that meant
   "masters" but did not identify the source. The PART U brief explicitly
   warns against letting Masters drift into "Recent" or generic Elite.
   **Fix:** Use `'Lichess Masters'` for the masters branch. Tests updated
   to match.
   **Regression:** `src/database/providers/lichess.test.ts` still passes.
   The two other tests that asserted the old name
   (`assistant.test.ts`, `games/open-online-game.test.ts`,
   `shell/diagnostic-report.test.ts`) now use the new full name and pass.

### Bug-43-A3 — `deploy:status` failed with "Could not read origin/master" on a real checkout

**Severity:** Medium (the script is the only way Phase 41 found the
"studio behind master" condition).
**Subsystem:** Deployment / observability.
**Reproduction:**

1. Clone the repo somewhere with spaces in the path (e.g.
   `~/Projects/chess&poker/chess/studying hub`).
2. Run `npm run deploy:status` without `VERCEL_TOKEN` set (the common
   CI-prep path).
3. The script exits with the wrong error: "Could not read origin/master.
   Are you inside a git checkout?" even though `git rev-parse
origin/master` works fine in the same shell.
   **Root cause:** `scripts/vercel-status.mjs` computed `ROOT` as
   `new URL('..', import.meta.url).pathname`, which resolves to the
   `scripts/` folder, not the project root. `git rev-parse origin/master`
   in that cwd fails for a non-repo path.
   **Fix:** Compute `ROOT` with `fileURLToPath(new URL('../', import.meta.url))`,
   which decodes the URL-encoded path correctly (the project lives under a
   folder containing a space) and points at the project root.
   **Regression:** `npm run deploy:status` now prints the helpful
   "VERCEL_TOKEN is not set — skipping deployment status check" message,
   which is the correct behaviour for an owner who has not yet configured
   the secrets.

## IMPROVEMENTS

### Imp-43-B1 — Personal games now have a first-class "My games" overlay in Compare Sources

Phase 42 noted that the personal-games data path existed but did not
have its own rendering. The compare view showed the reference sources
side-by-side and offered no "your games" answer. The new
`MyGamesOverlay` sits below the reference columns and shows
N / moves / frequency / score for the player's own games at the
position. It deliberately lives in its own section so it cannot be
mistaken for a reference source.

### Imp-43-B2 — Engine arrows now have a hover tooltip

Hovering an engine arrow now reveals engine name + SAN + score + depth
in a small floating tooltip, using the same `aria-live="polite"`
pattern the rest of the board uses for live announcements. The visible
arrow is still drawn without text; the tooltip is on a separate HTML
layer with `pointer-events: none` so it never steals the cursor. The
underlying `EngineArrow` type carries the SAN, score, and depth so the
hover is one read away.

### Imp-43-B3 — Improvement summary now shows king-safety and tablebase counts

The existing `improvementReport` already published positions reviewed,
deviations, and themes — but the brief's example list calls out two
specific categories (king-safety critical moments and tablebase WDL
losses) that were not separately surfaced. They are now their own
figures with `drillTo: 'reviewed'` so the player can click through to
the actual positions, the same property the other countable figures
have.

### Imp-43-B4 — Browser matrix is now real

Phase 42 left the Playwright config on a single Chrome project.
`playwright.config.ts` now exposes four projects (`chrome`,
`chromium`, `firefox`, `webkit`) gated behind
`KF_E2E_MATRIX=1` (and the dedicated `npm run test:e2e:matrix` script).
The 16-test core workflow passed across Chromium, Firefox, and WebKit
in this run; the dedicated Chrome channel remains the default so
existing CI does not get a five-fold slowdown.

### Imp-43-B5 — Vercel auto-deploy status script is functional on macOS

The status script's path bug (Bug-43-A3) was masked by the failure
mode being indistinguishable from "the secrets are not configured".
Both messages now appear correctly: missing secrets print the
configuration hint, and a real git problem prints the original
diagnostic.

## NOT FOUND

These are things Phase 43 looked for and did not find.

- **Stale engine snapshots painting the current board.** The
  `EngineArrow` input's `analysedFen` is checked against
  `positionKey(currentFen)` before any arrow is emitted, and the
  `useEngineArrows` hook only re-renders when its dependencies change.
  This was the central mutation test in Phase 42; the certification
  pass found it intact.
- **A source unavailability rendering as "0 games".** The
  `SourceFallback` path renders an explicit banner and offers the
  local source as a button; the failure state is announced.
- **Backup partially modifying the profile before validation.** The
  backup repository applies inside a single IDB transaction; a
  malformed archive rolls back without touching the existing data.
- **`Saved` shown before the write commit.** The write tracker
  transitions through `pending → committed` and the UI binds to the
  committed state.

## NOT CERTIFIED IN THIS ENVIRONMENT

These require an operator's machine or credentials and belong in
documentation, not in a regression test.

- **Real Safari certification.** WebKit is the closest signal Playwright
  can produce and the matrix covers it; manual Safari validation is
  left to the owner.
- **Real Chrome with Developer ID / notarization.** The desktop
  package workflow signs and notarizes via the configured Apple
  Developer ID; if no such credential is configured locally, the gate
  remains open in production. Phase 43 did not change that.
- **Direct anonymous feedback sink.** The GitHub fallback is exercised
  by the E2E suite; a durable private sink remains an owner
  configuration choice.
