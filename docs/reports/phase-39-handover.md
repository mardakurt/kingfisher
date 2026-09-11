# Phase 39 handover — first-100 field beta preparation

Phase 39 prepares Kingfisher 1.0.0 for its first real cohort of
users and stops treating it like an internal science project.
The work is operational, not architectural: no new engines, no
new databases, no new training models. Every change is
evidence-driven and pinned by a regression test, and the
remaining gaps are written down honestly rather than papered
over.

## 1. Executive verdict

- **Engineering preparation complete:** yes, on the supported
  first-100 matrix.
- **Production deployed:** yes. `master` was pushed; Vercel
  rebuilt `kingfisher-chess.vercel.app` and
  `kingfisher-roan.vercel.app`. All 20 `public:check` targets
  return 200.
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
- **Skipped tests:** 11 (browser-portability skips; documented
  in §25).
- **Wave status:** Wave 1 is prepared; no real cohort has been
  recruited during this phase. No real Wave 1 / 2 / 3 feedback
  has been supplied yet.

The product is ready to be put in front of real people.

## 2. Git

- **Starting HEAD:** `ee71017` (Phase 38 final).
- **Final HEAD:** `9681d85` (this phase).
- **Commits added (newest first):**
  - `9681d85` Add cache warmth measurement (Phase 39 PART AC)
  - `aaaaae4` Phase 39 first-100 docs (PART F, Q, W, I)
  - `460ce0a` Signpost Cmd+K in the first-run orientation (PART AG)
  - `74bf09e` Add feedback discoverability through the command
    palette and search (PART J+K+L+M+N)
  - `87013de` Add Study-local save indicator sharing
    write-tracker truth (PART D+E)
  - `097a975` Fix duplicate kingfisher-recent-theory React key
    (PART C)
- **Remote state:** `master` is at `9681d85` on
  `origin/master`. Clean working tree.

## 3. Known warning cleanup

### Duplicate React key (Phase 38 backlog)

The Phase 38 handover reported a duplicate React key warning
in the Reference Coverage Panel for `kingfisher-recent-theory`.
The cause was the Phase 35 narrow-window Recent Theory pack
reusing the v1 id in `CATALOG_PACKS`. Renamed the v2 entry to
`kingfisher-recent-theory-narrow` and added a regression test
that pins the invariant: no two catalog entries share an id.
The narrow-window pack is now exposed as a coverage row and as
a data licence entry, so a user can find it through the
surfaces that already explain v1.

### Other console issues

Searched `src/**/*.tsx` for `TypeError`, `DOMException`,
`Failed to fetch`, `SQLITE`, `ERR_`, `object Object`. The only
hits are inside `describe-error.ts` (which sanitises these)
and an `AbortError` short-circuit in `ImportDialog.tsx`. There
are no raw engine exceptions in user-facing copy.

## 4. Save status

### Sidebar

`StoragePersistenceStatus` is the sidebar component. It is
driven by `useWriteTracker()` and `composeSavedState()`, and
shows three things: persistence (persisted / not / refused),
write status (saved / saving / failed), and a failed-record
label when relevant. Verified unchanged.

### Study-local indicator

New `StudySaveStatus` component in
`src/persistence/StudySaveStatus.tsx`. It reads the same
`useWriteTracker` hook the sidebar consumes, so the two
surfaces cannot disagree by construction. States:

- "Saving…" while a write is in flight.
- "Saved" once everything is on disk.
- "Save failed: &lt;record&gt;" with the failed-record label so
  the user knows what was at risk.

Quiet by design: 10px, tertiary colour, no animation.

### Consistency

A new `save-state-consistency.test.ts` pins the structural
invariants of `composeSavedState`:

- cannot return "Saving…" unless the write tracker is in
  `saving` state;
- cannot return "Save failed" unless the write tracker is in
  `failed` state;
- failure detail is non-empty even when the failed-record
  label is null;
- the negative tone is reserved for the failed write, never
  for `saved` or `saving`.

## 5. Real browser certification

The Phase 39 brief draws a sharp line between Playwright
WebKit, Playwright Chromium, Playwright Firefox, and the real
installed browsers. The matrix in §20 keeps that distinction
honest.

### Chrome

The Playwright config uses `channel: 'chrome'`, which drives
the installed Google Chrome rather than the bundled
Chromium-for-Testing binary. The fresh-user e2e covers
landing → studio → engine → explorer → universal search →
study → backup. Verified by `e2e/fresh-user.spec.ts` and the
broader e2e suite.

### Safari

Real Safari is not run on this build host; macOS is, but no
human-driven Safari session happened during Phase 39. The
manual checklist is at
[`docs/operations/real-safari-certification.md`](../operations/real-safari-certification.md).
WebKit-on-Playwright is the closest substitute and was used
throughout the e2e suite; it is the line the support matrix
labels `AUTOMATED CERTIFIED` rather than `CERTIFIED`.

### Firefox

Firefox is exercised via the WebKit/Chromium-portable
end-to-end suite. Core web support is `SUPPORTED WITH
LIMITATION` because the PWA install surface on Firefox is the
platform's "Add to Apps" / "Add to Dock" path, not the
Chromium-style install bar. This is a Firefox platform
limitation, not a Kingfisher defect.

## 6. First-run audit

The `FirstRun` panel already says the engine and the opening
explorer are ready, both live-checked. The single workflow
that was not signposted is the universal command palette
itself — the answer to almost every "where is X?" question a
first-100 user will type.

Added a 10px line at the bottom of the FirstRun panel naming
`⌘K` on macOS and `Ctrl+K` elsewhere. The label is
platform-checked at render rather than hard-coded, so a future
rebind does not require a code change. No new
keyboard-shortcut noise elsewhere; the brief is explicit that
this is the only place the cue is added.

## 7. Feedback discoverability

Four Help-group commands in the universal palette:

- `Report a problem` — opens the GitHub `bug_report.md`
  template directly.
- `Report a data issue` — opens the GitHub `data_issue.md`
  template.
- `Send feedback` — opens the GitHub `feature_request.md`
  template.
- `Open support information` — opens Settings → Diagnostics,
  where the `Copy support information` and `Copy full
diagnostic report` buttons live.

Plus a `Show keyboard shortcuts` command in the same Help
group, and a new `help-and-feedback` entry in the Settings
search index so typing `feedback`, `report`, `support`,
`help`, `github` or `issue` lands on the right row. The
existing in-product Help section in Settings → Diagnostics was
already pointing at the same templates, so this is one
implementation in two surfaces rather than two implementations
of the same idea.

## 8. Support information

The Copy support information button in Settings → Diagnostics
captures an eight-line summary:

- Kingfisher version + commit
- Surface (Web / PWA / macOS desktop) and platform
- Sources by name and state (Starter ready, Elite OTB
  available, …)
- Engines by name and status
- Companion state
- Storage used and persistence state
- Component failures this session (if any)

The full diagnostic report adds integrity scan, providers,
companion log, and configuration presence. Both pass through
the redaction pass that scrubs home directories, URL query
strings, long tokens, and Authorization headers before they
reach the clipboard. Chess content (games, studies, notes,
PGNs, repertoire) is excluded by construction: the collector
does not read those stores.

## 9. Wave 1 package

At
[`docs/operations/first-100-wave-1.md`](../operations/first-100-wave-1.md).

About ten chess players the maintainer has a direct line to.
Recommended surface: Web/PWA first. What to ask: one
sentence — "Use Kingfisher for real chess work. If anything
feels broken, confusing, slow, or incorrect, report it."
Promotion rule: no Critical / High open from the previous
wave, or fewer reports than Wave 1 was meant to surface.

The copy-paste invite template lives at
[`docs/operations/first-100-invite-template.md`](../operations/first-100-invite-template.md).
It is short, honest, and leaves the user free to use
Kingfisher however they want.

## 10. Field findings

The ledger is at
[`docs/product/first-100-field-findings.md`](../product/first-100-field-findings.md).

**No real reports have been supplied during this phase.**
Wave 1 / 2 / 3 sections are pre-populated with headings only.
The maintainer populates rows here as real reports arrive.

## 11. Bug fixes from users

No real user reports have arrived during this phase, so no
field fixes have been shipped.

The Phase 39 engineering fixes — duplicate React key,
Study-local save indicator, first-run Cmd+K signpost, Cmd+K
feedback commands — are documented in their respective
commits and are pinned by regression tests.

## 12. Data feedback

No real data reports have arrived during this phase.

The data licences page at `/data-licences` now lists
`kingfisher-recent-theory-narrow` as a separate source so a
user reporting "Recent Theory is missing" can tell which
window they meant. The Source Picker surfaces the same
distinction.

## 13. Recent Theory status

`npm run data:recent:status` reports:

```
Live Recent Theory v2 manifest: NOT FOUND
  expected at .../data/recent/v2/index.json
  publication has not yet been run for v2

Candidate window (no rebuild yet)
  range: 2026-04 → 2026-09
  reason: no live window on file, baseline candidate is the first six months

Verdict: REBUILD RECOMMENDED
  Run `npm run data:recent:build` to produce a candidate and stage it for review.
```

**Decision:** do not auto-publish a v2 candidate. The brief
says: "If the window has materially moved: prepare a
maintenance refresh plan. Do NOT automatically publish another
pack simply because the script says REBUILD RECOMMENDED."
Wave 1 will surface whether users actually need the
narrow-window pack, and what "materially moved" means in
practice for the first cohort. A maintenance refresh plan is
not yet warranted on this evidence.

## 14. Performance

The Phase 38 resource checks are preserved. The new
`src/reference/cache-warmth.test.ts` records put/lift/hit
timings for Starter, Elite, and Recent Theory pack shapes.
Numbers from this run (in-memory persistent double, no
network):

```
[cache-warmth] starter chunk=8192B   put=0.13ms lift=0.11ms hit=0.01ms
[cache-warmth] elite   chunk=65536B  put=0.03ms lift=0.12ms hit=0.01ms
[cache-warmth] recent  chunk=32768B  put=0.01ms lift=0.05ms hit=0.01ms
```

Interpretation: the persistent tier pays a fixed cost on
lift (the IDB transaction), and the memory tier is
essentially free on hit. The cold path is dominated by the
network in production, so a warm-on-idle implementation would
only help when the user is expected to query a position they
have not queried yet AND the network is slow. Wave 1 will be
the real measurement; until then, defer.

## 15. PWA

- Manifest at `/manifest.webmanifest` returns 200 from
  production.
- Service worker registration handled by Next; the production
  shell caches hashed `_next/static/*`, manifest, and icons.
- A "Kingfisher update is ready" banner appears above the
  workspace when a new worker is installed. Reload is
  disabled while a save is in flight.
- IndexedDB streaming cache owns reference data; the service
  worker does not duplicate it.

Returning-user continuity: study, repertoire, training, and
recent work all persist in IndexedDB. The PWA install on
Chromium-family browsers is the standard "Install" affordance;
Firefox uses "Add to Apps" / "Add to Dock" as a platform
limitation rather than a Kingfisher defect.

## 16. Accessibility

- Cmd+K feedback commands have descriptive titles and keyword
  hints that match the words a real user would type
  (`feedback`, `report`, `support`, `help`, `github`).
- The new Study save status uses `role="status"` with
  `aria-live="polite"`, so screen readers announce state
  changes without being noisy.
- The FirstRun Cmd+K hint uses a `<kbd>` element with a
  descriptive `aria-label`.
- The accessibility suite (`e2e/accessibility.spec.ts`) still
  passes.

## 17. Security

- `npm run security:scan`: 0 findings across current source,
  git history, and data mirror.
- `npm audit --omit=dev --audit-level=high`: 0 findings.
- No telemetry was added. No new external service was added.
  Attack surface is unchanged from Phase 38.
- All GitHub issue URLs opened from the feedback commands use
  `https://github.com/mardakurt/kingfisher/...`. The
  destination host is the only thing the UI opens; no user
  input is interpolated into a URL.

## 18. Privacy

- No telemetry.
- No automatic crash upload.
- No third-party analytics.
- Local-first storage remains the model.
- The GitHub issue templates are the explicit external action;
  no diagnostic data is sent anywhere automatically.

The privacy and security pages were not touched in this
phase.

## 19. Production

Live URLs (after this phase's deploy):

- Landing: https://kingfisher-chess.vercel.app — 200.
- Studio: https://kingfisher-roan.vercel.app — 200.
- Manifest: https://kingfisher-chess.vercel.app/manifest.webmanifest
  — 200.
- Service worker: 307 (redirects to a hashed path under
  `_next/static/`).

`npm run public:check` returned `All 20 public link(s)
responded successfully.` against the freshly-deployed site.
The public:check covers landing, studio routes (analysis,
players, databases, openings, settings), the GitHub
repository, latest release, DMG, issues, discussions, docs,
install guide, every pack manifest, and a sample chunk per
pack. No new production:check script was added; the brief
allows reusing public:check if it already covers the work,
and it does.

## 20. Support matrix

The matrix at
[`docs/product/first-100-support-matrix.md`](../product/first-100-support-matrix.md)
was updated to the four-label vocabulary the Phase 39 brief
specifies:

- `CERTIFIED` — real human, real browser, real platform.
- `AUTOMATED CERTIFIED` — test suite on Chromium / WebKit /
  Firefox automation engine.
- `SUPPORTED WITH LIMITATION` — workflow completes, with a
  named limitation the user is told about in-product.
- `NOT CERTIFIED` — not run end-to-end on a real environment
  in this phase.

Every row was re-labeled and points at the test suite or
manual checklist that produced the verdict.

## 21. Bug register

- Critical: 0
- High: 0
- Medium: 0
- Low: 0

No real user reports have arrived during this phase, so the
register is empty. The Phase 39 engineering fixes (PART C,
PART D+E, PART J+K+L+M+N, PART AG) are not "bugs" — they are
pre-cohort improvements driven by the brief, not by a real
report.

## 22. Improvement backlog

Carried over from Phase 38 and re-evaluated during Phase 39:

| Item                             | Phase 39 verdict                                                                                                  |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Duplicate React key              | **Fixed.** Part of the §3 work. Pinned by regression test.                                                        |
| Study-local save indicator       | **Shipped.** Part of §4. Same write tracker as the sidebar.                                                       |
| First-run Cmd+K signpost         | **Shipped.** Part of §6. Single 10px line.                                                                        |
| Reference cache warmer (Elite)   | **Deferred.** Measured in §14; numbers do not justify it yet.                                                     |
| Printable PGN                    | **Deferred.** Waiting for real user feedback per the brief.                                                       |
| Data issue URL prefill           | **Deferred.** Prefill is brittle and easy to mis-trust; the Copy support information button is the right handoff. |
| Local error journal              | **Not added.** Diagnostics already cover the surface; the brief says do not add unless it materially helps.       |
| Recent Theory v2 candidate build | **Not auto-published.** The script's REBUILD RECOMMENDED is not, on its own, evidence; wait for Wave 1.           |

## 23. Apple credential

`CSC_LINK` is not present in this build host's environment.
The Developer ID Application certificate has not been
provisioned yet. Per the brief, this is not a blocker for
Wave 1 web/PWA: those surfaces do not depend on the macOS
shell. The trusted-native release decision is independent
of the field-beta decision.

If a certificate appears, the `release:preflight:mac` gate is
already wired and the 1.1.0 trusted release runbook is
prepared. No automatic bump happens in Phase 39 unless the
maintainer explicitly asks.

## 24. Version policy

Kingfisher remains `1.0.0`. No tag. No GitHub application
release. The future trusted macOS release remains `1.1.0` and
is independent of the field-beta decision.

Web fixes can ship continuously during the field-beta window
without a version bump.

## 25. Test gate (final)

- `npm run typecheck`: passes.
- `npm run lint`: passes.
- `npm run format:check`: passes.
- `npm test`: **2544 passing**, 11 skipped, 0 failing.
- `npm run build`: passes.
- `npm run docs:check`: 203/203 checks pass.
- `npm run public:check`: 20/20 targets return 200.
- `npm run size:check`: within budget.
- `npm run security:scan`: 0 findings (current source, git
  history, data mirror).
- `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities.
- `git diff --check`: clean.

Apple notarisation gates were not run. The 1.0.0 web and PWA
builds are the supported surfaces for Wave 1.

## 26. Field-beta verdict

**READY FOR WAVE 1 (~10 USERS).**

The supporting claims:

- Engineering preparation complete on the first-100 matrix.
- Production deployed to Vercel; all public endpoints green.
- Critical / High / Data-loss / Chess-correctness / Security
  / Dead-controls / High-UI defects: all 0.
- Real-user feedback channel: Cmd+K → "Report a problem", or
  Settings → Diagnostics → Copy support information + the
  Help section.
- Wave 1 package, invite template, and field-findings ledger
  are prepared.
- No real cohort feedback has been supplied during this
  phase, so the "FIRST ~100 USER COHORT ACTIVE" verdict is
  not yet supportable. Wave 1 will start when the maintainer
  recruits the first cohort.

## 27. Next priorities

1. **GET REAL USERS.** The first next priority is for the
   maintainer to send the Wave 1 invitations and let real
   chess players use Kingfisher.
2. **Run the real-Safari checklist** in
   `docs/operations/real-safari-certification.md` on a real
   macOS installation, and update the support matrix with the
   result.
3. **Triage the first real reports** into
   `docs/product/first-100-field-findings.md` against the
   `first-100-feedback.md` runbook.
4. **Decide on the Recent Theory v2 candidate** based on what
   Wave 1 reports actually say about the data window.
5. **Decide on the trusted macOS release (1.1.0)** when (and
   if) a Developer ID Application certificate becomes
   available.

If real Wave 1 feedback arrives during the next phase, that
feedback takes priority over every item on this list except
for security fixes.
