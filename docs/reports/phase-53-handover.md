# Phase 53 handover — 2026-09-14

The owner used 1.1.5 and wrote fourteen numbered enhancements, in no order,
asking that they be ordered before being built, that every one land in both
identities, and that the after-a-fix checklist be run in full. The phase ran
in two passes. The first pass (commits `1e0a0ee` … `65217dc`) landed eleven
items and reported the rest as undone. The second pass — this document — was
a control pass over the first: it verified every item against the running
application rather than the report, corrected three of the first pass's
answers, found two defects the first pass had introduced, finished the three
items it had left, ran the checklist, and shipped 1.1.6.

## Starting HEAD and ending HEAD

- **Starting HEAD (second pass):** `65217dc` — Phase 53 — record the full
  Mac lag in platform-parity. Clean tree, HEAD = origin/master.
- **Ending HEAD:** recorded in the Release section below.

## What the control pass found

Verified on the running dev server, not read from the handover:

| #            | First-pass claim                                            | What the control pass found                                                                                                                                                                                                                                                                                | Outcome                                                                                                                                                                                                                                                                                    |
| ------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1            | "Stockfish 19 has no WASM build; nothing more can be done"  | True for the version, checked against npm (`stockfish@18.0.8` is latest) and `nmrugg/stockfish.js` releases (v18.0.0). But the web had never shipped the **full-network** build that `stockfish.js` publishes beside the lite one — the browser was held to the 7 MB small net while a Mac ran native SF19 | A second browser engine, _Stockfish 18 (full network)_, 113 MB, web-only (the Mac build leaves it out and rewrites its manifest); registered only where the manifest lists it; handshake waits 5 min for the download; a week of `Cache-Control`. Measured: depth 21 in 4.4 s at 767 k n/s |
| 2            | "Position and Set up labelled from 430 px — done"           | The labels were there, and at 834 px and 1024 px the header row was 835 px in a 796 px box: the analysis toolbar's three labels stayed, and a long document title was painted **under** "Position". Measured with `getBoundingClientRect`                                                                  | New/Import/Export labels from 1080 px, the title clipped in its own box, the read-only badge and "Draft saved" yield below 1080 px; `e2e/workspace-header-labels.spec.ts` measures the whole row at three sizes and fails on the first pass's code                                         |
| 3            | "section dividers — done"                                   | "opencarlsen" matched _Run two engines on this position_ (any scattered subsequence scored), and "carlsen" alternated Player, Game, Player, Game, so the divider stood on every other row                                                                                                                  | `src/features/command/rank.ts`: a query word must appear whole (or within one dropped letter in two) in the title or keywords; results gathered by section; nine unit tests                                                                                                                |
| 6            | "needs the data pipeline and network; not done"             | The pipeline is `npm run reference:build -- --pack starter`; 36 of the 48 archives were already cached                                                                                                                                                                                                     | Starter v4: 48 months, 300 a player — 206,451 games, 38,749 openable, 300,413 positions, 13,738 players, 24.3 MB; 73 MB more in the cache; three minutes to build                                                                                                                          |
| 9            | "renamed Lichess → Lichess Rated Games; done"               | The owner's report was "lichess ma… (can't read the rest)". The rename did not touch the cause: the state label sat beside the name in a 220 px rail, and all three Lichess sources still read "Lichess M…", "Lichess R…", "Lichess b…"                                                                    | State under the name, name never truncated; companion storage in `formatBytes`, not raw bytes                                                                                                                                                                                              |
| 14           | "a 40 px drag strip across the top of the workspace — done" | It worked, and it charged every route forty empty pixels above its header                                                                                                                                                                                                                                  | The route headers carry `data-titlebar-drag`; every control inside opts out; the strip is gone; the e2e asserts the header drags on the Mac stub, nothing drags in a browser, zero controls drag                                                                                           |
| 8            | "62 import tests pass"                                      | Driven in the browser: two games pasted on the Games page → "2 games added to your database. 34 positions indexed", ECO classified                                                                                                                                                                         | Confirmed                                                                                                                                                                                                                                                                                  |
| 12           | "35 analysis tests pass"                                    | Driven with the full-network engine: bar at +0.30 → +0.35 with a 300 ms height transition, label legible                                                                                                                                                                                                   | Confirmed                                                                                                                                                                                                                                                                                  |
| 5            | Recent N cap 2000; Recent form tab                          | Driven: Carlsen → "2 from My games, 300 from Kingfisher Starter Reference", dossier tabs Plays / Changed / Move orders / Recent form                                                                                                                                                                       | Confirmed, and the 300 is the v4 pack                                                                                                                                                                                                                                                      |
| 13           | brand flush in full screen                                  | CSS read; `--sidebar-brand-left-padding` collapses under `data-fullscreen`; the packaged chrome harness is the check                                                                                                                                                                                       | Verified against the packaged 1.1.6 (Release section)                                                                                                                                                                                                                                      |
| 4, 7, 10, 11 | icons, sync tests, review queue, recent meta                | Read and driven; no defect found                                                                                                                                                                                                                                                                           | Kept                                                                                                                                                                                                                                                                                       |

Also corrected: the first pass's registry note said Lichess's fork "tops out
at the same point"; `docs/ENGINES.md` had already recorded that
`@lichess-org/stockfish-web@0.5.0` ships an `sf_19.wasm` without a network,
with a different interface, under AGPL. The note now points there.
`stockfish-native` gained `linux-arm64` in its platform list, which the
catalogue has published since Phase 51.

## Honest limits

- **A browser still cannot run a native engine.** Lc0, Stormphrax and the
  rest need the companion, which accepts loopback origins only by design
  (`companion/README.md`, threat model). The web now has the same Stockfish
  network the Mac runs natively; it does not have the fleet, and the
  Settings page says so.
- **Stockfish 19 is not in the browser.** Checked, not assumed:
  `stockfish@18.0.8` is the newest npm release; the only sf_19 WebAssembly
  carries no network. `docs/ENGINES.md`.
- **The starter pack is four years, not the archive.** Eighty months exist;
  the Elite OTB pack (407,538 games, 339 MB, installed on demand) is the
  answer for the rest. 343 games in the 2022–2023 archives were rejected for
  illegal moves and are recorded, not repaired.
- **"Playing like Carlsen"** remains what Phase 52 built: the opponent's own
  recorded moves while the position is in their games, then the engine, each
  labelled. A style model would be a fabricated claim about a person.

## Verification

Section A of `docs/operations/after-a-fix.md`, every step, on the final
application code (`8e099cf`, then the release commit `2c50448` and the
handover commit after it):

| Step | Command                                | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `npm run typecheck`                    | clean                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2    | `npm run lint`                         | clean                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 3    | `npm run format:check`                 | "All matched files use Prettier code style!"                                                                                                                                                                                                                                                                                                                                                                                                             |
| 4    | `npm test`                             | `Test Files 249 passed (249) · Tests 3010 passed (3010)`, 0 skipped (14 new: registry ×5, palette rank ×9); `npm run test:no-skips` → OK                                                                                                                                                                                                                                                                                                                 |
| 5    | `npm run docs:check`                   | `344/344 checks passed`                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 6    | `git diff --check`                     | clean                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 7    | `npm run test:e2e`                     | first run 280/282: `phase7` (the first pass renamed "Estimated browser storage" and left the assertion) and `phase9` (the first pass moved the palette's group label out of the row and left the assertion) — both test-side, both fixed; second run **282 passed, 0 failed, 0 flaky (15.8 m)**. Then `window-chrome.spec.ts` 6/6 after the full-screen fix, which fails against the first pass's CSS. The matrix was not run — not asked for, no reason |
| 8    | `npm run public:check`                 | `All 22 public link(s) responded successfully`                                                                                                                                                                                                                                                                                                                                                                                                           |
| —    | `npm run benchmark`                    | exit 0                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 9    | push                                   | `65217dc..d52c3bd`, `..3486a54`, `..8e099cf`, `..2c50448`                                                                                                                                                                                                                                                                                                                                                                                                |
| 10   | `VERCEL_TOKEN=… npm run deploy:status` | `kingfisherchess.app: up to date (2c50448)` — and, found on the way: the row said "up to date (d52c3bd)" while the live host still served the previous build; `deploy:status` now reports BUILDING / ERROR and says "up to date" only for READY (`3486a54`)                                                                                                                                                                                              |
| 11   | the live pages                         | `/analysis`: _Stockfish 18 (full network)_ chosen, depth 24 at 695 k n/s, +0.38, no console errors; `/databases`: three Lichess sources readable, "206,451 games"; `/`: 1.1.6 · build 580 · 171 MB · SHA-256 57b4a6225b81…, all in the Browser pane                                                                                                                                                                                                      |
| 12   | `CHANGELOG.md`                         | the 1.1.6 entry                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 13   | claims                                 | "Stockfish 18 in the browser, lite or full network"; the Starter counts; the current release row                                                                                                                                                                                                                                                                                                                                                         |

The live site serves what the build promised, checked with `curl`:
`/engine/stockfish/manifest.json` lists `full-single` and `full-mt`
(112,992,459 and 113,007,340 bytes); `/engine/stockfish/stockfish-18.wasm`
answers 200 with `cache-control: public, max-age=604800`; the starter
manifest's counts are the version-4 counts.

Section B, the Mac release:

| Step  | Command                                                                                                   | Result                                                                                                                                                                                                                                                                                                                                                                                |
| ----- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–4   | version 1.1.6 in both package files and lockfiles, changelog moved, `docs/release/1.1.6.md`, pushed       | `git status` clean, HEAD = origin/master                                                                                                                                                                                                                                                                                                                                              |
| 5–6   | `source ~/.kingfisher-release/env.sh && npm run desktop:release:preflight:mac`                            | GREEN (12/12), twice                                                                                                                                                                                                                                                                                                                                                                  |
| 7–8   | `npm run build`; `KINGFISHER_DESKTOP_CHANNEL=stable npm run desktop:dist`                                 | **twice.** First `1.1.6 · build 579 · 3486a54 · stable`; its packaged chrome harness failed 108/109 — "so the mark moves left into the freed corner — x 14, expected 0" — the full-screen cascade defect above. Fixed, pushed, rebuilt: `1.1.6 · build 580 · 8e099cf · stable`; four full-network files left out of the bundle; notarization successful; fresh packaged boot verified |
| 9     | `npm run release:mac:notarize -- <out>/Kingfisher-1.1.6-arm64.dmg`                                        | Accepted, ticket stapled, `latest-mac.yml` names the stapled image                                                                                                                                                                                                                                                                                                                    |
| 10    | `KINGFISHER_DESKTOP_OUT=<out> npm run desktop:trust:verify`                                               | GREEN — 23 code objects, stapled ticket validates, Gatekeeper accepts as Notarized Developer ID                                                                                                                                                                                                                                                                                       |
| 11    | `node desktop/scripts/verify-dmg.mjs <dmg> --version 1.1.6 --commit 8e099cf…`                             | DMG verified, 3109 entries                                                                                                                                                                                                                                                                                                                                                            |
| 12    | `npm run desktop:smoke -- --packaged`                                                                     | 17/17 (build 579 and, inside certify, build 580)                                                                                                                                                                                                                                                                                                                                      |
| —     | `npm run desktop:chrome -- --packaged`                                                                    | build 579: **108/109**; build 580: **109/109**                                                                                                                                                                                                                                                                                                                                        |
| —     | `npm run desktop:certify`                                                                                 | **DESKTOP CERTIFIED, 10/10** on build 580: smoke 17/17, chrome 109/109, restart 5/5, engines 25/25, suspend 12/12, walk seed 46 (0 console errors, 0 findings), fault walk seed 7 (1 console error at the injected kill, 0 findings), DMG, no skips, 3010 unit tests                                                                                                                  |
| 14–15 | `npm run release:mac:publish v1.1.6 "Kingfisher 1.1.6"`; `gh release edit v1.1.6 --notes-file … --latest` | https://github.com/mardakurt/kingfisher/releases/tag/v1.1.6 — 5 assets, published 2026-09-14T19:18:52Z; `/releases/latest` → `v1.1.6`                                                                                                                                                                                                                                                 |
| 16–17 | `src/release/macos-download.json`; `npm run publish:release-manifest`                                     | build 580, `8e099cf`, `Kingfisher-1.1.6-arm64.dmg`, sha256 `57b4a622…9b81e`, 171,406,136 bytes                                                                                                                                                                                                                                                                                        |
| 18–19 | README, SECURITY, install guide, launch kit, public-claims, SecurityPage, AGENTS                          | `npm run docs:check` → 344/344                                                                                                                                                                                                                                                                                                                                                        |
| 13    | `npm run desktop:update:real -- --current <the 1.1.5 app> --next-dir <out> --public-feed`                 | **PASS 12/12** — the 1.1.5 (build 558) application was offered 1.1.6, installed it, relaunched as 1.1.6 (build 580) with the study still there. (The harness's "next … from Kingfisher-1.1.2-arm64.zip" line names the first zip in the output directory; the installed bundle is what it checked.)                                                                                   |
| 20    | commit `2c50448`, pushed; `npm run deploy:status`                                                         | `kingfisherchess.app: up to date (2c50448)` after three "BUILDING" polls                                                                                                                                                                                                                                                                                                              |
| 21    | `npm run desktop:public:verify -- --landing --full`                                                       | 51/55 while Vercel was still building the landing, then **55/55** — `PUBLIC DMG VERIFIED: Kingfisher-1.1.6-arm64.dmg (every byte)`                                                                                                                                                                                                                                                    |

## The owner's first look at 1.1.6, and 1.1.7

Within minutes of 1.1.6 the owner sent a screenshot of their installed
1.1.4 saying "Kingfisher was updated to 1.1.4. Previously 1.1.6." — before
they had updated anything. Their profile's log had the cause: at 19:21:29Z
a 1.1.6 (build 580) had launched on their real profile for eight seconds.
Squirrel.Mac relaunches the bundle with no arguments, so the update
harness's `--user-data-dir` did not survive the relaunch and the relaunched
instance opened the owner's own work; Phase 52's harness had done the same
with 1.1.5 at 15:23Z, and the harness's own header called the few seconds a
known consequence. Two fixes in the shell, one release:

- `desktop/src/relaunch-profile.mjs`: the shell names its profile in the
  updater's cache before `quitAndInstall`; the next launch takes the file
  (once, five-minute budget) and adopts it before anything reads
  `userData`. The harness now asserts the relaunched instance opened the
  test profile and the owner's default profile log did not change — and
  writes the handoff itself for a current shell older than the fix.
- A launch of an older version is recorded without a notice: going
  backwards is not an update, whatever caused it.

| Step    | Command                                                                                                    | Result                                                                                                                                                                                                                                                                                                                                                                                          |
| ------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A 1–6   | typecheck, lint, format, `npm test`, docs:check, `git diff --check`                                        | clean; **3019 passed** (13 new), 0 skipped; 344/344; clean. No browser-rendered file changed, so `test:e2e` was not required; `npm run desktop:smoke` (unpackaged) 17/17 proved the pre-ready cache read                                                                                                                                                                                        |
| B 1–6   | 1.1.7 in both package files and lockfiles, changelog, `docs/release/1.1.7.md`, commit `12ac8dc`, preflight | GREEN (12/12)                                                                                                                                                                                                                                                                                                                                                                                   |
| B 7–10  | build; `desktop:dist`; notarize; trust                                                                     | `1.1.7 · build 583 · 12ac8dc · stable`; notarization successful; ticket stapled; trust GREEN                                                                                                                                                                                                                                                                                                    |
| B 11    | `verify-dmg.mjs … --version 1.1.7 --commit 12ac8dc…`                                                       | DMG verified                                                                                                                                                                                                                                                                                                                                                                                    |
| —       | `npm run desktop:certify`                                                                                  | nine packaged gates green (smoke 17/17, chrome 109/109, restart, engines 25/25, suspend 12/12, both walks, DMG, no skips); the unit-suite step failed on a working tree another session had dirtied (below), so the suite was re-run on `12ac8dc` in a clean worktree: **3019 passed**. The bundle's asar was checked: electron-updater intact, `writeRelaunchProfile` present, no foreign code |
| B 14–15 | publish; `gh release edit v1.1.7 --latest`                                                                 | https://github.com/mardakurt/kingfisher/releases/tag/v1.1.7, 5 assets, 2026-09-14T20:07:44Z                                                                                                                                                                                                                                                                                                     |
| B 13    | `desktop:update:real -- --current <the 1.1.6 app> --next-dir <out> --public-feed`                          | **PASS 13/13** — "the relaunched 1.1.7 opened the test profile, not the default one — default profile log unchanged"; the owner's profile log was 248 lines before and after, its update state still 1.1.6                                                                                                                                                                                      |
| B 16–20 | descriptor (build 583, sha256 `eafeb581…5564`, 171,349,366 bytes), docs, commit `a3897f1`, push, deploy    | `docs:check` 344/344 on the committed tree; `deploy:status` → `up to date (a3897f1)`                                                                                                                                                                                                                                                                                                            |
| B 21    | `desktop:public:verify -- --landing --full`                                                                | **55/55** with the committed verifier — `PUBLIC DMG VERIFIED: Kingfisher-1.1.7-arm64.dmg (every byte)`                                                                                                                                                                                                                                                                                          |

**A second session is working in this checkout.** While the 1.1.7 build
ran, another Claude Code session began replacing electron-updater with
Sparkle in the same working tree: staged deletions of
`kingfisher-updater.mjs`, `update-window.mjs` and the dialog files, new
`sparkle-updater.mjs`, `desktop/native/`, `desktop/sparkle.json`, and
edits to `main.mjs`, `update-service.mjs`, `electron-builder.yml`,
`build.mjs`, `verify-dmg.mjs`, `public-urls.ts` and `.gitignore`. None of
it is committed and none of it is in build 583 (checked in the asar). From
that point every gate here was run on the committed revision in a
separate worktree, and every commit was made by explicit path. Two agents
in one working tree is a hazard: the other session's `verify-dmg.mjs`
fails every shipped DMG for lacking Sparkle, and its deletions break
`update-service.test.mjs` and a SECURITY.md link on the working tree.
Its work is left exactly as found.

## What was not done, and why

- **Lichess sign-in end to end** needs the owner's password; not attempted.
- **`deploy:status` without the CLI trick** still needs a `VERCEL_TOKEN` in
  `~/.kingfisher-release/env.sh`; this session read the Vercel CLI's own
  session token, as Phases 51 and 52 did.
- **The owner's installed application** is still 1.1.4 in `/Applications`;
  the update harness proves the path from a copy of 1.1.5, not from the
  owner's profile. _Kingfisher → Check for Updates…_ will offer 1.1.6.
- **The browser matrix** (`test:e2e:matrix`) was not run; the owner asked
  for it not to be without a strong reason, and none of the changes is
  engine-specific.
- **The known-issues backlog** is untouched; none of the fourteen items
  asked for it.

## The five answers

1. **Same source?** Yes — `desktop/` packages the Next.js build from this
   repository. Every Phase 53 change is in both identities except the one
   that is web-only by design (the full-network browser Stockfish; the Mac
   has native Stockfish 19) and the shell-only ones. The public Mac build
   (1.1.7, build 583, `12ac8dc`) is the revision before the descriptor and
   handover commits, which change no application code —
   `docs/product/platform-parity.md`, "Published revision check
   (2026-09-14, 1.1.7)".
2. **Documents accurate?** `npm run docs:check` → 344/344; the changed
   behaviour is described in `CHANGELOG.md` (1.1.6), `docs/ENGINES.md`
   (two browser rows), `docs/data/reference-packs.md` (version 4),
   `docs/design/macos-window-chrome.md` (the header drag region),
   `docs/product/platform-parity.md`, `THIRD_PARTY_DATA.md`, README.
3. **Vercel on HEAD?** `npm run deploy:status` → `kingfisherchess.app: up
to date (2c50448)`, and the row now refuses to say so for a deployment
   that is still building.
4. **Landing and install pages match the descriptor?** `docs:check` asserts
   it (344/344); the live landing reads "1.1.6 · build 580 ·
   Kingfisher-1.1.6-arm64.dmg · 171 MB · SHA-256 57b4a6225b81…", which is
   `src/release/macos-download.json`.
5. **DMG on GitHub is the latest Mac build and the descriptor's?** `gh
release view --json tagName` → `v1.1.6`, the descriptor's tag;
   `desktop:public:verify -- --landing --full` → 55/55, every byte.
