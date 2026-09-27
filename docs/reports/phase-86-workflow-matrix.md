# Phase 86 — workflow matrix

_2026-09-27. Journeys an amateur and a professional take through the seven
reworked pages (Daily, Season, Endgame, Score Sheet, Similar Games, Team,
Opening Files) and the workspaces they lead into (Analysis, Studies,
Repertoire, databases, engines). Each row names the test that drives it in
a real browser and its result. **passed** means the named test ran green
at the commit given; **failed**, **blocked** and **untested** are stated
with the reason. Nothing is marked passed on the strength of code alone._

Runs referred to below:

- **E2E-full**: `npm run test:e2e` (Chrome) at `2611839` — 396/398; the two
  failures were a status-line regression introduced in this phase and a
  spec selector, both fixed in `6c5bb4d` and green on rerun (95/95, 1/1).
- **Targeted**: the named specs rerun at `6c5bb4d`.
- **Packaged**: `npm run desktop:certify` on the 1.3.2 bundle — see
  `phase-86-handover.md`; rows that need the Mac application say so.

## 1. Amateur journeys

| #   | Journey                                                                                         | Pages                               | Test                                                       | Result |
| --- | ----------------------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------- | ------ |
| A1  | Open today's session, begin, grade, reload, continue, finish; graded cards actually rescheduled | Daily → board                       | `daily-session.spec.ts` "four slices…"                     | passed |
| A2  | A damaged record does not leave Daily "loading for ever"                                        | Daily                               | `daily-session.spec.ts` "a record that cannot be read…"    | passed |
| A3  | Type an OTB game as written (German letters, smudges, an unreadable cell), save to My games     | Score Sheet → Library               | `scoresheet.spec.ts` "typed as written…"                   | passed |
| A4  | Correct a misread move (button and Backspace), reload mid-sheet, nothing lost                   | Score Sheet                         | `scoresheet.spec.ts` "corrected… survives a reload"        | passed |
| A5  | Set up a rook ending; see which tablebase answers, and that the position goes to lichess.org    | Analysis → Endgame                  | `endgame-availability.spec.ts`                             | passed |
| A6  | Same, offline: the page says the online tablebase cannot answer                                 | Endgame                             | `endgame-availability.spec.ts` (`context.setOffline`)      | passed |
| A7  | Play an ending out against the engine                                                           | Endgame                             | `playouts.spec.ts`, `phase10.spec.ts`                      | passed |
| A8  | Make an opening file, link the open chapter, add a position with its line and reason, notes     | Studies → Opening Files             | `opening-files.spec.ts` "links the open chapter…"          | passed |
| A9  | Find games like the position on the board, choose the facts, open one at the matching move      | Analysis → Similar Games → Analysis | `similar.spec.ts` (2)                                      | passed |
| A10 | Look back over a season of own games; missing data is not zero                                  | Season                              | `season.spec.ts` (2)                                       | passed |
| A11 | Every page at 1024, 1280, 1440, 1920 and 390 px; sidebar open and collapsed; light and dark     | all seven                           | `seven-pages-layout.spec.ts` (4 arrangements × 5 windows)  | passed |
| A12 | Keyboard only: every control named, focus visible at every Tab                                  | all seven                           | `accessibility.spec.ts` (names: 17 routes; focus: 7 pages) | passed |

## 2. Professional journeys

| #   | Journey                                                                                               | Pages                           | Test / evidence                                                       | Result       |
| --- | ----------------------------------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------- | ------------ |
| P1  | Coach sets work, student hands in by packet, coach reviews; the thread survives a reload; drafts kept | Team → board → Team             | `team.spec.ts`                                                        | passed       |
| P2  | Two tabs on one opening file: the later tab does not overwrite the other's notes                      | Opening Files                   | `opening-files.spec.ts` "notes changed in another tab…"               | passed       |
| P3  | Build "(ECO B or C) and not drawn", save it, run it, rerun and see what is new                        | Library                         | `query-editor.spec.ts`, `saved-queries.spec.ts`                       | passed       |
| P4  | Repertoire maintenance: what needs attention, why, decide, and see it reopen when evidence changes    | Repertoire                      | `repertoire-inbox.spec.ts`                                            | passed       |
| P5  | A companion database with the posting index; convert another; both answer in the Library              | Databases → Library             | `posting-index.spec.ts`                                               | passed       |
| P6  | The same layout at millions of games                                                                  | companion                       | `docs/release-evidence/phase-86/real-scale-10m-postings/` (7,464,900) | see §3       |
| P7  | Every analysis job in one list, with engine, budget, checkpoint                                       | command palette → Analysis jobs | `analysis-jobs.spec.ts`                                               | passed       |
| P8  | Add stored evaluations to a chapter as one undoable batch                                             | Analysis / Studies              | `evaluation-write-back.spec.ts`                                       | passed       |
| P9  | Import a ChessBase database and download what was left behind                                         | Databases                       | `chessbase-import.spec.ts`                                            | passed       |
| P10 | Prepare against a player from packs and companion databases, each its own source                      | Preparation                     | Phase 85 Part E (packaged and browser)                                | passed (P85) |
| P11 | An eight-hour deep analysis surviving sleep and quit                                                  | Analysis (packaged)             | Phase 85 `deep-night`                                                 | passed (P85) |
| P12 | A remote engine on a second machine                                                                   | Settings → Engines              | loopback only; no second machine (owner)                              | blocked      |
| P13 | A ChessBase export opened in ChessBase                                                                | Databases                       | no ChessBase licence (owner)                                          | blocked      |
| P14 | Team access across devices, sync                                                                      | Team                            | owner chose file exchange only                                        | blocked      |
| P15 | Any journey on Windows                                                                                | —                               | no Windows machine or certificate (owner)                             | blocked      |

## 3. Edge cases

| Case                                                          | Where it is exercised                                                                                   | Result         |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------- |
| Empty: every page with no data                                | `layout-integrity.spec.ts`, `seven-pages-layout.spec.ts` (fresh profile); "before/after" empty captures | passed         |
| Loading that never ends                                       | Daily damaged-record test                                                                               | passed         |
| Offline                                                       | Endgame availability                                                                                    | passed         |
| Unavailable source (companion not paired, pack not installed) | `similar.spec.ts` "a pack says what it cannot be asked"                                                 | passed         |
| Stale results after the board moves                           | `similar.spec.ts` "says when results are stale"                                                         | passed         |
| Reload mid-work                                               | Score Sheet, Daily, Team, Opening Files specs                                                           | passed         |
| Cross-tab write                                               | Opening Files notes; studies (`chapter-continuity.spec.ts`)                                             | passed         |
| Import interrupted mid-way (companion)                        | `companion/src/database.test.mjs`, `postings.test.mjs` (unit, real SQLite)                              | passed         |
| Storage refused (private window, quota)                       | `src/daily/rehearsed.test.ts` (unit); Team draft on a failed save (`team.spec.ts`)                      | passed         |
| Phone width                                                   | `seven-pages-layout.spec.ts` 390 px; `viewports.spec.ts`                                                | passed         |
| Full screen in the Mac application                            | `desktop:chrome -- --packaged` (the reservation collapses)                                              | packaged       |
| Firefox and WebKit                                            | last full matrix: 1,493/1,496 at `2f2095a`, the 3 fixed in `34c3a33`; not rerun after the page work     | untested since |

## 4. Defects found by walking these journeys (all fixed, each with a test that fails without the fix)

| Page          | Defect                                                                                                          | Commit               |
| ------------- | --------------------------------------------------------------------------------------------------------------- | -------------------- |
| Daily         | a repertoire grade never rescheduled the card; a critical grade wrote against the wrong revision                | `f064ea0`            |
| Daily         | the rehearsed count reset after every grade, so "complete" was unreachable and "Continue" became "Begin"        | `f064ea0`            |
| Score Sheet   | a reload replaced the typed moves with a blank sheet                                                            | `d0a0c57`            |
| Opening Files | switching files showed, and could save, the previous file's notes                                               | `fcd59ca`            |
| Opening Files | "link a chapter from the study" named a feature that did not exist                                              | `fcd59ca`            |
| Endgame       | implied no tablebase without local Syzygy, and never said positions go to lichess.org                           | `7e52919`            |
| all pages     | tertiary text under WCAG AA (4.10:1 light, 4.40:1 dark)                                                         | `4ba6e19`            |
| all pages     | "White view" cut to "Whi" beside a rail and dock; a segmented switch hid its last option in an invisible scroll | `dbc67bd`, `6c5bb4d` |
| Daily, Season | content rendered after the grid, flush against the sidebar                                                      | `03cc3b3`            |
| companion     | an interrupted bulk import left the row layout's explorer counts short for good                                 | `4795c4c`            |
