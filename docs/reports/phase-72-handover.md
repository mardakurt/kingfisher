# Phase 72 handover — the independent audit of Phase 71, and the stabilisation pass

Phase 71 landed six enhancements and a 1.2.1 release. This phase was
asked to trust none of it: to re-verify the landing work independently,
walk the whole application as a user, fix what was broken, address the
Vercel deployment-storage overrun, and run `docs/operations/after-a-fix.md`.
Everything below was run on the maintainer's Mac on 2026-09-19 at the
commit this report ships in; nothing is carried over from a previous
report.

## 1. The Phase 71 audit — five enhancements, independently checked

| Enhancement         | Verdict                       | Evidence                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Screenshots         | Correct, then **re-captured** | Opened all three at native size: current interface, knight icon, Explorer comparison, no personal data, 233 KB together. Re-captured at the end of this phase because the tool strip changed (below); `scripts/landing-captures.mjs --encode`, same sizes (2240×1400, 1718×1138, 1558×1138, og 1200×630).                                                                                                 |
| Header / navigation | **Correct**                   | Measured in Chrome at 1920/1440/1280/1024: links' centre = viewport centre (960/720/640/512), `.nav-brand` left = section left (320/80/64/51), `scrollWidth == innerWidth` at all six widths; `<details>` menu at 820 and 390. No magic offsets: a `1fr auto 1fr` grid in the sections' own box.                                                                                                          |
| Favicon             | **Correct**                   | `npm run build` emits `favicon.ico`, `icon.svg`, `icon1.png` (96 px), `apple-icon.png` under `.next/server/app/`; the landing HTML links all four with sizes and types. No claim about search-engine caches.                                                                                                                                                                                              |
| Studio access       | Correct in rule, **improved** | The rule (`studio-entry.ts`) and the flow (first visit stores nothing; returning line; opt-in; `?stay`; `/studio` → 308; Back → `/?stay`) all verified in a browser. Defect: the opt-in redirect ran in a React effect _after_ paint, so a person who asked to skip the landing saw it on every visit. Now a parser-blocking inline script generated from the same module, tested against the same cases. |
| Design identity     | **Correct**                   | Inspected the full page at 1440/820/390: ink/paper bands, editorial serif, tile bullets, amber rails, one system. Scroll reveals use `animation-timeline: view()` behind `@supports` and `prefers-reduced-motion`; no animation library. Images are `loading="lazy"` with dimensions declared (no layout shift).                                                                                          |

Web/desktop: the landing, captures, favicon set and `/studio` are web-only by
design; the desktop opens on `/analysis`; nothing under `desktop/` changed in
Phase 71 or here. That interpretation was right.

## 2. Defects found and fixed (each reproduced first)

1. **Checkmate on the evaluation bar.** Loaded mated and stalemated
   positions: the bar sat at 50 % saying "No evaluation" and the engine
   panel offered "Analyse this position", which produces nothing. The
   layout now takes the game's outcome (`outcomeAt`, the same read as the
   position summary): checkmate fills the winner's band (`1-0`/`0-1`),
   draws sit at the middle (`½-½`); the panel says "Checkmate — White
   wins … nothing to search" and Start is disabled. Live after the fix:
   `0-1` fill 0 % (White view), `1-0` fill 0 % (Black view), `½-½` 50 %.
2. **The between-moves dip, contradicting Phase 69's claim.** Sampled the
   DOM every ~20 ms across three moves with the engine running: the bar
   dropped to `—`/50 % for ~110 ms (t=290→402 ms) and the panel flashed
   "No analysis yet" with its button for ~25 ms, every move. Cause:
   `invalidatePosition` nulls `analysis`, and the depth-8 floor left the
   bar with nothing until depth 8 arrived. Fix: the surface keeps the
   last reading (state, marked `data-catching-up`, dimmed, titled as the
   previous position's) only while a search is in flight; the store
   claims the restart (`running: true`) at the moment the position
   changes; the panel shows "Analysing…" instead of the empty state. After:
   no 50 % sample, no empty-state sample, across three moves.
3. **Board flip.** The Phase 55 replacement was a `rotateY(180deg)` with
   `backface-visibility: hidden` — a Y-rotation foreshortens the board to
   a line and back, which is exactly the "pieces gather to the middle"
   motion reported. Now a snap with a 180 ms opacity dip, no transform;
   verified: `transform: none` throughout, a1 at the top after the flip.
4. **Tool strip's blank second line.** At the default 380 px dock the
   strip wrapped "More ▾" onto a line of its own. `ModuleTabStrip` now
   measures itself and fits one row (active tab never folded; pinned
   order kept; `fitTabs` unit-tested). Verified one row of 33 px at
   820/1024/1280/1440/1920 with More opening the folded tools.
5. **Tour icons.** A hand-kept map gave Openings, Repertoire, Review,
   Endgame and Games icons the sidebar uses for other sections (Phase 62
   had fixed only Recent). The tour now draws `section.icon`; a test holds
   every section to a detail sentence.
6. **Companion instructions on the public site.** The panel told a
   `kingfisherchess.app` visitor to "open a terminal in the folder you
   ran `npm run dev` from" — and the companion refuses non-loopback
   origins by design (`security.mjs`), so the pairing could never
   succeed. `src/companion/reach.ts` (unit-tested) decides desktop /
   checkout / remote; the panel, the Engines list, the selector ("Mac app
   only") and the provider's remedy each say the true thing for where
   they are. The full-guide link (`companion/README.md`) answers 200.
7. **Command palette.** "review", "backup", "companion" found nothing.
   Navigation and settings commands are now generated from `NAV_SECTIONS`
   and a new `SETTINGS_SECTIONS` (one source, shared with the dialog),
   plus _Back up my work_ and _Open the tour_; a duplicate `goto-games` id
   was removed; ties rank the shorter title first.
8. **Synced game's side.** Phase 63 oriented the board but showed the
   pill only for online games and only at `wide:`. A stored synced game
   now carries `viewerSide`, and "You played White/Black" shows at every
   width — verified with a real Chess.com sync (`sampleuser`, one game).
9. **Account sync had no progress and no Cancel.** A first sync of a big
   Lichess account downloads every game; the row said "Syncing…" for
   minutes. Now "Downloading games…" / "Importing N of M games…" /
   "Indexing…", and Cancel, which keeps what landed. Verified live
   (DrNykterstein: "Downloading games…" → Cancel → "Sync cancelled …").
10. **Databases page.** The three Lichess rows read as one source listed
    three times; each source now shows its own description and the
    token notice is not repeated per row.
11. **Sparkle's release notes** were the whole CHANGELOG entry (72 lines
    for 1.2.1) in a small window. `releaseNotesSummaryHtml` renders the
    intro, one line per change and a link to the full entry; unit-tested;
    applies to the next release (published assets are never rewritten).

## 3. Vercel deployment storage

- **Original usage:** 12.44 GB / 10 GB (owner's dashboard). Other metered
  resources far below their allowances.
- **Cause, measured:** the Vercel build ran `engine:install -- --full`,
  which put both 113 MB full-network Stockfish `.wasm` files into
  `public/` — ~260 MB of static output per deployment (`du`), one
  deployment per push (the API listed production deployments only, all
  READY; the last one built in 2 min, 33 pages, no failure), 30-day
  retention. Phase 71's captures were 233 KB and did not contribute.
- **Change:** the full builds are fetched by the browser from their
  recorded address (`unpkg.com/stockfish@18.0.8`, the package the
  installer uses) through a same-origin bootstrap worker that pins the
  recorded SHA-256 as `fetch` integrity (`scripts/install-engine.mjs`,
  `docs/ENGINES.md`). Verified in Chrome: the full engine loaded (`200
application/wasm`), spawned its threads and reached depth 18 in 31 s
  from a cold cache; with a wrong digest it failed in 26 s with a plain
  message. Static output per deployment: ~44 MB (5.9× smaller).
- **Retention:** project policy set through the API to production `1w`,
  preview/canceled/errored `1d` (Vercel keeps the current and the last
  ten production deployments regardless). Read back: `{"expirationDays":1,
"expirationDaysProduction":7,"expirationDaysCanceled":1,"expirationDaysErrored":1,"deploymentsToKeep":10}`.
- **Nothing deleted, nothing degraded.** The after-figure is only on the
  Usage page (the REST API does not expose the metered total) — the
  owner should read it there after a few days.
- `/privacy`, `docs/legal/privacy.md` and `public-claims.md` now name
  unpkg for the full network.

## 4. Verified correct, left alone

Reset-moves button in the board controls (with ⌘Z); brand → `/analysis`
link; colour-blind palette (Okabe-Ito variables change and persist across
reload); diagnostics Test buttons (busy state, HEALTHY); backup export
(22 stores, version 1); PGN import (3 games, malformed part reported,
duplicates skipped); inline rename → Recent; Recent reads the canonical
repositories; Chess.com import from a real browser (Cloudflare challenges
automation and curl — that is not the product); Lichess anonymous export
answers from a browser; the mate-in-N cases (M1/−M1/M2/−M2, both
orientations); eval bar 24 px, on by default, graph off by default; 13
piece sets with licences; no hard-coded personal name (placeholders only);
Review has one board (the PV-preview mini-board is a separate, deliberate
tool); Position/Set up buttons keep labels at 1024 and carry titles.

Starting-position value: Stockfish 18 Lite reports +0.3/+0.4 at depth
20–24; Lichess shows +0.2 with a different network and depth. Nothing is
hard-coded; the value is the engine's.

## 5. Documented, not built

`docs/product/planner.md` (existing), `docs/product/long-term-data.md`
(the accounts/sync decision and staged plan), and
`docs/product/player-style-opponent.md`.

## 6. Verification

Run at `69c3858` (application) on this machine, 2026-09-19:

```
npm run typecheck            clean
npm run lint                 clean
npm run format:check         All matched files use Prettier code style
npm test                     255 files, 3073 passed, 0 skipped
npm run test:no-skips        OK
npm run docs:check           344/344 checks passed
npm run build                Compiled successfully; 33 static pages; four
                             icons emitted and linked; the entry script in /
npm run benchmark            heaviest route /review at 529.7 kB gzipped
npm run public:check         All 22 public link(s) responded successfully
git diff --check             clean
npm run test:e2e             305 passed, 0 failed, 0 flaky (17.5 m) — channel
                             chrome, retries 0; an earlier run at an interim
                             strip had 4 failures (pinned tabs folded), which
                             the compact mode and the priority order fixed
deploy:status                kingfisherchess.app: up to date (69c3858)
```

Live, after the deployment (build 48 s, no network download in the build
log): `/studio` → 308 `/analysis`; `favicon.ico`, `icon.svg`, `icon1.png`,
`apple-icon.png` all 200 with their types; the manifest names unpkg; the
bootstrap worker is served; the old `.wasm` path answers 404; the three
captures are byte-identical to the repository's; `/privacy` names unpkg.
In Chrome on the live origin: the strip is one row of four compact tabs,
the selector says "Lc0 — Mac app only", the full-network engine loaded
from unpkg (`200 application/wasm`) and reached depth 16 in 28.4 s, the
bar read `+0.5`, and Settings → Companion reads "Not available on the
web … Download Kingfisher for macOS".

## 7. The two reports after the audit, and the 1.2.2 release

The owner reported two things after the first pass, both real:

**Deployment Storage rose to 15.72 GB.** The metric is cumulative over
the 30-day period and resets at the next one (Vercel staff on the
forum; the Usage API answers `plan_upgrade_required` on Hobby), so it
cannot fall within a period — the five 260 MB pre-fix deployments were
still stored and accruing. Deleted through the API (build outputs only;
the current production and its identical-code predecessor kept; live
site 200 after). `vercel.json` gained an `ignoreCommand`
(`scripts/vercel-ignore-build.mjs`, rule and test in
`vercel-build-scope.mjs`) so docs-only pushes no longer deploy, and
`deploy:status` applies the same rule.

**A launch showed the last position.** The draft was restored at every
start. `persistence/session-launch.ts` now holds it on a fresh launch
(new tab, new window, relaunched Mac app) and restores it on a reload
of a session with work; Recent's Continue puts it back on request.
Twelve browser cases, three real desktop launches, the live site, and
`e2e/launch-board.spec.ts` (fails against the old rule). Browser suite
at that commit: 307 passed, 0 failed, 0 flaky (17.8 m).

### Section B, in the runbook's order (2026-09-20)

```
B1  1.2.1 → 1.2.2 (root, desktop), lockfiles
B2  CHANGELOG: Unreleased → ## 1.2.2 — 2026-09-20 (14 entries)
B3  docs/release/1.2.2.md; docs/README.md link
B4  commit 96f1822, push; HEAD = origin/master; tree clean
B5  source ~/.kingfisher-release/env.sh
B6  desktop:release:preflight:mac                    GREEN
    desktop:sparkle:fetch / :bridge                  Sparkle 2.10.0 vendored; bridge current
B7  npm run build                                    Compiled successfully
B8  KINGFISHER_DESKTOP_CHANNEL=stable desktop:dist   first run: Build identity 1.2.2 · build 673
                                                     · 96f1822 · stable; notarised; boot verified —
                                                     then verify-dmg REFUSED it: five stray
                                                     "name 2.js"-style duplicates inside the
                                                     bundled node_modules/next, Finder copies in
                                                     the local install the standalone trace swept
                                                     in. npm ci at root and in desktop/ (3,513 and
                                                     5,663 such files gone), rebuilt: same identity,
                                                     notarised, boot verified
B9  release:mac:notarize <dmg>                       Accepted — a9e16fec…; ticket stapled, validated
B10 desktop:trust:verify                             GREEN
B11 verify-dmg.mjs --version 1.2.2 --commit 96f1822… DMG verified — 3244 entries, no unexpected files
B12 desktop:smoke -- --packaged                      17/17
    packaged launch rule (three launches)            play → relaunch: board 0, Continue: 2 →
                                                     relaunch: board 0
    release:mac:appcast --zip <1.2.2 zip>            appcast.xml (build 673, signed, the new summary
                                                     notes embedded), latest-mac.yml, 1.2.2.html
B14 release:mac:publish v1.2.2 "Kingfisher 1.2.2"    tag v1.2.2; 6 assets
B15 gh release edit v1.2.2 --notes-file … --latest   Latest; publishedAt 2026-09-20T06:30:56Z
B13 desktop:update:real --current <1.2.1> --public-feed
                                                     first two runs failed at "Install Update":
                                                     leftover 1.2.1 processes from the first run
                                                     confused the window index; killed, third run
                                                     Real update: PASS (19 checks — Sparkle's own
                                                     window, download, verify, Install and
                                                     Relaunch, 1.2.2 on the test profile, study
                                                     still there, post-update notice)
B16 src/release/macos-download.json                  1.2.2 · 673 · 96f1822 · Kingfisher-1.2.2-arm64.dmg
                                                     · sha256 ab8fa1a6… · 172,411,147 bytes (GitHub
                                                     reports the same)
B17 publish:release-manifest                         prepared for 1.2.2
B18 README, SECURITY, install-macos (file + hash), launch-kit, public-claims,
    SecurityPage.tsx, AGENTS.md, platform-parity
B19 docs:check                                       344/344
B20 commit dbe93d9, push; deploy:status              up to date (dbe93d9)
B21 desktop:public:verify -- --landing --full        66/66 — PUBLIC DMG VERIFIED (every byte)
```

### Three more reports, and 1.2.3 (2026-09-20)

After 1.2.2 the owner reported three things: the dock's More menu showed
one item (the one-row strip's `overflow: hidden` painted over the menu
— caught by the owner, not the suite, whose "every item is on screen"
check passed against boxes that were painted over; it now hit-tests each
item at its centre and fails against the clipped strip, 14 of 15
unreachable); the engine notes read "Windows only" on a Mac and "Mac app
only" on Windows (one tested rule, `engine/platform-note.ts`, now
decides from the browser's OS and the origin; verified live from Mac,
Windows and Linux user agents); and the landing skip could be undone
only at `/?stay` (Settings → Workspace has the switch; the Mac
application hides it). Section A run in full: 3091 unit, 308 browser,
0 failed, 0 flaky; production at `0d39de7`.

Then Section B again, for 1.2.3:

```
B1–B4  1.2.2 → 1.2.3; changelog closed (3 entries); docs/release/1.2.3.md;
       commit 9a6265b, pushed, tree clean
B6     preflight GREEN; Sparkle 2.10.0 vendored; bridge current
B7     build: Compiled successfully
B8     stable desktop:dist: 1.2.3 · build 679 · 9a6265b; notarised; boot verified
B9     release:mac:notarize: Accepted da7fbbb3…; stapled, validated
B10    trust: GREEN
B11    verify-dmg --version 1.2.3 --commit 9a6265b…: verified, 3244 entries
B12    desktop:smoke --packaged: 17/17
       packaged bundle: More menu 15/15 reachable, last item selectable;
       Windows-only engines not offered; landing switch hidden (0)
       appcast: build 679, summary notes (3 lines), latest-mac.yml
B14    release:mac:publish v1.2.3: 6 assets
B15    Latest; publishedAt 2026-09-20T07:43:14Z
B13    desktop:update:real --current <1.2.2, hash-checked> --public-feed:
       PASS, 19 checks (first try — no leftover processes this time)
B16    descriptor: 1.2.3 · 679 · 9a6265b · Kingfisher-1.2.3-arm64.dmg ·
       sha256 63204418… · 172,413,409 bytes (GitHub reports the same)
B17    publish:release-manifest: prepared for 1.2.3
B18    README, SECURITY, install-macos (file + hash), launch-kit, public-claims,
       SecurityPage.tsx, AGENTS.md, platform-parity
B19    docs:check 344/344
B20    commit c9ea16f, pushed; deploy:status up to date (c9ea16f)
B21    desktop:public:verify -- --landing --full: 66/66, every byte
```

The Mac is not behind `master`. Nothing remains from the audit's own
list; the future ideas are documented, not built.
