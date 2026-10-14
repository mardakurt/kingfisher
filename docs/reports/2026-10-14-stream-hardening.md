# 2026-10-14 — ChessBase comparison recheck and stream hardening (1.5.2)

The owner asked for the remaining ChessBase gaps closed and Kingfisher made
dependable for a professional player using it live on stream; mid-session,
for on-board puzzle verdicts and a version bump to 1.5.2.

## Starting state

Clean `master` = `origin/master` = `11321291`, source 1.5.1; public Mac
descriptor 1.5.1 build 1166. Work is on branch `stability/stream-hardening`.

## ChessBase comparison

Re-read the publisher page (<https://mac-version.chessbase.com/>, still
"early November 2026", Apple Silicon, macOS 26, 8 GB) and the owner's ten
screenshots in `chessbase images for comparison/`, against
[the 1.5.0 matrix](../product/chessbase-mac-comparison-1.5.0.md). The page
lists nothing the matrix lacks. Every row is still either a match, a reasoned
difference, or needs ChessBase's own data or servers (Mega Database, Let's
Check, Engine Cloud, cloud databases, the shop, Playchess, DGT by the
owner's earlier decision). Building those would mean inventing data or a
service, which this project does not do. No new parity row was opened.
Puzzles were checked by use: difficulty, own rating, hint, solution and
analyse are all present.

## Defects found by use, and fixed

| Defect                                                                                                                               | Found by                                    | Fix                                                                         | Proof it can fail                                  |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------- |
| `master`'s unit suite was red: the install-page test hard-coded the macOS 13 floor; 1.5.1's descriptor says 14                       | `npm test` on the starting commit           | Fixture pins the floor, checks two values                                   | —                                                  |
| The threaded WASM Stockfish failed in an embedded Chromium ("Uncaught [object Event]"); the board said "Engine error"; no fallback   | Using `/analysis` in the app's browser pane | Provider falls back to the single-threaded build, remembers it for the page | `provider.test.ts` fails without it                |
| Clicking **Scoresheet** in the sidebar replaced an unsaved analysis with a blank board, silently                                     | Route sweep, 21 routes, 3 moves each        | Unsaved work moves to its own tab first                                     | `scoresheet.spec.ts` fails without it              |
| The **+** (New analysis) beside Save, a Library game, a search hit and other openers replaced an unsaved analysis with no way back   | Same sweep, then the openers                | Central guard on the board: the work is kept as a tab of its own            | `displaced-work.test.ts`, `displaced-work.spec.ts` |
| A companion test took 4.9 s of a 5 s limit and failed under load; three desktop-service tests and one postings test sat at 4.1–4.8 s | A full unit run failing once; duration scan | Budgets derived from each test's own waits; no assertion changed            | —                                                  |

## Found by the final full browser run, and fixed

The first final-source run (stopped at 373 of 544) failed three cases:

- **Position page** — mine. The first version of the guard offered displaced
  work back in a notice that stayed until clicked; at the bottom of the
  window it covered "Open position page", and the click never landed. A
  notice that blocks controls is worse than one that goes, so displaced work
  is now kept as a tab of its own automatically, with an ordinary notice.
  The sticky offer remains only when twelve tabs leave no room in the strip.
- **Repertoire coverage** and **model game** — the test server, not the
  application. The trace of one shows Fast Refresh rebuilding mid-test with
  no file written; the screenshot of the other shows Next's "Compiling…"
  badge when the 10 s assertion expired. Next's development server keeps
  five compiled routes for 60 s and recompiles the rest; the suite now keeps
  every route it has compiled for the run (`onDemandEntries`, under
  `KINGFISHER_E2E` only — the shipped build is unchanged).

All three passed afterwards with the related specs (31/31, zero retries).

## Added at the owner's request

- **Puzzle verdict on the board.** A red cross on the square of a wrong move
  until it is taken back, a green tick on a right one until the reply, kept on
  the solving move. One `moveBadge` prop on the shared board; the reply delay
  is 600 ms so the tick is seen. `e2e/puzzles.spec.ts` fails with it withheld.
- **Version 1.5.2.** Source version only. The public download descriptor stays
  on the published, byte-verified 1.5.1 until a 1.5.2 DMG is built, notarised,
  published and verified (`docs/deployment.md`).

## What was used by hand

Production build, Chrome 155 (Playwright) and the desktop app's own browser
pane: every route for uncaught errors, console errors and HTTP failures (none);
engine start, 150 rapid moves through a 171-ply game with the engine running,
ten fast engine toggles (eval, arrow and position stayed in step, no errors);
the Explorer; Preparation against Carlsen (counts checked by hand:
96 + 70 + 34 = 200, score 65.5 % shown as 66 %); the Library on the Starter
Reference; puzzles (hint, solution, next); every route visited with unsaved
work on the board.

## Commands run

| Command                                       | Result                                                                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm test` (start)                            | 1 failed / 4,284 passed — the install-page floor test                                                                                            |
| `npm run typecheck`, `lint`, `format:check`   | pass                                                                                                                                             |
| `npm run docs:check`                          | 363/363                                                                                                                                          |
| `npm run build`                               | pass                                                                                                                                             |
| Focused Playwright (9 specs, touched code)    | 29/29, zero retries                                                                                                                              |
| `npm run desktop:dist` (dev, build 1171)      | signed, fresh-boot verified (not notarised: no credentials sourced)                                                                              |
| `npm run desktop:certify` on build 1171 + DMG | 11/11 gates: smoke 17/17, chrome 109/109, restart 7/7, engines 25/25, suspend 14/14, killed, walks 0 findings, DMG, zero skips, unit 4,293/4,293 |
| `npm test` after the budget fix (JSON report) | 4,293/4,293, 0 skipped                                                                                                                           |

Build 1171 predates the puzzle badge and the version bump. Final-candidate
results follow below.

## Final candidate (source `03a7248e` plus the inbox test fix)

| Command                                                         | Result                                                                                                          |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `npm test`                                                      | 4,293/4,293, 423 files, 0 skipped                                                                               |
| `npm run typecheck`, `lint`, `format:check`, `git diff --check` | pass                                                                                                            |
| `npm run docs:check`                                            | 363/363                                                                                                         |
| `npm run test:e2e`                                              | 543/544 in 59.6 min, zero retries; the one failure below                                                        |
| `e2e/repertoire-inbox.spec.ts` after fix                        | 1/1; fails again with the old selector                                                                          |
| `npm run benchmark`                                             | exit 0; parser 2,667 games/s; 100,000 games, 1,000,000 positions indexed; heaviest route /studies 540.2 kB gzip |

The inbox failure was the test, not the application: with an unsaved
analysis kept as a second tab (correctly — Repertoire had replaced nine
unsaved moves), the strip shows "Close <tab>" buttons, and the test's
`{ name: 'Close' }` substring matched three. It now names the dialog's
button exactly. The benchmark's one FAIL line is its standing chess.js
feasibility experiment, whose verdict is to keep Kingfisher's own parser.

Keeping compiled routes for the run also cut the suite from about three
hours to one.

## Not done, and why

- **No public release.** Publishing a 1.5.2 DMG means notarising, a GitHub
  release and a Sparkle feed update, which is outward-facing and the owner's
  call; the descriptor therefore still names 1.5.1.
- **Lichess rating classes for signed-in accounts** remain unverified live
  (needs the owner's Lichess session), as in 1.5.0.
- **Windows Edge, the 10M-game import and the eight-hour session** listed as
  pending in the 1.5.0 comparison were not run here.
