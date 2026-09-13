# Phase 51 handover — 2026-09-13

The owner used the public 1.1.2 for a day and wrote nineteen numbered
enhancements. This phase reproduced each on the running application before
touching it, ordered them by dependency, closed all nineteen, ran the
after-a-fix checklist in full, and shipped 1.1.3. The user-facing wording is
the 1.1.3 entry in `CHANGELOG.md`; the maintainer's reasoning is in the
code and summarised here.

## Starting HEAD and ending HEAD

- **Starting HEAD:** `a0550bf` — docs: the after-a-fix checklist closes
  with the five questions the owner asks. Clean tree.
- **Ending HEAD:** recorded at the end of this file with the release.

## The order, and why

Item 19 — one page every board route is — went first, because items 12,
16, 17 and 18 are its consequences: the Studies layout, the More menu, the
Review layout and "set up a position everywhere" are all the same defect
seen from four pages. Building the frame first meant those four were fixed
once. Item 1 (the default theme) went last of the code changes because it
touches a persisted store and every visual baseline. The rest were
independent and were taken in the order the owner wrote them.

| #   | Report                                         | What was actually wrong                                                                                                                                                                                                                              | Fix                                                                                                                                               |
| --- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 19  | one main page for every page                   | Eleven hand-built layouts had drifted (fixed 360px dock on Review, unfoldable 300px rail on Studies, viewport-unit columns on Endgame)                                                                                                               | `src/features/workspace/WorkspaceFrame.tsx`; every board route migrated                                                                           |
| 16  | More button leads somewhere hard to leave      | The More menu was a child of the tab row's `overflow-x: auto`, which clips vertically too; opening it showed one item and scrolled the pinned tabs off-screen                                                                                        | More outside the row; the strip wraps instead of scrolling                                                                                        |
| 17  | Review too concentrated on the right           | A fixed grid track for the dock                                                                                                                                                                                                                      | the frame: resizable dock, foldable rail                                                                                                          |
| 12  | Studies looks corrupt, text on the left        | Empty state rendered in a narrow column beside a blank board area                                                                                                                                                                                    | the frame's `empty` slot                                                                                                                          |
| 18  | add/remove pieces on most pages                | `PositionSetupDialog` reachable from Analysis only, via Position → Set up position…                                                                                                                                                                  | a **Set up** button in every frame header                                                                                                         |
| 6   | Open this position in Explorer did nothing     | `/openings?fen=` (and `/analysis?fen=`) had never been read by any route since Phase 9                                                                                                                                                               | `PositionFromUrl` in the frame; Openings switches to Explorer mode                                                                                |
| 13  | Open on the board did not work                 | `loadPgn` opens at the root; the opening's moves were in the list and the board showed the start position                                                                                                                                            | `toEnd()` after loading                                                                                                                           |
| 15  | Preparation finds no players                   | It searched the local collection only, which a new user has none of                                                                                                                                                                                  | `OpponentSearch` over the player library; `collectOpponentGames` reads the reference packs' games too, each source counted separately             |
| 11  | Add to repertoire not findable                 | The empty state named a button that existed only in another route's menu                                                                                                                                                                             | a board for an empty repertoire, the button in the header, the rail and a banner                                                                  |
| 2   | engine cannot be selected / others won't start | No selector on the one-engine panel; the engine store never read `primaryEngineId` back; native engines failed with `npm run …` remedies                                                                                                             | `EngineSelect` on both panels with readiness per option; `useCompanionSync` applies the stored choice; remedies point at Settings                 |
| 3   | reset the move tree                            | Only `New` (which also resets the position)                                                                                                                                                                                                          | `clearMoves()` — command palette, Export menu, Position menu                                                                                      |
| 4   | legal-move dots stay on second click           | A press on the selected piece re-selected it                                                                                                                                                                                                         | `again` flag on the interaction; release on the origin deselects                                                                                  |
| 7   | Test connection does nothing                   | Lichess requires a token (401 anonymously, checked live); re-testing a tokenless source re-reported the same state                                                                                                                                   | "Connect Lichess" → Settings → Accounts for `authentication-required`                                                                             |
| 5   | account connecting                             | Lichess answers anonymous game exports with 404 since 2026 (live: 404 anon, 401 with a bad token, 200 on `/api/user`), which was reported as "no account called …"; on the Mac the OAuth sign-in opened in the system browser and could not complete | profile check to tell the two 404s apart; Enter links; `desktop/src/oauth-window.mjs` child window; Chess.com linking verified live (`mardakurt`) |
| 10  | Storage is not protected message               | Chromium declines `persist()` unless the site is installed/bookmarked; the toast said "declined" and nothing else                                                                                                                                    | popover with the rules, **Install as an app** when offered, backup                                                                                |
| 9   | doubled players, add country                   | `foldName` left the Turkish dotless ı alone; roster aliases were tried in one word order; two packs filed one person under two spellings; the pack's (older) title won                                                                               | fold table for ı ł ø đ ð þ ß æ œ; aliases through `nameOrders`; cross-pack merge by spelling; roster title wins; `regionName` from ISO code       |
| 8   | settings too compressed                        | 640px, twelve tabs scrolling sideways                                                                                                                                                                                                                | 960px, sections down the left, roomier body                                                                                                       |
| 14  | briefs not accurate, add more                  | Eight wrong or misleading (Caro-Kann Exchange minority attack attributed to White; Berlin "ignores a threat"; Steinitz "defends the knight"; Karpov "recaptures"; …)                                                                                 | corrected; 188 variation briefs added, each checked against the dataset's own line; a test refuses a brief for a variation the dataset lacks      |
| 1   | default board Midnight                         | —                                                                                                                                                                                                                                                    | default + one-time migration of stored `walnut` (preferences v5)                                                                                  |

Also fixed on the way: the chosen engine was saved and never applied after a
reload; `test:no-skips` had failed since Phase 50 (`describe.skip` off
macOS in `squirrel-direct-write.test.mjs`, now a deterministic fallback);
the getting-started guide still named the retired `kingfisher-roan` origin.

## Verification

Every claim below is a command that was run in this session, with its
result. Items marked _live_ went to the real service.

- Reproduced in the running dev server before changing anything: 6, 7, 9,
  10, 12, 13, 15, 16, 17 (screenshots in the session; the More-menu clip
  was measured — `scrollLeft 98.5`, menu inside an `overflow: auto` row).
- _Live_: `explorer.lichess.org` → 401 anonymously (item 7);
  `lichess.org/api/games/user/thibault` → 404 anonymously, 401 with a bad
  bearer, `/api/user/thibault` → 200 (item 5); Chess.com linking of
  `mardakurt` imported 1 game through the real Settings dialog. The Lichess
  linking path could not be completed live from this machine: the address
  was rate-limited (429) after the probes above, and completing the sign-in
  needs a Lichess password. The 404 diagnosis is pinned by
  `lichess-sync.test.ts` with exactly the observed statuses.
- Board floors (`e2e/board-size.spec.ts`) measured by hand on Endgame after
  the frame: 453px at 1280×720, 501px at 1366×768, 583px at 1440×900.

The gates and their output are in the final section.

## What the frame is

`WorkspaceFrame` renders header → optional banner → [rail | board column
(board, below-board strip, move tree, lower panel) | dock]. A route passes
`title`/`toolbar`, `actions`, `banner`, `rail`, `board` options or a
`boardSlot`, `empty`, `belowBoard`, `contextLabel`/`contextPanel`, `locked`,
`position` options, and `takeover` for the openings library. Width policy:
while a rail is open the dock takes its minimum width below 1600px, and the
rail is capped at 220px below 1400px; the user's fold choice is stored in the
arrangement as `railCollapsed`. `ARCHITECTURE.md` § Workspaces has the table.

## Remaining

- The Lichess account link should be watched on a fresh address: the code
  path for a signed-in export was not exercised live here.
- `npm run desktop:oauth` opens the sign-in window and checks the URL; it
  stops before the password, as it must.
- Visual baselines were regenerated for `chrome-darwin` only; the
  Chromium/Firefox/WebKit baselines in `e2e/visual.spec.ts-snapshots` are
  stale until the matrix (`npm run test:e2e:matrix`) is run with
  `UPDATE_VISUAL_BASELINES=1` on this machine.

## The gates, as run

Section A of `docs/operations/after-a-fix.md`, on the final code
(`687e3d2` and then the release commit `0600ce1`):

| Step | Command                                | Result                                                                                                                                                                                                              |
| ---- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `npm run typecheck`                    | clean                                                                                                                                                                                                               |
| 2    | `npm run lint`                         | clean                                                                                                                                                                                                               |
| 3    | `npm run format:check`                 | "All matched files use Prettier code style!"                                                                                                                                                                        |
| 4    | `npm test`                             | `Test Files 247 passed (247) · Tests 2976 passed (2976)`, 0 skipped; `npm run test:no-skips` → OK                                                                                                                   |
| 5    | `npm run docs:check`                   | `344/344 checks passed`                                                                                                                                                                                             |
| 6    | `git diff --check`                     | clean                                                                                                                                                                                                               |
| 7    | `npm run test:e2e`                     | four runs: 242/269 → 268/269 → 271/272 → **272 passed, 0 failed, 0 flaky (15.3 m)** on the final code                                                                                                               |
| 8    | `npm run public:check`                 | `All 22 public link(s) responded successfully`                                                                                                                                                                      |
| —    | `npm run benchmark`                    | exit 0 (the rules-experiment's expected REJECT of a chess.js replacement is printed as FAIL by design)                                                                                                              |
| 9    | push                                   | `a0550bf..687e3d2 master -> master`, then `687e3d2..0600ce1`                                                                                                                                                        |
| 10   | `VERCEL_TOKEN=… npm run deploy:status` | `kingfisherchess.app: up to date (0600ce1)`                                                                                                                                                                         |
| 11   | the live pages                         | `/review`, `/analysis`, `/openings?fen=…`, `/preparation` (Nakamura, Hikaru — 120 games), `/players` (one Erdoğmuş row, GM, Türkiye) opened on `https://kingfisherchess.app` in the Browser pane, no console errors |

The first e2e run's 27 failures were 12 tests written against the old
page shapes and 15 visual baselines of pages that were meant to change;
the second run's one failure was a test that clicked the Training dock
before the Training route had replaced Analysis (fixed by scoping to
`[data-workspace-frame="training"]`); the third run's one failure was the
soak's un-attributable `404` console line, which passed alone and in the
fourth full run. Visual baselines: `npm run visual:baselines` (43 shots,
chrome-darwin).

Section B, the Mac release:

| Step      | Command                                                                                                                       | Result                                                                                                                                                                                                                                 |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–4       | version 1.1.3 in both package files, changelog moved, commit `0600ce1`, pushed                                                | `git status` clean, HEAD = origin/master                                                                                                                                                                                               |
| 5–6       | `source ~/.kingfisher-release/env.sh && npm run desktop:release:preflight:mac`                                                | GREEN (12/12)                                                                                                                                                                                                                          |
| 7–8       | `npm run build`; `KINGFISHER_DESKTOP_CHANNEL=stable npm run desktop:dist`                                                     | `Build identity: 1.1.3 · build 539 · 0600ce1 · stable`; notarization successful; fresh packaged boot verified                                                                                                                          |
| 9         | `npm run release:mac:notarize -- <out>/Kingfisher-1.1.3-arm64.dmg`                                                            | Accepted, submission `347d7c3f-32ce-4f73-9223-ca22858d6b48`, ticket stapled                                                                                                                                                            |
| 10        | `npm run desktop:trust:verify`                                                                                                | GREEN — 23 code objects, stapled ticket validates, Gatekeeper accepts as Notarized Developer ID                                                                                                                                        |
| 11        | `node desktop/scripts/verify-dmg.mjs <dmg> --version 1.1.3 --commit 0600ce1…`                                                 | DMG verified                                                                                                                                                                                                                           |
| 12        | `npm run desktop:smoke -- --packaged`                                                                                         | 17/17                                                                                                                                                                                                                                  |
| —         | `npm run desktop:oauth -- --packaged`                                                                                         | 9/9 — the sign-in opens in a child window on `lichess.org/oauth` with `redirect_uri=http://127.0.0.1:<port>/oauth/lichess`, PKCE S256, main window untouched                                                                           |
| —         | `npm run desktop:certify`                                                                                                     | DESKTOP CERTIFIED — smoke 17/17, chrome 109/109, restart 5/5, engines 25/25, suspend 12/12, walk 46 (0 errors), fault walk 7 (1 console error: the injected companion fault at step 2, as in the 1.1.2 run), DMG, no skips, unit suite |
| 14–15     | `npm run release:mac:publish v1.1.3 "Kingfisher 1.1.3"`; `gh release edit v1.1.3 --notes-file docs/release/1.1.3.md --latest` | https://github.com/mardakurt/kingfisher/releases/tag/v1.1.3 — 5 assets; `/releases/latest` → `v1.1.3`                                                                                                                                  |
| 16–17     | `src/release/macos-download.json`; `npm run publish:release-manifest`                                                         | build 539, `0600ce1`, `Kingfisher-1.1.3-arm64.dmg`, sha256 `50d7c57e…28b5`, 159,136,740 bytes, published 2026-09-13T19:20:40Z                                                                                                          |
| 18–19     | README, SECURITY, install guide, launch kit, public-claims, SecurityPage, AGENTS                                              | `npm run docs:check` → 344/344                                                                                                                                                                                                         |
| 13, 20–21 | recorded below after the push                                                                                                 |                                                                                                                                                                                                                                        |
