# Phase 54 handover — the update engine is Sparkle, and 1.1.8

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
- `b5cc839` — `release: Kingfisher 1.1.8`; the public build is made from it.
- the descriptor/docs commit that follows it — names the published bytes.

## What the control pass found

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                    | Fix                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `scripts/desktop-lib/sparkle-ui.mjs` wrote its separators as backslash-u escapes, which AppleScript does not have; the script never compiled and `windowsOf()` said "no windows". The first `desktop:update:real` never saw Sparkle's window; it completed only because a person clicked.                                                                                                                                                  | `character id N` separators; a compile failure throws; sheets are listed with their window; every query names the process under test by **pid**.            |
| 2   | The harness expected a pre-generated `appcast.xml`, but an appcast names its archive by absolute URL and the harness picks a port at run time; `generate_appcast` silently fell back to the bundle's own feed URL.                                                                                                                                                                                                                         | The harness writes its own feed for its port, signed with the same key.                                                                                     |
| 3   | In a checkout (`electron .`) Sparkle _started_ — Electron.app is code signed and names no feed, so Sparkle accepts it as a host — and _Check for Updates…_ ended in Sparkle's "Update Error" alert.                                                                                                                                                                                                                                        | `sparkle-updater.start()` refuses an unpackaged host before Sparkle is asked; the sheet says "Updates are not available in this build".                     |
| 4   | The service's three message boxes had no parent window; macOS runs such a box app-modal on the main thread, and the shell answered nothing — not the renderer, not a harness — until it was dismissed.                                                                                                                                                                                                                                     | They hang from the main window as sheets (`parentWindow` in `startUpdater`).                                                                                |
| 5   | `desktop:update:e2e` refused its own plain-HTTP staging enclosure (`allowHttp` passed and ignored) and demanded release notes for a version `CHANGELOG.md` did not name yet.                                                                                                                                                                                                                                                               | `appcastMismatch` honours `allowHttp`; notes are required exactly when the changelog has the entry.                                                         |
| 6   | The output directory keeps older builds' files; a `latest-mac.yml` from the previous release sat beside the new ZIP and `release:mac:appcast` refused to choose among six ZIPs.                                                                                                                                                                                                                                                            | `release:mac:publish` refuses a `latest-mac.yml` whose version or SHA-512 is not this release's ZIP (proved: it refused a 1.1.7 feed before any `gh` call). |
| 7   | AGENTS.md still described electron-updater; SECURITY.md and the public security page said "no background check" while a quiet information-only check has run at launch since Phase 50; the privacy page said "signed SHA-512" of a Sparkle feed; the install guide presented the Squirrel.Mac prompt as current; the layout doc called the handoff directory Sparkle's cache; the trusted-release runbook said notarise rewrites the feed. | Each says what the code does. The public security page's claim changed, so `docs/product/public-claims.md` changed with it.                                 |

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

(filled in below)

### desktop:certify

(filled in below)

## What was not done, and why

(filled in below)
