# Phase 54 handover — the update engine is Sparkle; 1.1.8 and 1.1.9

Two sessions share this phase. One replaced `electron-updater` with
Sparkle and committed the migration (`5d7c641`) without having driven a
real update through it. This one controlled that work: it drove the
update as a person performs it, fixed what the driving found, brought the
documents back to what the code does, and made the release the change
needed — because an installed 1.1.7 can only reach Sparkle by being
offered a build that carries it.

Every number below is the output of a command that was run, under Node 24
(`~/.nvm/versions/node/v24.14.0`; with Node 20 first on `PATH` the unit
suite reports 18 failed files, none about this code).

## Where the repository is

- `5d7c641` — the migration (the other session's commit).
- `84e1a70` — the control pass: what the real update found, fixed.
- `b5cc839` — `release: Kingfisher 1.1.8`; build 588 is made from it.
- `d76d3c6` — the 1.1.8 descriptor and docs, the stale-feed guard in
  `release:mac:publish`, and the relaunch-handoff fix
  (`mayTakeRelaunchProfile`) that the 1.1.8 gates found — a shell change,
  which is why there is a 1.1.9.
- `d46fe98` — `release: Kingfisher 1.1.9`; build 590 is made from it.
- the descriptor/docs commit that follows it — names the published 1.1.9
  bytes, the walk that reads Sparkle's window, and this report.

## What the control pass found

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                    | Fix                                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `scripts/desktop-lib/sparkle-ui.mjs` wrote its separators as backslash-u escapes, which AppleScript does not have; the script never compiled and `windowsOf()` said "no windows". The first `desktop:update:real` never saw Sparkle's window; it completed only because a person clicked.                                                                                                                                                  | `character id N` separators; a compile failure throws; sheets are listed with their window; every query names the process under test by **pid**.                                                                                                                                                       |
| 2   | The harness expected a pre-generated `appcast.xml`, but an appcast names its archive by absolute URL and the harness picks a port at run time; `generate_appcast` silently fell back to the bundle's own feed URL.                                                                                                                                                                                                                         | The harness writes its own feed for its port, signed with the same key.                                                                                                                                                                                                                                |
| 3   | In a checkout (`electron .`) Sparkle _started_ — Electron.app is code signed and names no feed, so Sparkle accepts it as a host — and _Check for Updates…_ ended in Sparkle's "Update Error" alert.                                                                                                                                                                                                                                        | `sparkle-updater.start()` refuses an unpackaged host before Sparkle is asked; the sheet says "Updates are not available in this build".                                                                                                                                                                |
| 4   | The service's three message boxes had no parent window; macOS runs such a box app-modal on the main thread, and the shell answered nothing — not the renderer, not a harness — until it was dismissed.                                                                                                                                                                                                                                     | They hang from the main window as sheets (`parentWindow` in `startUpdater`).                                                                                                                                                                                                                           |
| 5   | `desktop:update:e2e` refused its own plain-HTTP staging enclosure (`allowHttp` passed and ignored) and demanded release notes for a version `CHANGELOG.md` did not name yet.                                                                                                                                                                                                                                                               | `appcastMismatch` honours `allowHttp`; notes are required exactly when the changelog has the entry.                                                                                                                                                                                                    |
| 6   | The output directory keeps older builds' files; a `latest-mac.yml` from the previous release sat beside the new ZIP and `release:mac:appcast` refused to choose among six ZIPs.                                                                                                                                                                                                                                                            | `release:mac:publish` refuses a `latest-mac.yml` whose version or SHA-512 is not this release's ZIP (proved: it refused a 1.1.7 feed before any `gh` call).                                                                                                                                            |
| 8   | A launch with an explicit `--user-data-dir` took the relaunch handoff. The 1.1.8 certify's walk launched a Kingfisher with its own profile a moment after the public-feed harness had installed an update; the walk's instance adopted the harness's profile, and the real relaunch — no arguments — found nothing and opened the owner's default profile.                                                                                 | `mayTakeRelaunchProfile`: a launch that names its profile leaves the file for the relaunch. The public 1.1.8 carries the defect; 1.1.9 does not.                                                                                                                                                       |
| 9   | The seeded walk's _Check for Updates…_ action still looked for the old `update.html` window; Sparkle's native "You're up to date!" alert is modal, and the walk hung on it (twice, 27 minutes each, 0 % CPU).                                                                                                                                                                                                                              | The walk reads Sparkle's window through the Accessibility API and dismisses it — OK, Cancel Update or the close button; never Install Update (it would replace the bundle under test) and never Skip This Version (Sparkle remembers it in user defaults shared with every Kingfisher on the machine). |
| 10  | The output directory keeps older builds' files; `release:mac:appcast` refused to choose among six ZIPs, and 1.1.7's `latest-mac.yml` sat beside the 1.1.8 ZIP.                                                                                                                                                                                                                                                                             | `--zip` names the archive; `release:mac:publish` refuses a `latest-mac.yml` whose version or SHA-512 is not this release's ZIP (it refused a 1.1.7 feed before any `gh` call).                                                                                                                         |
| 7   | AGENTS.md still described electron-updater; SECURITY.md and the public security page said "no background check" while a quiet information-only check has run at launch since Phase 50; the privacy page said "signed SHA-512" of a Sparkle feed; the install guide presented the Squirrel.Mac prompt as current; the layout doc called the handoff directory Sparkle's cache; the trusted-release runbook said notarise rewrites the feed. | Each says what the code does. The public security page's claim changed, so `docs/product/public-claims.md` changed with it.                                                                                                                                                                            |

## The real update, four times

`npm run desktop:update:real` drives Sparkle's own windows through the
Accessibility API (System Events, by pid). Each row is one run; a copy of
the current bundle in a temporary directory, a fresh profile, a study
authored before the update and found after it.

| current                                                | next                                    | feed                                            | result                                                                                                                                                                                                                                        |
| ------------------------------------------------------ | --------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1.7 build 584, Sparkle (dev)                         | 1.1.8 build 600 (dev)                   | staging server, two redirects as GitHub         | **19/19** — "Kingfisher 1.1.8 is now available—you have 1.1.7"; Install Update → download → Install and Relaunch; bundle replaced, `--deep --strict` verifies, relaunched onto the test profile, Sparkle started, notice shown, study present |
| 1.1.7 build 583, **the public electron-updater build** | 1.1.8 build 600 (dev)                   | staging `latest-mac.yml`                        | **16/16** — the previous engine's dialog offered 1.1.8, installed it, relaunched onto the test profile; the replaced bundle carries Sparkle and started it                                                                                    |
| 1.1.7 build 583, the public electron-updater build     | **1.1.8 build 588, the public release** | **the public feed on GitHub** (`--public-feed`) | see "Public feed" below                                                                                                                                                                                                                       |
| 1.1.7 build 584, Sparkle (dev)                         | 1.1.8 build 588, the public release     | the public feed on GitHub (`--public-feed`)     | see "Public feed" below                                                                                                                                                                                                                       |

The first run of the first row is the one that found finding 1: its log
shows `update found` at 13:01:40 and `person chose install` at 13:08:30 —
seven minutes in which the harness saw no window and a person clicked.

## Section A — the gates

| step | command                                 | result                                                                                                                   |
| ---- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1    | `npm run typecheck`                     | clean                                                                                                                    |
| 2    | `npm run lint`                          | clean                                                                                                                    |
| 3    | `npm run format:check`                  | "All matched files use Prettier code style!"                                                                             |
| 4    | `npm test`                              | 245 files, **2990 passed**, 0 skipped                                                                                    |
| 5    | `npm run docs:check`                    | 344/344                                                                                                                  |
| 6    | `git diff --check`                      | clean                                                                                                                    |
| 7    | `npm run test:e2e`                      | **282 passed** (17.0 m), 0 failed, 0 flaky                                                                               |
| —    | `npm run build`                         | exit 0                                                                                                                   |
| —    | `npm run benchmark`                     | exit 0 (the rules experiment's `FAIL … REJECT replacement` line is its designed verdict)                                 |
| —    | `npm run desktop:update:mutations`      | **18/18** mutations produced the expected failure                                                                        |
| —    | `npm run desktop:update:e2e -- --zip …` | PASS: feed through the redirect, whole and ranged download, `sign_update --verify` ok and refused after one flipped byte |
| 8    | `npm run public:check`                  | see below                                                                                                                |
| 9    | commits `84e1a70`, `b5cc839`, pushed    | `git status` clean, HEAD = `origin/master`                                                                               |

## Section B — the release

| step  | command                                                                                                               | result                                                                                                                                                                                         |
| ----- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–4   | version 1.1.8 in both packages, lockfiles, CHANGELOG, `docs/release/1.1.8.md`, commit `b5cc839`                       | pushed; preflight confirms local = origin                                                                                                                                                      |
| 6     | `npm run desktop:release:preflight:mac`                                                                               | GREEN (Developer ID present, notary key present, clean tree on master, versions agree)                                                                                                         |
| 7–8   | `npm run build`; `KINGFISHER_DESKTOP_CHANNEL=stable npm run desktop:dist`                                             | `1.1.8 · build 588 · b5cc839 · stable`; notarization successful; boot gate: "Sparkle 2.10.0 (https://github.com/mardakurt/kingfisher/releases/latest/download/appcast.xml)"                    |
| 9     | `npm run release:mac:notarize -- <dmg>`                                                                               | Accepted (submission `4cb0202d-a5a6-400d-8705-e27973c13c46`), ticket stapled and validated                                                                                                     |
| 10    | `npm run desktop:trust:verify`                                                                                        | GREEN — 29 code objects (14 lines name Sparkle's), stapled ticket validates, Gatekeeper accepts as Notarized Developer ID                                                                      |
| 11    | `node desktop/scripts/verify-dmg.mjs <dmg> --version 1.1.8 --build 588 --commit b5cc839…`                             | verified: every runtime resource, every Sparkle check (framework 2.10.0, no XPC services, feed, key, both automatic flags false), identity, arm64, signature, 3248 entries, nothing unexpected |
| 12    | `npm run desktop:smoke -- --packaged`                                                                                 | **17/17**                                                                                                                                                                                      |
| —     | `npm run desktop:certify`                                                                                             | see below                                                                                                                                                                                      |
| —     | `npm run release:mac:appcast -- --zip <zip>`                                                                          | `sparkle:version 588 · 1.1.8 · macOS 13.0+ · 172095643 bytes · notes embedded`; `latest-mac.yml` for 1.1.0–1.1.7                                                                               |
| 14    | `npm run release:mac:publish -- v1.1.8 "Kingfisher 1.1.8"`                                                            | release created, six assets uploaded (DMG 171,980,142; ZIP 172,095,643; appcast.xml; latest-mac.yml; SHA256SUMS; manifest)                                                                     |
| 15    | `gh release edit v1.1.8 --notes-file docs/release/1.1.8.md --latest`                                                  | `gh release list` → `Kingfisher 1.1.8  Latest  v1.1.8  2026-09-15T14:11:26Z`; `curl -IL …/releases/latest/download/appcast.xml` → 302 → 302 → 200                                              |
| 13    | `npm run desktop:update:real -- … --public-feed`                                                                      | see "Public feed"                                                                                                                                                                              |
| 16–19 | descriptor (build 588, sha256 `24050a33…a190`, 171,980,142 bytes, published 2026-09-15T14:11:26Z), docs, `docs:check` | see below                                                                                                                                                                                      |
| 20–21 | commit, push, `deploy:status`, `desktop:public:verify -- --landing --full`                                            | see below                                                                                                                                                                                      |

### Public feed

`npm run desktop:update:real -- --current <app> --next-dir <out> --public-feed`
— no staging server, no feed override: the running bundle asks the feed
its own Info.plist names, on GitHub.

| current                                                   | next                                | result    |
| --------------------------------------------------------- | ----------------------------------- | --------- |
| the public 1.1.7 (build 583, electron-updater)            | the published 1.1.8 (build 588)     | **16/16** |
| a Sparkle build (1.1.7 build 584, dev)                    | the published 1.1.8 (build 588)     | **19/19** |
| **the published 1.1.8 (build 588)** — what every user has | **the published 1.1.9 (build 590)** | **19/19** |

The first attempt of the first row ran while `desktop:certify` was
running in parallel; its walk's Kingfisher took the relaunch handoff
(finding 8) and its second Kingfisher answered the harness's "quit". The
rows above are the runs made alone.

### desktop:certify (1.1.9, build 590, alone)

smoke 17/17 · chrome 109/109 · restart 5/5 · engines 25/25 · suspend
12/12 · walk seed 46 (200 actions, 0 findings; the hostile user chose
_Check for Updates…_ twice, read "You're up to date! Kingfisher 1.1.8 is
currently the newest version available. (You are currently running
version 1.1.9.)" and clicked OK) · walk seed 7 with faults (120 actions,
0 findings) · DMG verified · no skipped tests · unit suite 2993/2993.
`CERTIFY EXIT 0`.

The first two attempts (one on 1.1.8 alongside other work, one on 1.1.9
alone) hung on the walk for 27 minutes each — finding 9.

## Section B — 1.1.9

| step  | command                                                                                       | result                                                                                                                                  |
| ----- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1–4   | version 1.1.9, lockfiles, CHANGELOG, `docs/release/1.1.9.md`, docs index, parity; `d46fe98`   | pushed; clean; HEAD = origin                                                                                                            |
| 6     | `npm run desktop:release:preflight:mac`                                                       | GREEN                                                                                                                                   |
| 7–8   | `npm run build`; `KINGFISHER_DESKTOP_CHANNEL=stable npm run desktop:dist`                     | `1.1.9 · build 590 · d46fe98 · stable`; notarization successful; boot gate: Sparkle 2.10.0 started with the production feed             |
| 9     | `npm run release:mac:notarize -- <dmg>`                                                       | Accepted (`cca35e75-f98c-411b-a659-de94dc4a8503`), stapled, validated                                                                   |
| 10    | `npm run desktop:trust:verify`                                                                | GREEN                                                                                                                                   |
| 11    | `verify-dmg.mjs … --version 1.1.9 --build 590 --commit d46fe98…`                              | DMG verified                                                                                                                            |
| 12    | `npm run desktop:smoke -- --packaged`                                                         | 17/17                                                                                                                                   |
| —     | `npm run desktop:certify -- --dmg <dmg>`                                                      | every gate green (above)                                                                                                                |
| —     | `npm run release:mac:appcast -- --zip <zip>`                                                  | `sparkle:version 590 · 1.1.9 · macOS 13.0+ · 172095850 bytes · notes embedded`                                                          |
| 14–15 | `release:mac:publish -- v1.1.9`; `gh release edit v1.1.9 --notes-file … --latest`             | six assets; `gh release list` → `Kingfisher 1.1.9  Latest  v1.1.9  2026-09-15T15:38:32Z`; the public feed answers `sparkle:version 590` |
| 13    | `desktop:update:real -- --current <published 1.1.8> --next-dir <out> --public-feed`           | **19/19** (table above)                                                                                                                 |
| 16–19 | descriptor (build 590, sha256 `6e101dae…5ec0`, 171,978,530 bytes, 2026-09-15T15:38:32Z), docs | `docs:check` 344/344                                                                                                                    |
| 20–21 | commit, push; deployment; `desktop:public:verify -- --landing --full`                         | recorded in the final report of this session (the commit that carries this file is the one being verified)                              |

## What was not done, and why

- **`npm run deploy:status`** could not run: the Vercel CLI session token
  on this machine is invalid (`{"error":{"code":"forbidden","invalidToken":true}}`),
  and obtaining a new one needs the owner's sign-in. What was checked
  instead: the GitHub deployment record Vercel posts for each production
  commit (`gh api repos/mardakurt/kingfisher/deployments`, then its
  statuses) — `success` for `b5cc839` and `d76d3c6` — and the live
  landing, which named `Kingfisher-1.1.8-arm64.dmg` once `d76d3c6` was
  deployed and is checked for 1.1.9 the same way.
- **The owner's installed Kingfisher** was not updated by this session;
  the harness proves the path from copies. _Kingfisher → Check for
  Updates…_ in the owner's copy will offer 1.1.9 — through the previous
  engine if it is 1.1.7 or older, through Sparkle if it is 1.1.8.
- **The Sparkle "up to date" and error alerts are modal.** While one is
  open the shell's JavaScript does not run — the renderer keeps working,
  IPC to the main process waits — until the person clicks OK. This is
  Sparkle's standard user interface, unchanged; the harnesses account
  for it. A custom `SPUUserDriver` would remove it and was not attempted.
- **`SquirrelMacEnableDirectContentsWrite`** is left in the user defaults
  of machines that updated through 1.1.2–1.1.7; 1.1.8+ neither reads nor
  writes it. It is harmless and not cleaned up.
- **The browser matrix** (`test:e2e:matrix`) was not run; nothing in this
  phase is engine-specific.
