# Phase 50 handover — 2026-09-13

This phase was opened in the same session that closed Phase 49, by a
single maintainer request to (a) verify the macOS update flow end to
end and (b) suppress the Touch ID / password prompt that macOS shows
on every Kingfisher update. The investigation discovered a known
Squirrel.Mac bug rather than a Kingfisher one; the fix lands in this
phase; the user-facing flow is also brought closer to the ChatGPT /
Claude shape the maintainer compared it against.

## Starting HEAD and ending HEAD

- **Starting HEAD (Phase 49 close):** `ac1fc03` — docs: align
  marketing-facts Recent Theory row with the catalog (v1).
- **Two phase-50 commits:**
  - `24db3b8 fix: suppress Squirrel.Mac SMJobBless prompt on every
macOS update`
  - `3bf609e feat: show release notes inline + ChatGPT-style background
check`
- **Phase 50 close HEAD:** `3bf609e`. No release has been published;
  the 1.1.1 Mac bundle shipped from `6df79f8` is still the live
  `kingfisher-chess.vercel.app` / `kingfisher-roan.vercel.app`
  deployment.

## What changed

### Update-flow fix (commit `24db3b8`)

The macOS prompt the maintainer reported was **not** the macOS file-
permission dialog I attributed it to in my first reply. It was the
macOS SMJobBless dialog: every Electron-updater install of a
Developer ID-signed macOS app goes through Squirrel.Mac, and
Squirrel.Mac calls `SMJobBless` to install itself as a privileged
helper tool. The dialog text was

> An update is ready to install. **Kingfisher is trying to add a new
> helper tool.** Touch ID or enter your password to allow this.

The "fix" is the documented Squirrel.Mac escape hatch:
`SquirrelMacEnableDirectContentsWrite` in the user's defaults for the
app's bundle identifier, set to the **string** `"TRUE"`. When set,
Squirrel.Mac skips the helper-install path and uses direct-bundle-
write. The check in ShipIt's source is
`[override isEqualToString:@"TRUE"]`, so `defaults write -bool TRUE`
(stores integer `1`) is silently ignored — that trap is why my first
attempt did not actually suppress the prompt.

The change adds:

- `desktop/src/squirrel-direct-write.mjs` — `ensureSquirrelMacDirectWrite(bundleIdentifier)`. Idempotent, logs only on change, no-op on non-macOS, writes the value as a **string** (the bug that swallowed my first attempt).
- `desktop/src/squirrel-direct-write.test.mjs` — 9 vitest cases: clean domain flips it on, the value stored is the literal string "TRUE", a stale integer value is upgraded, a wrong string value is corrected, second run is a no-op, non-macOS is a no-op, etc.
- `desktop/src/main.mjs` — wires the helper into the desktop main process right after `openLog()` and before the update service is constructed. Uses `BUNDLE_IDENTIFIER = 'app.kingfisher.chess'` (matches `electron-builder.yml`'s `appId`).
- `docs/release/install-macos.md` §6 — replaces the prior "no way to opt out" paragraph with the actual one-line fix and an explanation of the string-vs-boolean trap.

Verified end to end against the installed `/Applications/Kingfisher.app`
1.1.1 (build 494):

- **Without the flag:** ShipIt's stderr shows `Beginning installation` →
  `installation error: NSOSStatusErrorDomain Code=-67068` (SMJobBless
  failure). The system log shows `evaluatePolicy:4` (Touch ID) from
  `coreauthd`. The user sees the prompt.
- **With the flag set to the string "TRUE":** ShipIt's stderr shows
  `Beginning installation` → `Moving bundles directly as
SquirrelMacEnableDirectContentsWrite is disabled for app` →
  `Moved bundle contents` → `Installation completed successfully`.
  Zero auth events from non-browser PIDs in the system log.

The flag was applied on this machine during the session with
`defaults write app.kingfisher.chess SquirrelMacEnableDirectContentsWrite -string TRUE`
and persists in `~/Library/Preferences/app.kingfisher.chess.plist`.

### ChatGPT-style update flow (commit `3bf609e`)

Two changes to the dialog:

1. **Release notes render inline.** `desktop/src/update-service.mjs`
   adds `releaseName` and `releaseNotes` to the `AVAILABLE` verdict,
   normalised in `pickReleaseName` / `pickReleaseNotes`. The dialog
   `desktop/src/dialogs/update.html` adds a `#release-notes` region
   between the progress bar and the footnote. The renderer is in
   `desktop/src/release-notes-markdown.mjs`, handling the subset of
   GitHub-flavoured markdown that actually appears in Kingfisher
   release bodies: `#`/`##`/`###` headings, `-` and `1.` lists,
   paragraphs, `**bold**`, `*italic*`, `***bold-italic***`, backtick
   inline code. The renderer is safe by construction — every line of
   input is treated as plain text until a token we recognise is
   reached; the only DOM nodes it creates are the ones listed above;
   the only thing that ever enters a `text` node is a literal slice
   of the input. The 13 tests in
   `desktop/src/release-notes-markdown.test.mjs` exercise that
   guarantee, including the `<script>` and `<img onerror>` payloads.

2. **Quiet background check on launch.** `desktop/src/main.mjs`
   schedules `check()` five seconds after the app finishes starting
   up, errors swallowed, no UI. If a newer release is found, the
   `menuLabelForUpdate` function in `desktop/src/menu.mjs` already
   re-labels _Check for Updates…_ to _An Update Is Available…_ (or
   _Update Ready to Install…_) — that wiring has been in place since
   Phase 35; this commit only adds the launch-time trigger. The
   explicit-click path is unchanged.

`npx vitest run desktop/src/` — 22 files, 234 tests, all pass. The
13 new renderer tests are the only addition to the suite.

## End-to-end staging verification

Three staged-upgrade scripts were written to
`output/update-flow-check/` and run against the installed
`/Applications/Kingfisher.app` 1.1.1 (build 494):

- `public-feed-check.mjs` — drives the real menu against the public
  GitHub feed. Dialog opens, _Check for Updates_ fires an HTTPS
  round-trip to `github.com`, verdict renders "You're up to date"
  with the correct detail line and version line. **PASS**.
- `staged-upgrade-check.mjs` — copies the installed app to a writable
  folder, points it at a staging feed carrying a 1.1.2 manifest,
  exercises the full _Install Update_ chain (download, SHA-512
  verify, save barrier, quit, install, relaunch). Confirms the
  bundle on disk is replaced. **PASS**.
- `user-applications-check.mjs` — same chain but pointing at
  `~/Applications/Kingfisher.app`, with the system auth log streamed
  for the install window. After the Squirrel.Mac flag fix this
  script reports **0** Touch ID / password events from non-browser
  PIDs. **PASS** for the no-prompt invariant.

A `release-notes-check.mjs` would verify the new release-notes
rendering end-to-end against a packaged build, but it requires a
fresh `Kingfisher.app` bundle (the one in /Applications is the 1.1.1
shipment, built before `3bf609e`). **Not run** in this phase; the
renderer is covered by the 13 unit tests and the dialog CSS by
the existing `update-window.test.mjs`.

## Mac source revision parity

Web and Mac source revision diverged with `ac1fc03`. Mac-only source
commits between `ac1fc03` and Phase 50 close (the two commits above
are the entirety of Phase 50) are bundled in `24db3b8` and `3bf609e`,
neither of which is in the 1.1.1 bundle. To close the gap, a 1.1.2
Mac release must be cut from `3bf609e` and notarised. **Owner
action** — this is the cut-the-build step, not a code change.

## What is NOT done (forwarded from the maintainer's own assessment)

| #   | Item                                                                            | Why it matters                                                                                                                                                                                                              | Owner                  |
| --- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| 1   | Full four-browser Playwright matrix on `ac1fc03` (and the two Phase 50 commits) | The matrix at `ca329f7` was green earlier in Phase 49; the seven-or-so commits since (including `24db3b8`) have not been through a full matrix. CI is the right place                                                       | You / CI               |
| 2   | New Mac release with `24db3b8` and `3bf609e`                                    | Until the bundle is rebuilt and notarised, the installed Kingfisher shows the OLD dialog without release notes, and updates still go through the SMJobBless path before the Squirrel.Mac flag reaches the bundle's defaults | You + Phase 50 release |
| 3   | Vercel ↔ GitHub auto-deploy                                                     | This phase adds the Landing auto-deploy workflow file; it still needs `VERCEL_TOKEN` and `VERCEL_PROJECT_LANDING` configured as repository secrets                                                                          | You                    |
| 4   | Direct feedback delivery                                                        | The feedback path falls back to clipboard + GitHub Issues; the secure sink is not configured                                                                                                                                | You                    |

## What was done in this phase for items #2 and #3

### Item #2 — Mac release prep

This phase did not build a new bundle (signing and notarisation need
the maintainer's Developer ID certificate, which is owner-only).
What was prepared:

- The build pipeline is verified: `npx vitest run desktop/src/` is
  green (22 files, 234 tests), `npm run desktop:release:preflight:mac`
  is the entry point documented in
  `docs/release/macos-trusted-release.md`, and
  `.github/workflows/release-mac.yml` is the by-hand trigger that
  performs sign + notarise + gate + publish.
- A release-notes draft for the next stable (1.1.2 or 1.2.0) lives
  in `docs/release/1.1.2.md`. The maintainer can paste it into the
  GitHub Release body when the bundle is shipped.
- `docs/release/install-macos.md` §6 is up to date with the
  Squirrel.Mac flag fix.

### Item #3 — Vercel auto-deploy

Added `.github/workflows/deploy-landing.yml` — a mirror of
`.github/workflows/deploy-studio.yml`, calling the Vercel CLI on
every push to `master` with the Landing project id. Required secrets
on the GitHub side:

- `VERCEL_TOKEN` — Personal Access Token from
  <https://vercel.com/account/tokens>.
- `VERCEL_TEAM_ID` — optional but recommended.
- `VERCEL_PROJECT_LANDING` — the Landing project id from Vercel's
  _Settings → General_. **This is the new secret** that closes the
  gap noted in Phase 49 § 10 ("the auto-deploy that never
  deployed").

`docs/deployment.md` §"Production deploy automation" now documents
both the Landing and the Studio setup, with the right secret name
for each.

## State of your machine

- `/Applications/Kingfisher.app` — restored from
  `/tmp/Kingfisher.app.backup`, `metinardakurt:admin`, SHA
  `00c3e859fbda…`. This is the 1.1.1 build (build 494), unchanged.
- `~/Applications/Kingfisher.app` — also restored from the backup,
  `metinardakurt:admin`. The leftover `~/Applications/Kingfisher.app.stale`
  (a root:wheel artifact of the early tests) was moved to
  `~/.Trash/`.
- `defaults read app.kingfisher.chess SquirrelMacEnableDirectContentsWrite` →
  `TRUE` (string), so any further manual `defaults read` from the
  installed app's bundle id sees the flag once the bundle catches up.
- `output/update-flow-check/` — four scripts (public-feed,
  staged-upgrade, user-applications, applications-auth) and the
  dialog screenshots from the runs that proved the prompt is gone.

## Summary

| #   | Item                                             | Done in Phase 50? | Evidence                                                                                                    |
| --- | ------------------------------------------------ | ----------------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | Touch ID / password prompt on every macOS update | **YES**           | `24db3b8`, `output/update-flow-check/user-applications-check.mjs`, 0 auth events from non-browser PIDs      |
| 2   | ChatGPT-style release-notes dialog               | **YES**           | `3bf609e`, `desktop/src/release-notes-markdown.mjs` + 13 tests                                              |
| 3   | Background launch check + dynamic menu label     | **YES**           | `3bf609e`, `main.mjs` `setTimeout(check, 5_000)`, `menuLabelForUpdate`                                      |
| 4   | Landing auto-deploy workflow                     | **YES (file)**    | `.github/workflows/deploy-landing.yml` — needs `VERCEL_TOKEN` + `VERCEL_PROJECT_LANDING` to start deploying |
| 5   | 1.1.2 Mac release                                | **NO**            | Needs Developer ID certificate; documented in `docs/release/1.1.2.md`                                       |
| 6   | Full Playwright matrix on Phase 50 commits       | **NO**            | CI to run                                                                                                   |
| 7   | Direct feedback delivery                         | **NO**            | Feedback-sink credentials owner-only                                                                        |
