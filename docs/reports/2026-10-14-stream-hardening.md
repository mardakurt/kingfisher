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

| Defect                                                                                                                               | Found by                                    | Fix                                                                          | Proof it can fail                                  |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------- |
| `master`'s unit suite was red: the install-page test hard-coded the macOS 13 floor; 1.5.1's descriptor says 14                       | `npm test` on the starting commit           | Fixture pins the floor, checks two values                                    | —                                                  |
| The threaded WASM Stockfish failed in an embedded Chromium ("Uncaught [object Event]"); the board said "Engine error"; no fallback   | Using `/analysis` in the app's browser pane | Provider falls back to the single-threaded build, remembers it for the page  | `provider.test.ts` fails without it                |
| Clicking **Scoresheet** in the sidebar replaced an unsaved analysis with a blank board, silently                                     | Route sweep, 21 routes, 3 moves each        | Unsaved work moves to its own tab first                                      | `scoresheet.spec.ts` fails without it              |
| The **+** (New analysis) beside Save, a Library game, a search hit and other openers replaced an unsaved analysis with no way back   | Same sweep, then the openers                | Central guard on the board: notice with **Open it in a new tab**, until used | `displaced-work.test.ts`, `displaced-work.spec.ts` |
| A companion test took 4.9 s of a 5 s limit and failed under load; three desktop-service tests and one postings test sat at 4.1–4.8 s | A full unit run failing once; duration scan | Budgets derived from each test's own waits; no assertion changed             | —                                                  |

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

## Final candidate

Pending at the time of writing: the full Playwright suite on the final
source, a 1.5.2 desktop bundle with `desktop:certify`, and `npm run
benchmark`. Results are added here only once run.

## Not done, and why

- **No public release.** Publishing a 1.5.2 DMG means notarising, a GitHub
  release and a Sparkle feed update, which is outward-facing and the owner's
  call; the descriptor therefore still names 1.5.1.
- **Lichess rating classes for signed-in accounts** remain unverified live
  (needs the owner's Lichess session), as in 1.5.0.
- **Windows Edge, the 10M-game import and the eight-hour session** listed as
  pending in the 1.5.0 comparison were not run here.
