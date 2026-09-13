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
