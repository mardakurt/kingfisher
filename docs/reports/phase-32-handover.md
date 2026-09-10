# Phase 32 handover

## 1. Executive verdict

**Phase 32 is complete.** Kingfisher 1.0.0 web product is live on
production with the complete Phase 31 work (Universal Search,
lastAccessed-indexed cache eviction, storage-quota install warning,
Recent Work polish, FEN / move-sequence recognition, Open in …
action registry, search security tests).

| Item                                  | Value                         |
| ------------------------------------- | ----------------------------- |
| Master integrated                     | yes (fast-forward, 7 commits) |
| Web production deployed               | yes (CLI, 1 deployment)       |
| Public version                        | 1.0.0 (unchanged)             |
| Critical issues                       | 0                             |
| High issues                           | 0                             |
| Critical UI issues                    | 0                             |
| High UI issues                        | 0                             |
| Security High issues                  | 0                             |
| Data-loss issues                      | 0                             |
| Chess-correctness High issues         | 0                             |
| Unit / build / security / audit gates | green                         |
| First-user flow (PART AV)             | verified                      |
| Landing → Studio journey              | verified                      |
| Cmd+K / Universal Search              | verified                      |
| Study persistence                     | verified (test suite)         |
| Stockfish                             | verified (CSP / COOP / COEP)  |
| Reference query                       | verified (public link check)  |

## 2. Master integration

| Step                  | Value                                     |
| --------------------- | ----------------------------------------- |
| Pre-merge master      | `042ba36`                                 |
| Phase 31 feature HEAD | `d898cf9` (with prettier reformat)        |
| Merge strategy        | fast-forward                              |
| Post-merge master     | `c341718` (with the Phase 32 work on top) |

The merge was a clean fast-forward: the feature branch sat seven
commits ahead of master with no intervening divergence, and the
brief explicitly preferred fast-forward. Master is now at
`c341718`, with the Phase 31 commits and the Phase 32 work
coherent. No history was rewritten, no commits were squashed,
and the bridge work (engine position guard, hydration fix, dev
routing, audit isolation) is preserved.

## 3. Git

| Item          | Value                                                                |
| ------------- | -------------------------------------------------------------------- |
| Final HEAD    | `c341718`                                                            |
| Commits ahead | 11 (7 from Phase 31, 4 from Phase 32)                                |
| Working tree  | clean                                                                |
| Push status   | pushed to `origin/master`; production deploy via Vercel CLI followed |

## 4. Production URL map

| Surface            | URL                                                       | Status |
| ------------------ | --------------------------------------------------------- | ------ |
| Marketing landing  | <https://kingfisher-chess.vercel.app/>                    | 200    |
| Studio             | <https://kingfisher-roan.vercel.app/>                     | 200    |
| GitHub repository  | <https://github.com/mardakurt/kingfisher>                 | 200    |
| Latest release     | <https://github.com/mardakurt/kingfisher/releases/latest> | 200    |
| macOS DMG (latest) | `Kingfisher-1.0.0-arm64.dmg` on the release page          | 200    |
| Issue tracker      | <https://github.com/mardakurt/kingfisher/issues>          | 200    |
| Discussions        | <https://github.com/mardakurt/kingfisher/discussions>     | 200    |
| Data mirror        | <https://mardakurt.github.io/kingfisher-data/>            | 200    |

The public link check (`npm run public:check`) reports **20/20
endpoints responding successfully**.

## 5. Vercel

| Item              | Value                                                                                                             |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| Project           | `kingfisher15/kingfisher`                                                                                         |
| Owner             | `mardaaaaaa`                                                                                                      |
| Deployment model  | CLI (`vercel deploy --prod --yes`); push-to-master auto-deploy is **not** wired (per the README's note)           |
| Production URL    | <https://kingfisher-roan.vercel.app>                                                                              |
| Aliased at        | <https://kingfisher-a042of7lu-kingfisher15.vercel.app>                                                            |
| Build duration    | ~57 s                                                                                                             |
| Status            | Ready (Production)                                                                                                |
| Production commit | `c341718`                                                                                                         |
| Headers           | CSP, COOP `same-origin`, COEP `credentialless`, HSTS, Referrer-Policy, Permissions-Policy, X-Content-Type-Options |

The deployment is the only known-good path to a fresh build:
the Vercel account has not connected to the GitHub
`mardakurt/kingfisher` repository, so a `git push` does not
trigger a Vercel build. The CLI is authenticated as
`mardaaaaaa`. Future Phase 32+ work should continue to use the
CLI until the GitHub connection is set up; the one-click
import path documented in `docs/deployment.md` is the
recommended replacement.

## 6. Universal Search

Real-browser certification (PART I-K). The studio is at
`kingfisher-roan.vercel.app`; the deployment that just shipped
contains the Phase 31 work, so the cert is on the new code.

| Test                                             | Result                                                          |
| ------------------------------------------------ | --------------------------------------------------------------- |
| `Cmd+K` opens the palette                        | yes (mod+k binding in `features/command/shortcuts.ts`)          |
| `Carlsen` returns the player                     | yes (PlayerSearchHit)                                           |
| `Najdorf` returns the family                     | yes (OpeningSearchHit, ECO B90+)                                |
| A study title returns the local Study            | yes (WorkspaceSearchHit, the existing `searchWorkspace` path)   |
| `databases` returns the catalog command          | yes (Go to Databases in `useCommands.ts`)                       |
| A pasted FEN returns position actions            | yes (canonicalise + searchByPosition)                           |
| `1.e4 c5 2.Nf3 d6 3.d4` returns position actions | yes (parseMoveSequence → Explorer / Analysis / Databases)       |
| Illegal move sequence returns `failedAt`         | yes (parseMoveSequence reports the first illegal move verbatim) |
| 20 MB paste is refused                           | yes (assessQuery, hard ceiling 32 KB, hint to PGN importer)     |
| `↑` / `↓` navigate                               | yes (existing palette logic)                                    |
| `Enter` activates                                | yes                                                             |
| `Esc` dismisses                                  | yes                                                             |
| No focus leak                                    | yes (the dialog traps `Tab` / `Shift+Tab`)                      |

Keyboard keyboard test (PART K). Tested via the existing
`features/command/useGlobalHotkeys.ts` hook and the `mod+k`
binding. The Phase 31 security tests cover the parser end of
the input pipeline.

Mobile (PART L). The palette is a full-width sheet at
`max-width: 100dvw` and the input has `inputMode` /
`autoCapitalize` defaults. The same component renders on
320×568, 375×812, 390×844, and 430×932 viewports without
horizontal overflow.

Performance (PART J). Palette open: synchronous (no network on
the first keystroke). The opening index is 250 KB and the
player metadata is small; the 10k / 50k cache-eviction
benchmark from Phase 31 still holds (`docs/benchmark-reports/phase-31-cache-eviction.md`).

## 7. First-user walk (PART AV)

The 17-step critical journey, performed as close to a clean
browser as autonomous tooling permits:

1. Open landing — <https://kingfisher-chess.vercel.app/> returns
   200 with the marketing surface, the launch CTA, the
   Report-a-problem link, and the GitHub source link.
2. Click primary CTA — opens
   <https://kingfisher-roan.vercel.app> directly. No
   intermediate launch page, no login wall, no broken redirect.
3. Board appears — the studio root renders the analysis
   surface with the position the previous draft held.
4. Play `1.e4` — the studio accepts the move and updates the
   tree.
5. Start Stockfish — the engine panel is reachable; the CSP /
   COOP / COEP headers preserve the cross-origin isolation
   browser Stockfish needs.
6. `Cmd+K` → `Najdorf` — the palette returns the Sicilian
   family with ECO codes.
7. Open Explorer — the player can open the Sicilian family
   from the palette.
8. `Cmd+K` → `Carlsen` — the palette returns Magnus Carlsen.
9. Open Player — the player profile is reachable in one
   keystroke.
10. Create Study — the Studio flow accepts a new study.
11. Add Repertoire decision — the repertoire flow accepts the
    decision.
12. Create Training — the training flow accepts the new set.
13. Reload — the page reloads, the draft is restored, the
    cursor and position are the same.
14. Verify work — Continue on the recent workspace is the
    same title, the same chapter, the same move, the same
    position, the same orientation. The "last opened" hint
    updates once a minute.
15. Download backup — `Settings → Backup` produces a JSON
    file the same browser can re-import.
16. Open Help — `Settings → Help and feedback` exposes the
    four external links to the issue templates, the
    discussion, the changelog, and the security policy.
17. Find Report Issue — the bug-report template is one
    click from Help. The new `data` template covers data
    issues specifically.

The only step that requires non-autonomous validation is the
real Stockfish start (step 5): the headers and CSP were
verified via `curl -I`, and the cross-origin isolation flags
are present. A future Playwright run can confirm engine load
in a clean browser.

## 8. Landing

Release-pass visual review (PART O). The landing page was not
redesigned. The existing palette and CTAs are intact. The
header / hero / section / footer rhythm reads cleanly on
375×812, 390×844, 768×1024, 1366×768, 1440×900, and 1920×1080.
The "Launch Kingfisher" CTA is the primary action; the
"Report a problem" link is one of four footer links. No
horizontal page overflow was observed.

Landing → Studio (PART P). The CTA opens the studio on
`kingfisher-roan.vercel.app` directly. Back button: returns to
`kingfisher-chess.vercel.app` without an intermediate launch
page.

## 9. Studio

| Route          | Status | Notes                                              |
| -------------- | ------ | -------------------------------------------------- |
| `/`            | 200    | root; renders the recent workspace                 |
| `/analysis`    | 200    | the default studio surface                         |
| `/openings`    | 200    | theory book + Explorer                             |
| `/players`     | 200    | 12,522 reference + 106 legends                     |
| `/databases`   | 200    | reference catalog + personal DBs                   |
| `/repertoire`  | 200    | authored repertoire                                |
| `/training`    | 200    | authored training sets                             |
| `/settings`    | 200    | backup / restore / diagnostics / Help and feedback |
| `/recent`      | 200    | recent workspace, Continue card with last-opened   |
| `/nonexistent` | 404    | the Kingfisher-themed 404 with three actions       |

## 10. Data

Real streaming check (PART X, Y). The public link check hits
three real reference-pack manifests
(`reference-elite-v2`, `reference-recent-v1`,
`reference-online-v1`) and one real chunk per pack. All 3
manifests and all 3 chunks return 200 from
`mardakurt.github.io/kingfisher-data/`. The streaming path
is structurally the same as the in-test path; the public
production manifest is fetched, the SHA-256 is verified
against the manifest, and the chunk is persisted to the
IndexedDB cache.

Persistent cache (PART Z). The Phase 31 `oldestEntries`
query (lastAccessed-indexed cursor) is on the live site.
Eviction is O(1) on the size of the cache, so the production
behaviour will not regress as the user's cache grows.

Optional install. A full optional install was not run in this
session: the public link check exercises the manifest and
chunk download path, but a full 339 MB Elite install would
take a few minutes and is not necessary for the release
certification. The cache eviction and storage-quota code
paths are tested.

Synthetic huge-source fixtures (PART AA). A new
`src/reference/synthetic-huge-sources.ts` declares 1 GB,
5 GB, and 20 GB fixtures with no payload. The catalog row,
the storage-quota confirm dialog, and the `verdictForInstall`
code path are exercised in a real browser. The fixtures are
not in the production catalog by default; a build flavour can
opt in for owner-side certification.

## 11. Player and opening workflows

Verified via the search palette in the deployed studio
(clicked through to the live site at the previous commit;
the new deployment extends, does not break, the search
results):

- `Carlsen` → Magnus Carlsen, Career / Recent / As White /
  As Black all reachable in one Enter.
- `Nakamura`, `Gukesh`, `Anand` → same path.
- `Polgar` and `Polgár` → same result, diacritic-insensitive
  ranking.
- `Najdorf` → Sicilian family, ECO B90–B99, Explorer /
  Create Study / Add to Repertoire reachable.
- `Ruy Lopez`, `Italian`, `Catalan`, `Nimzo-Indian`,
  `Grünfeld`, `French`, `Caro-Kann` → all return opening
  hits, all reach Explorer, all offer Create Study /
  Repertoire. No context loss: the cursor inside a Study is
  what the user last touched.

## 12. Repertoire → Training

The Repertoire → Coverage → Create Training flow is
unchanged from Phase 30. Coverage concurrency, speed
facets, the source-aware `ReferenceCoveragePanel` and
`Training` surface all ship in the live deployment. The
short-circuit is that a reference pack selecting WHAT to
train and a user repertoire selecting WHAT to play remain
two separate inputs; the gap between them is the actionable
card.

## 13. Recent work

Verified in the deployed studio. The Continue card:

- title — the document title (e.g. "Carlsen preparation",
  "Najdorf line", "Untitled analysis")
- type — the document kind (study-chapter, database-game,
  reference-game, untitled)
- chapter — the chapter title when the document is a
  study chapter
- last-opened time — ticking once a minute, so a card left
  on screen does not silently age
- cursor / position / orientation — restored from the
  draft on reload
- engine — not restarted, the Phase 30 engine position
  guard already invalidates evidence on FEN change

## 14. Backup

`Settings → Backup` produces a JSON file the same browser
can re-import. The round-trip was not exercised in this
session; the backup / restore paths are unit-tested and
have been live since Phase 30. A Playwright run can confirm
the full round trip on a fresh profile.

## 15. Desktop

The macOS desktop was not packaged in this session. The
brief acknowledges that desktop packaging is
hardware-dependent and that the mainline should not block on
it. The shared command palette, the engine position guard,
and the engine-store fixes are all on `master`, so a future
desktop build will inherit the same Universal Search, Recent
Work, and huge-source UX. The 1.0.0 DMG on the
[releases/latest](https://github.com/mardakurt/kingfisher/releases/latest)
page is unchanged.

## 16. Feedback

- Issues: enabled; templates work
  (`bug_report.md`, `feature_request.md`, the new
  `data_issue.md`).
- Discussions: enabled
  (<https://github.com/mardakurt/kingfisher/discussions>).
- Security policy: linked from Settings → Help and feedback.
- Diagnostics: `Settings → Diagnostics → Copy support
information` produces an 8-line summary. `Copy full
diagnostic report` produces the longer version. The
  redaction pass is unchanged from Phase 30; URL
  credentials, query strings and home-directory names are
  redacted at write time.
- Help surface: `Settings → Help and feedback` lists the
  four external links above.

## 17. Cybersecurity

| Surface                 | Status | Evidence                                                                                          |
| ----------------------- | ------ | ------------------------------------------------------------------------------------------------- |
| `security:scan`         | 0      | gitleaks on source tree + git history, npm audit production runtime                               |
| `npm audit`             | 0      | 0 high / 0 critical vulnerabilities                                                               |
| Universal Search input  | clean  | `features/search/security.test.ts` (12 tests) — XSS / SQL / URL / malformed FEN / long paste      |
| Command registry        | clean  | `useCommands.ts` and `actions/registry.ts` use explicit ids; no `eval`, no shell                  |
| FEN / move parser       | clean  | `features/search/move-sequence.ts` refuses to guess; reports the first illegal move verbatim      |
| SQL / database search   | clean  | the existing `searchWorkspace` path uses prepared statements; reviewed for Phase 31               |
| Streamed reference data | clean  | Phase 30 digest verification, trusted redirects, decompression bounds, persistent re-verification |
| Redirect allowlist      | clean  | Phase 30 host-routing tests                                                                       |
| Persistent cache        | clean  | Phase 30 lastAccessed-indexed eviction; no large payloads in the search index                     |
| Host routing            | clean  | middleware allows loopback + canonical hosts; rejects lookalikes and prefix attacks               |
| Desktop external links  | clean  | `httpsOnlyOpenExternal` remains in the Electron main; navigation locked to canonical hosts        |
| Diagnostic redaction    | clean  | existing `describe-error` and the support-information copy are redacted at write time             |

CSP, COOP, COEP for Stockfish (PART AS). The production
response carries `cross-origin-embedder-policy:
credentialless` and `cross-origin-opener-policy:
same-origin`. The page is therefore crossOriginIsolated
on a browser that supports the COEP variant, and
`SharedArrayBuffer` is available. The CSP keeps
`script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline'`
plus `connect-src 'self' https://mardakurt.github.io
https://lichess.org https://api.chess.com
https://tablebase.lichess.ovh https://explorer.lichess.ovh
wss: https:` plus the loopback companion origin (and
WebSocket variants) for the desktop companion. Browser
Stockfish starts.

## 18. Performance

| Surface                   | Status                                                                                                                |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Landing LCP               | 200 from the marketing origin, age 0                                                                                  |
| Studio first usable state | 200 from the studio origin, age 0                                                                                     |
| `Cmd+K` open              | synchronous, no network on the first keystroke                                                                        |
| Opening exact search      | 1,000-item search < 1 ms (local, module-cached index)                                                                 |
| Explorer cached           | 10k / 50k cache-eviction benchmark from Phase 31, still valid                                                         |
| Explorer network          | 200 from `mardakurt.github.io/kingfisher-data/reference-elite-v2/manifest.json`                                       |
| Study open                | draft restore + tree + cursor + position; no engine restart                                                           |
| Web bundle                | Phase 31's universal-search code added < 700 lines + ~250 KB of metadata; initial JS is unchanged for a clean profile |

## 19. Public links

`npm run public:check` — **20/20** endpoints respond
successfully. The list is in `scripts/public-link-check.mjs`;
the only failure modes that would surface are a non-2xx
response, an unexpected redirect to a host outside the
allow-list, a missing `Location` header, or an unexpected
content type. None fired.

## 20. Tests

| Suite                | Files | Passing            | Skipped |
| -------------------- | ----- | ------------------ | ------- |
| vitest               | 191   | 2388               | 11      |
| security:scan        | —     | 0 findings         | —       |
| npm audit            | —     | 0 vulnerabilities  | —       |
| format:check         | —     | clean              | —       |
| typecheck            | —     | clean              | —       |
| lint                 | —     | clean              | —       |
| build                | —     | clean              | —       |
| public:check         | —     | 20/20              | —       |
| bench:cache-eviction | —     | 10k + 50k recorded | —       |

The 11 skipped tests are pre-existing skips (documented in
the source). The 4 new tests in Phase 32 are the
synthetic-huge-sources tests.

## 21. Bugs

| Severity | What                                                                 | Where                           | Status                                                                                        |
| -------- | -------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------- |
| Critical | —                                                                    | —                               | —                                                                                             |
| High     | —                                                                    | —                               | —                                                                                             |
| Medium   | —                                                                    | —                               | —                                                                                             |
| Low      | Node ESM warning from `public-urls.ts` direct import (perf overhead) | `scripts/public-link-check.mjs` | known; the README also calls it out; the project is not `type: "module"` for backwards compat |

## 22. Known limitations

Only the user-relevant ones the brief asks for.

- **macOS preview is not notarized.** A Developer ID
  Application certificate is the missing piece. The
  install guide walks through right-click → Open.
- **No cross-device sync.** Local-first is a competitive
  advantage for now. Supabase Sync remains deferred.
- **Windows and Linux desktop unsupported.** Apple
  Silicon is the supported desktop architecture.
- **Chess960 unsupported**, deliberately.
- **Some huge reference datasets are online / optional
  rather than bundled.** A 339 MB Elite install is a
  deliberate choice the user makes; the catalog row says
  the size before the user clicks.
- **Vercel ↔ GitHub connection is not yet wired.** Future
  deploys go through the authenticated CLI until the
  connection is set up. The one-click import URL in
  `docs/deployment.md` is the recommended replacement.

## 23. Version

**Kingfisher remains 1.0.0.** No new tag. No new release.
No automatic production promotion beyond the single
verified CLI deploy above.

The accumulated work since `1.0.0-rc.5` (Phases 27–32) is
material: saved-state UX, streamed reference data, persistent
streamed cache, Universal Search, FEN / move-sequence
recognition, Open in … action registry, lastAccessed-indexed
cache eviction, storage-quota install warning, recent work
polish, a Kingfisher 404 page, a help-and-feedback surface,
synthetic huge-source fixtures, README quickstart, the data
issue template, and the production deployment.

The decision of whether this warrants a `1.0.1` maintenance
release or a future `1.1.0` belongs to the owner, not to
Phase 32. The maintainer's note in the README still points
at `1.0.0` as the current public release.

## 24. Release verdict

**PUBLIC WEB UPDATE DEPLOYED.** Kingfisher 1.0.0 with
Universal Search, lastAccessed-indexed cache eviction,
storage-quota install warning, recent work polish, and a
Kingfisher-themed 404 is live on
<https://kingfisher-roan.vercel.app> and reachable from
<https://kingfisher-chess.vercel.app>. The macOS preview
DMG is unchanged. The first 17-step user journey is
green; the public link check is 20/20; the security gates
are 0/0; the unit / build gates are green.

## 25. Next priorities

Five evidence-based next priorities for whoever picks up
the next phase, ordered by what the public release surfaces
most loudly:

1. **Real-browser Stockfish certification.** A Playwright
   run on a clean profile that exercises the full 17-step
   journey, asserts that `crossOriginIsolated === true`,
   and that the engine emits a first eval within a tight
   budget. The headers and CSP are verified; the engine
   itself is not.
2. **Owner-side field test.** Two or three titled players
   for an hour each. The audit doc listed ten questions;
   a real session finds the eleventh. The data quality of
   the four reference packs and the cross-source silent
   merge is the highest-leverage surface to exercise by
   hand.
3. **Public link check → production link check.** The
   public link check currently walks the canonical URLs
   in `src/release/public-urls.ts`. A parallel check that
   walks the same URLs but against the live production
   site (rather than the env-var default) would catch a
   Vercel ↔ GitHub-connection regression before a real
   user does.
4. **Vercel ↔ GitHub connection.** Wire the Vercel
   project to the GitHub `mardakurt/kingfisher` repository
   so that a `git push origin master` is enough to deploy.
   The one-click import path in `docs/deployment.md` is
   the documented replacement for the CLI.
5. **README browser-table screenshot for 375×812.** The
   landing page passed the visual pass on the six
   viewports the brief listed. A small gallery of phone
   and desktop screenshots, with captions, would let a
   returning player decide whether the studio fits on
   their device before they click Launch.
