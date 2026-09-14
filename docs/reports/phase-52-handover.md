# Phase 52 handover — 2026-09-14

The owner used 1.1.4 and wrote twelve numbered enhancements, in no order,
asking that they be ordered before being built. This phase reproduced each
on the running application, ordered them by dependency, closed all twelve,
ran the after-a-fix checklist in full, and shipped 1.1.5. The user-facing
wording is the 1.1.5 entry in `CHANGELOG.md`; the maintainer's reasoning is
in the code and summarised here.

## Starting HEAD and ending HEAD

- **Starting HEAD:** `374bc74` — docs: Phase 51 handover records the 1.1.4
  update, deploy and public verification. Clean tree, HEAD = origin/master.
- **Ending HEAD:** the commit that carries this handover and the
  regenerated cross-browser baselines, after the release commit `33f3798`
  and the descriptor commit `a9b7736`.

## The order, and why

A hydration failure found while probing the routes for item 12 went first:
`EngineSelect` rendered a platform note on the client that the server had
not, React threw the whole tree away on every visit to Analysis, and any
measurement taken on a page in that state would have been a measurement of
the failure. It also turned out to be the cause of item 5.

Items 1, 4 and 3 are one file cluster under the board (the bar, the graph
and the controls strip in `CanonicalBoardSurface`), so they went together,
the bar first because the graph draws the same numbers. Item 7 (Review)
touches the shared frame and the board's move input, so it came before any
visual work; then the small settings items 9 and 11; then 10 (piece sets),
which had to land before any visual baseline. Item 8 (the data rebuild) is
a forty-minute download, so it ran in the background while 6 was built on
top of it — the sparring partner plays from exactly the games 8 enlarged.
The desktop-only items 2 and 5 came after the web items because they are
verified against a packaged build, made once at the end. Item 12 was last
because it is the check on everything above.

| #   | Report                                          | What was actually wrong                                                                                                                                                                                                                                          | Fix                                                                                                                                                                                                           |
| --- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 12a | (found) Analysis fails hydration                | `EngineSelect` read `navigator.userAgent` during render; the server rendered no platform note, the client did, React regenerated the root on the client                                                                                                          | `useSyncExternalStore` with a null server snapshot                                                                                                                                                            |
| 1   | eval bar wrong, wants a number                  | Nine-pixel label in an eighteen-pixel column clipped "+0.38" to "+0."; a move on the board stopped the engine and blanked the bar, so every position had to be restarted by hand                                                                                 | 32px bar, 10px figure that fits (29.2 of 30px measured), depth and engine in the title; a running engine follows the board (`followBoard`, five store tests); concealing workspaces switch it off             |
| 4   | graph under the board looks corrupt, Mac only   | One evaluated ply was one block of colour across the whole strip, untitled; the Mac game had stored evaluations and the web game had none                                                                                                                        | scaled to ≥40 plies, titled, captioned "N of M plies analysed", White/Black labels                                                                                                                            |
| 3   | reset move tree not findable                    | In three menus, none obvious                                                                                                                                                                                                                                     | a button beside the move controls, disabled when there is nothing to clear, toast names ⌘Z                                                                                                                    |
| 7   | Review dock text at the edge, second board      | `PanelBody` with no padding; a 210px `AnswerBoard` in the dock for candidates; and a concealed board accepted no moves at all (`showLegalHints` emptied the destinations)                                                                                        | padded; candidates recorded on the canonical board through `board-move-capture`, drawn back as arrows; `legalHints` prop separates the dots from the input                                                    |
| 9   | annotation colours change nothing               | The palette repainted only the four brushes; a person who draws no arrows saw nothing                                                                                                                                                                            | Okabe–Ito block also sets `--positive/--negative/--caution`; move quality painted through those tokens; live preview in Settings; e2e asserts the verdict tokens change                                       |
| 11  | owner's name in Settings → Profile              | The placeholder                                                                                                                                                                                                                                                  | a world champion's                                                                                                                                                                                            |
| 10  | more serious piece sets                         | Of ten sets, three tournament-grade; the sets strong players use most are non-commercial or unlicensed                                                                                                                                                           | Pirouetti (AGPL-3.0+), Kryukov (GPL-2.0+, GNOME Chess "fancy"), Sophia (W3C, GNOME Chess "simple"), byte-identical, calibrated by `pieces:measure`, licences recorded                                         |
| 8   | more games per player, not huge                 | Stored scores capped at 2600+ and 120 a player                                                                                                                                                                                                                   | starter pack v3: 2500+ (and GM/IM v GM/IM), 200 a player, through 2026-08 — 27,521 openable (from 10,707), 18.5 MB (from 12.3)                                                                                |
| 6   | a companion that plays like the player          | —                                                                                                                                                                                                                                                                | `src/preparation/sparring.ts` + a Sparring dock tool: their own moves, weighted by frequency and labelled with the count, while the position is in their games; the engine after, labelled; on the main board |
| 5   | traffic lights over the mark, not in fullscreen | On launches where hydration failed (12a), React reset the singleton `<html>` and dropped the bootstrap's `--mac-titlebar-safe-*` and `data-titlebar`; nothing restated them. Measured on the installed 1.1.4: `data-titlebar` null, safe width 0px, mark at x=14 | `useDesktop` restates the chrome in an effect; a new e2e stubs the bridge past the bootstrap and asserts the effect alone reserves the corner; fails with the effect removed                                  |
| 2   | update dialog is a changelog in a box           | The whole release body in a 168px scroll box inside a 206px window                                                                                                                                                                                               | three single-line highlights and a "Full release notes…" link; 400×264; the dialog harness feeds a fourteen-bullet body to every state                                                                        |
| 12  | all sections work, Recent completely            | Every route loaded with zero console errors after 12a; every Recent action followed (six quick actions, first-run buttons, the two that open Settings sections)                                                                                                  | the sweep is in the Verification section                                                                                                                                                                      |

## Verification

Every claim below is a command that was run in this session, with its
result.

- Reproduced in the running dev server before changing anything: 1 (bar
  label measured 29.2px of text in a 26px span — clipped; engine stopped on
  a move), 4, 7 (journal `PanelBody` padding 0; `AnswerBoard` at 210px in
  the dock; no move accepted on the concealed board), 9 (the token changed
  but nothing on screen used it), 11, 12a (`node .console-probe.mjs` over
  twelve routes: one hydration failure, on `/analysis`, in `EngineSelect`).
- Item 5 measured on the installed 1.1.4 with the shared launcher: on one
  launch `--titlebar-safe-w` was `84px` and the mark at x=84; on the next,
  `data-titlebar` null, safe width `0px`, mark at x=14 with
  `window.kingfisher.windowChrome` present — the bootstrap's attributes
  gone, the bridge intact. After the fix the packaged chrome harness passed
  109/109 and the new browser test fails with the effect reverted.
- Item 8: `npm run reference:build -- --pack starter` — 36 archives fetched
  and verified against the published digests (2023-09 … 2026-08), 933,143
  games scanned, 177,800 kept, 177,511 counted, 27,521 full scores, 253,687
  positions, 12,685 players, 104 chunks, 18.5 MB. Carlsen's Preparation page
  reads 200 games from the pack on the dev server and on
  `https://kingfisherchess.app` after the deploy.
- Item 6 exercised live on the dev server: Carlsen as White played 1.Nc3
  ("Played in 2 of Carlsen, Magnus's 120 games here (2%), last in 2025"),
  1…e5 was played on the board and recorded, and 2.Nf3 came from
  "Stockfish 18 Lite WASM Multithreaded, depth 13" with the out-of-book
  sentence; three plies in the move tree.
- Item 2: `npm run desktop:update:dialog` — 15 states × light/dark with a
  fourteen-bullet release body: ≤3 single-line highlights, link only when
  an update is offered, nothing clipped; screenshots in
  `output/update-dialog/`.
- Item 12: every route loaded in a fresh context with 0 console errors;
  every Recent action followed to its destination (six quick actions to
  their routes, _Start studying_ → `/analysis`, _Browse the opening
  library_ → `/openings`, _Install more reference data_ → `/databases`,
  _Connect Lichess or Chess.com_ and _Add a native engine_ → Settings at
  the Accounts and Engine sections); nine other routes screenshotted at
  1440×900 and looked at.

## The gates, as run

Section A of `docs/operations/after-a-fix.md`, on the final application code
(`f74ce0a`, then the release commit `33f3798` and the docs commits after it):

| Step | Command                                | Result                                                                                                                                                                                                   |
| ---- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `npm run typecheck`                    | clean                                                                                                                                                                                                    |
| 2    | `npm run lint`                         | clean                                                                                                                                                                                                    |
| 3    | `npm run format:check`                 | "All matched files use Prettier code style!"                                                                                                                                                             |
| 4    | `npm test`                             | `Test Files 248 passed (248) · Tests 2993 passed (2993)`, 0 skipped; `npm run test:no-skips` → OK                                                                                                        |
| 5    | `npm run docs:check`                   | `344/344 checks passed`                                                                                                                                                                                  |
| 6    | `git diff --check`                     | clean                                                                                                                                                                                                    |
| 7    | `npm run test:e2e`                     | two runs: 260/273 (13 failures: 9 visual baselines of pages meant to change, 4 tests encoding the old stop-on-move contract, all updated) → **273 passed, 0 failed, 0 flaky (15.1 m)** on the final code |
| 8    | `npm run public:check`                 | `All 22 public link(s) responded successfully`                                                                                                                                                           |
| —    | `npm run benchmark`                    | exit 0                                                                                                                                                                                                   |
| 9    | push                                   | `374bc74..6190a6d master -> master`, then `6190a6d..a9b7736`                                                                                                                                             |
| 10   | `VERCEL_TOKEN=… npm run deploy:status` | `kingfisherchess.app: up to date (6190a6d)`, later `up to date (a9b7736)` (token: the Vercel CLI's session token, as in Phase 51; there is still no `VERCEL_TOKEN` in `~/.kingfisher-release/env.sh`)    |
| 11   | the live pages                         | `/analysis` (32px bar, Reset moves button), `/preparation` (Carlsen, 200 games, 15 tools) on `https://kingfisherchess.app` in the Browser pane, no console errors                                        |

Visual baselines: `npm run visual:baselines` (43 shots, chrome-darwin);
then `UPDATE_VISUAL_BASELINES=1 npm run test:e2e:matrix -- e2e/visual.spec.ts
--update-snapshots` → 172 passed (3.2 m), 45 Chromium/Firefox/WebKit
baselines regenerated — the ones Phase 51 left stale, plus this phase's.

Section B, the Mac release:

| Step  | Command                                                                                                   | Result                                                                                                                                                                                                                                                                                                                                                        |
| ----- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–4   | version 1.1.5 in both package files, changelog moved, commit `33f3798`, docs `6190a6d`, pushed            | `git status` clean, HEAD = origin/master                                                                                                                                                                                                                                                                                                                      |
| 5–6   | `source ~/.kingfisher-release/env.sh && npm run desktop:release:preflight:mac`                            | GREEN (12/12)                                                                                                                                                                                                                                                                                                                                                 |
| 7–8   | `npm run build`; `KINGFISHER_DESKTOP_CHANNEL=stable npm run desktop:dist`                                 | `Build identity: 1.1.5 · build 558 · 6190a6d · stable`; packaged runtime resources verified; notarization successful; fresh packaged boot verified                                                                                                                                                                                                            |
| 9     | `npm run release:mac:notarize -- <out>/Kingfisher-1.1.5-arm64.dmg`                                        | Accepted, submission `b2b32c56-9662-4767-a209-3fb389f58e39`, ticket stapled                                                                                                                                                                                                                                                                                   |
| 10    | `npm run desktop:trust:verify`                                                                            | GREEN — stapled ticket validates, Gatekeeper accepts as Notarized Developer ID                                                                                                                                                                                                                                                                                |
| 11    | `node desktop/scripts/verify-dmg.mjs <dmg> --version 1.1.5 --commit 6190a6d…`                             | DMG verified, 3109 entries                                                                                                                                                                                                                                                                                                                                    |
| 12    | `npm run desktop:smoke -- --packaged`                                                                     | 17/17                                                                                                                                                                                                                                                                                                                                                         |
| —     | `npm run desktop:chrome -- --packaged`                                                                    | 109/109 — mark at 84,10 in every layout                                                                                                                                                                                                                                                                                                                       |
| —     | `npm run desktop:certify`                                                                                 | 9 of 10 steps: smoke 17/17, chrome 109/109, restart 5/5, suspend 12/12, walk 46 (0 console errors), fault walk 7 (14 console errors, all `ERR_CONNECTION_REFUSED` at step 51, a `fault-kill-web` step; re-run alone: 1, as in 1.1.3), DMG, no skips, unit suite; **engines 21/22** on an upstream HTTP 504 downloading Stockfish 19 — re-run alone: **25/25** |
| 14–15 | `npm run release:mac:publish v1.1.5 "Kingfisher 1.1.5"`; `gh release edit v1.1.5 --notes-file … --latest` | https://github.com/mardakurt/kingfisher/releases/tag/v1.1.5 — 5 assets; `/releases/latest` → `v1.1.5`                                                                                                                                                                                                                                                         |
| 16–17 | `src/release/macos-download.json`; `npm run publish:release-manifest`                                     | build 558, `6190a6d`, `Kingfisher-1.1.5-arm64.dmg`, sha256 `ebc4a68e…22d2e`, 165,543,639 bytes, published 2026-09-14T15:01:18Z                                                                                                                                                                                                                                |
| 18–19 | README, SECURITY, install guide, launch kit, public-claims, SecurityPage, AGENTS                          | `npm run docs:check` → 344/344                                                                                                                                                                                                                                                                                                                                |
| 13    | `npm run desktop:update:real -- --current /Applications/Kingfisher.app --next-dir <out> --public-feed`    | first run FAILED while GitHub answered 504 (its own feed check failed in the same run; the release page and a Stockfish download 504'd in the same half hour); second run **PASS 12/12** — the installed 1.1.4 (build 544) was offered 1.1.5, installed it, relaunched as 1.1.5 (build 558) with the study still there                                        |
| 20    | commit `a9b7736`, pushed; `npm run deploy:status`                                                         | `kingfisherchess.app: up to date (a9b7736)`                                                                                                                                                                                                                                                                                                                   |
| 21    | `npm run desktop:public:verify -- --landing --full`                                                       | 54/55 on a GitHub 504 for the release page, then **55/55** — `PUBLIC DMG VERIFIED: Kingfisher-1.1.5-arm64.dmg (every byte)`                                                                                                                                                                                                                                   |

## What was not done, and why

- **Lichess sign-in end to end** needs the owner's Lichess password; it was
  not attempted. `npm run desktop:oauth` still stops at the sign-in form,
  as it must.
- **`deploy:status` without the CLI trick** needs a `VERCEL_TOKEN` the
  owner creates in the Vercel dashboard and puts in
  `~/.kingfisher-release/env.sh`; this session used the CLI's session token.
- **The known-issues backlog** (first-run signposting, reference cache
  warmer, save mark by the move list, printable PGN with annotations,
  offline mode) is untouched; none of the twelve reports asked for it.
- **The two layout judgements** (rail cap at 220px and the dock at its
  minimum below 1400/1600px; Training's dock visible-but-locked) were
  looked at in the 1440×900 route screenshots and left as they are; the
  board was the largest element on every board route, and neither was
  among the twelve reports. They remain judgements for the owner.
