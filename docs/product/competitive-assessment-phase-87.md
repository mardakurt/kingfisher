# Kingfisher as a ChessBase alternative — the Phase 87 assessment

_2026-09-27. Starting revision `0547f38` (master = origin/master, clean);
the work below is the commits after it on master. Written from the running
application and from commands someone else can rerun, not from the code
alone. Where something was not run, it says so._

This document does three things: says what can and cannot be claimed about
Kingfisher against ChessBase, records how the owner's ten ChessBase-for-Mac
photographs were used, and lists what Phase 87 changed because of both. The
earlier audits stand as records of their time:
[`chessbase-parity-audit.md`](chessbase-parity-audit.md) (Phases 84–85,
verdict **ALMOST / NO**) and [`parity-ledger.md`](parity-ledger.md)
(Phase 86, P0/P1 requirement states).

## 1. What was tested, where

| Surface                        | Revision                                | How                                                                                                                                                                                            |
| ------------------------------ | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser, baseline              | `0547f38`                               | `next dev` on port 3211 from a worktree of that commit; Chrome through Playwright at 1280x720, 1280x800, 1440x790, 1440x860, 1470x860, 1728x1000 and 1728x1117, light and dark; fresh profiles |
| Browser, after                 | master at the Phase 87 commits          | the same scripts against `next dev` on port 3210; the Playwright suites named below                                                                                                            |
| Packaged Mac, from this source | see `docs/reports/phase-87-handover.md` | what was built and run is recorded there, with what was not                                                                                                                                    |
| Public Mac release             | 1.3.2, build 908, `6b59452`             | **not changed and not re-verified in Phase 87.** It does not contain any change below; see `platform-parity.md`, "Published revision check (Phase 87)"                                         |
| ChessBase                      | —                                       | **not run.** No ChessBase licence, no Windows machine, and ChessBase for Mac is not released. ChessBase is described from its publisher's pages and from the ten photographs, and says which   |

The scripts that produced every number in §5 and §6 are committed in
`docs/release-evidence/phase-87/ux/scripts/`; the numbers themselves are
`metrics-before.json`, `metrics-after.json` and
`analysis-geometry-{before,after}.txt` beside them.

## 2. The reference photographs

The owner supplied ten photographs of a laptop running ChessBase for Mac,
taken at an angle, with glare, a newsletter overlay and a QR code in the
corner. They are visual reference, not evidence of behaviour: nothing below
about ChessBase's speed, interaction, typography or hidden features comes
from them. Numbered in the order received.

| #   | Group           | What the photograph shows                                                                                                                                                                                                                       | What it cannot establish                                                                                                                 |
| --- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Analysis        | Board left (blue/white), Overview/Reference/Notation tabs right, notation at top, a Reference table (Moves, Score, Draws, Games, Played, Trend, Best/Frequent players) lower right, an engine bar ("Fritz 21") under the board, grouped sidebar | engine output, reference-table sorting, what "Trend" measures                                                                            |
| R2  | Analysis        | The same after 1.e4 e5 2.Nf3 Nc6, a variation in the notation, reference rows for 3.Bb5/Bc4/d4/Nc3/c3                                                                                                                                           | how variations are entered or promoted                                                                                                   |
| R3  | Preparation     | "Preparation against Karpov": player card, 65% score ring, W/D/L, tabs Openings/Games/Style, a Style report with adjectives and a bar "Evaluations" grid                                                                                        | the method behind the adjectives or the evaluation bars                                                                                  |
| R4  | Preparation     | Carlsen: openings as White and Black by family, each with a green/grey/red result bar and counts                                                                                                                                                | the classification used for families                                                                                                     |
| R5  | Preparation     | Carlsen's Style tab                                                                                                                                                                                                                             | as R3                                                                                                                                    |
| R6  | Library         | Search "Carlsen", a dense table (White, Elo W, Black, Elo B, Result, ECO, moves, Event), a Filters popover (Position, Opponent, Color, Result, Annotations, Beauty), a board-and-notation preview                                               | search speed; what "Beauty" measures                                                                                                     |
| R7  | Game view       | A game opened from the Library: board, header, notation, Reference and Top games panels, a Back to Library link                                                                                                                                 | whether the list keeps its scroll and selection on return                                                                                |
| R8  | Databases       | "All databases": icon tiles for each database and a Cloud folder, sizes under each                                                                                                                                                              | —                                                                                                                                        |
| R9  | Database detail | "Mega Database 2026": tabs (Games, Players, Tournaments, …), count tiles, Weekly updates, Newest tournaments, Top games (loading placeholders)                                                                                                  | the counts' currency; the on-screen game count (12,282,170) differs from the announcement's "over 11.7 million", and neither was checked |
| R10 | Shop            | A catalogue of courses and databases with prices, inside the same sidebar shell                                                                                                                                                                 | —                                                                                                                                        |

**Availability, from the publisher.** `https://en.chessbase.com/post/chessbase-finally-on-mac`,
fetched 2026-09-27, states a release in **November 2026**, "board, engine
lines, reference and top games side by side in one window", search "by
position, opponent, colour, result or annotations", Fritz, Stockfish from
the Engine Cloud or a remote engine "with up to 128 cores", opening reports,
Mega Database 2026 ("over 11.7 million games"), cloud storage and Lichess
and Chess.com access. The page's date as read on that fetch was 2026-09-27;
the Phase 84 audit recorded the same article as 2026-09-21. The difference is
unresolved (it may be an update date) and neither date is relied on here.
Price: not stated on that page.

### 2.1 Principles taken from them

1. **One stable, grouped source list**, with the workflows a researcher uses
   most at the top (R1–R10: Analysis board, Preparation, Repertoire, Library
   first; databases as their own group).
2. **Evidence beside the board, several kinds at once**: notation, a
   reference table and engine lines visible together (R1, R2, R7).
3. **Continuity from finding to analysing**: a Library row previews a game,
   opens it, and there is a way back (R6, R7).
4. **Opponent preparation leads with results by opening**, not only
   frequencies (R4).
5. **Compact tables and restrained accents**: one accent colour for
   selection, dense rows, controls in one toolbar row.

### 2.2 Kingfisher against them

| Principle                         | Kingfisher before Phase 87 (measured)                                                                                                                                                     | Kept                                                                | Changed in Phase 87                                                                                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Grouped source list               | Grouped (Study, Prepare, Improve, Data), but Library and Databases were the last group; Databases below the fold at 1280x800 and 1440x860                                                 | Sentence-case groups, 30px rows, one accent (Phase 82)              | Research group first (`d03ffd6`), then **restored at the owner's preference** — the four groups stay; Databases remains below the fold of the list at 1280x800 |
| Several kinds of evidence at once | Notation at the top of the side panel on screens ≥860px; **below that, a 63px strip under the board** (two lines of a 42-ply game). One tool tab visible at a time                        | Notation as a disclosure section; tools as pinned tabs + More       | Notation beside the board at every height; a layout with the engine under the board                                                                            |
| Find → analyse continuity         | Preview, open, Back restores the query (`/games?q=`); **Open always started at move one** even after stepping the preview                                                                 | The Library table, preview and filters (Phase 83)                   | Open and Review start at the previewed move                                                                                                                    |
| Results by opening                | The dossier computed each family's score and did not show it; figures 1,100px from their labels at 1440                                                                                   | "Measured, never graded" Style (no adjectives, no invented ratings) | Family and first-move tables with share, their score and +W =D −L                                                                                              |
| Compact, restrained               | Explorer table 650px wide in a 380px panel (W/D/B behind a sideways scroll); a 36px layout row on every dock; three accent "Connect Lichess"; three create buttons on an empty Repertoire | Tokens, hairlines, typography (Phases 82–84)                        | Container-query table, layout menu as an icon, one quiet credential button, one create action                                                                  |

**Deliberately not taken:** ChessBase's name, red, artwork and wording; the
shop (R10); cloud databases; and the Style report's adjectives and
"Evaluations" bars (R3, R5), because Kingfisher has no population to grade a
player against and says so (`src/preparation/style.ts`). A similarly named
screen is not a similar capability, and none is claimed here.

## 3. Workflow competitiveness

Separate from content: this table is about whether the _work_ can be done,
comfortably, with the data a player has. §4 is about the data.

Verified = a named test ran green at Phase 87's final commit (see the
handover for the run), or a measurement in §6. **Unknown** = not tested in
this phase.

| #   | Workflow                                                                | Kingfisher, verified                                                                                                                                                                                                                                                   | ChessBase evidence                                                         | Shortcoming (after Phase 87)                                                                                                                                                         | User impact                           | Acceptance criterion                                           | Priority                            |
| --- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- | -------------------------------------------------------------- | ----------------------------------- |
| W1  | Find games and players, filter, open without losing context             | Library search, filters, saved queries, preview, open at the previewed move, Back restores the query (`library-continuity`, `library-databases`, `query-editor`, `saved-queries` specs); Players and Preparation agree on a player's count (`preparation-counts`)      | R6, R7; [CB-Mac] search by position, opponent, colour, result, annotations | Returning from a game restores the query but the list's scroll position and selected row are **unknown** (not tested); move search in a large companion file is slower than an index | Medium on large databases             | Back to Library returns to the same row, selected, at 1M games | P1                                  |
| W2  | Analyse with a reliable engine, navigate variations, annotate, save     | Browser Stockfish 18 and native engines; engine identity per search (`uci-adversarial` unit suite); annotate, save to study, reload (`kingfisher`, `study-reload`, `chapter-continuity`); the notation beside the board at every height (`analysis-laptop`, `phase10`) | R1, R2; Fritz, Engine Cloud, remote 128-core engines                       | No remote engine on a second machine (loopback only, P86 ledger); no Monte Carlo at ChessBase's scale                                                                                | High for a professional with a server | A remote engine on another machine analyses a position         | P1 (blocked: hardware)              |
| W3  | Research positions and transpositions with attributed evidence          | Explorer per named population, never merged; Theory Book; transpositions by `positionKey()`; the explorer fits its panel (`analysis-laptop`, `source-comparison`, `explorer-first-moment`)                                                                             | R1 Reference table; opening report                                         | Reference corpus far smaller than Mega (§4)                                                                                                                                          | High for masters' theory              | —(content)                                                     | —                                   |
| W4  | Prepare against an opponent and move findings into preparation          | Report from every installed source and companion database with per-source counts and caps stated; dossier with results; surprises, priorities, "Prepare" to Analysis (`preparation-counts`, `surprises`, `phase8`)                                                     | R3–R5                                                                      | Style is measured, not graded — a deliberate difference; results depend on the games installed                                                                                       | Medium                                | —                                                              | —                                   |
| W5  | Build, maintain and study a repertoire                                  | Position-keyed repertoire, inbox, scan, coverage, Daily rehearsal (`repertoire-inbox`, `repertoire-scan`, `repertoire-review`, `daily-session`)                                                                                                                        | Repertoire database, Repertoire Scan                                       | none found in this phase's walk                                                                                                                                                      | —                                     | —                                                              | —                                   |
| W6  | Organise studies, opening files, collections                            | Studies with chapters, tags, Opening Files, collections and source sets (`organising`, `opening-files`); one create action on empty pages (`empty-states`)                                                                                                             | Databases, folders (R8)                                                    | Studies' own list and a study's chapters were not re-walked for density in this phase (**unknown**)                                                                                  | Low                                   | —                                                              | P2                                  |
| W7  | Import, export, back up, restore, reopen                                | PGN, Lichess/Chess.com, ChessBase CBH/CBV read, ChessBase write, En Croissant read; portable backup and restore (`backup-restore`, `chessbase-import`, `chessbase-export`, `en-croissant`)                                                                             | ChessBase formats natively                                                 | A Kingfisher-written ChessBase database has not been opened in ChessBase (no licence)                                                                                                | Medium for mixed teams                | A written `.cbh` opens in ChessBase with every game            | P1 (blocked: licence)               |
| W8  | The Mac application across window sizes, full screen, relaunch, offline | Public 1.3.2 certified in Phase 86 (`desktop:certify` 10/10). Phase 87's changes on a package: see the handover                                                                                                                                                        | ChessBase for Mac: not released                                            | Windows: no build (`docs/design/windows.md`)                                                                                                                                         | High for half the market              | A Windows build run and certified                              | P1 (blocked: hardware, certificate) |

## 4. Content and ecosystem — not a workflow question

ChessBase sells a commercial corpus (Mega Database, the announced "over 11.7
million games", an annotated subset, weekly updates), an editorial catalogue
(R10), a cloud and a community (Let's Check). Kingfisher's reference packs
are built from openly licensed sources and are far smaller; its annotated
material is fourteen public-domain games. None of that changes because a
screen was redesigned, and none of it can be closed by software: it needs
licensed content or a data-rights decision (`docs/data/historical-games-audit.md`).
A player whose work depends on Mega's annotated games has **no equivalent**
in Kingfisher today.

## 5. What Phase 87 changed

Each row has a test that fails without the change (reverted once and run;
the commit message says which).

| Change                                                                                            | Commit    | Test                                                 |
| ------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------- |
| Preparation: no false "no reference games" while packs load; the pack's cap stated as a cap       | `ec5d5e9` | `e2e/preparation-counts.spec.ts`, `players.test.ts`  |
| Notation beside the board at every height; explorer table fits its panel; layout row → icon       | `dcd1c0a` | `e2e/analysis-laptop.spec.ts`, `e2e/phase10.spec.ts` |
| Skip icons drew each other's glyph                                                                | `e0f9550` | `src/components/icons.test.tsx`                      |
| Library opens at the previewed move                                                               | `68dfff6` | `e2e/library-continuity.spec.ts`                     |
| Sidebar: research loop first — **reverted** at the owner's preference, see the handover           | `d03ffd6` | (removed with the revert)                            |
| Tab strip counts padding and gaps (a regression the layout audit caught)                          | `1738396` | `e2e/seven-pages-layout.spec.ts`                     |
| One create action on empty Repertoire/Studies; no "route context"                                 | `243dc62` | `e2e/empty-states.spec.ts`                           |
| Early Enter in Preparation waits for the library; dossier results                                 | `ea7de86` | `e2e/preparation-counts.spec.ts`, `dossier.test.ts`  |
| One quiet Connect Lichess per source                                                              | `7d1b949` | (visual; no behavioural test)                        |
| Engine under the board layout; short engine panels show lines first                               | `e762a23` | `e2e/analysis-laptop.spec.ts`                        |
| Documents and Settings copy corrected                                                             | `7dde258` | `npm run docs:check`                                 |
| Repertoire's side panel scrolls, so Position evidence never collapses (found by the full e2e run) | `2a08341` | `e2e/phase7.spec.ts`                                 |

Every hash above is from `git log --oneline 0547f38..`.

## 6. Measured before and after

Baseline `0547f38` against the Phase 87 master, same scripts, fresh
profiles, Chrome.

| Measure                                               | Before                   | After                                                   |
| ----------------------------------------------------- | ------------------------ | ------------------------------------------------------- |
| Board at 1280x720 / 1280x800 / 1440x790               | 452 / 532 / 522px        | 556 / 614 / 626px                                       |
| Notation height at those sizes                        | 63px each                | 208 / 235 / 232px                                       |
| Board and notation at 1470x860 and 1728x1000          | 664 / 804px, 283 / 336px | unchanged                                               |
| Explorer table sideways overflow at 1280x720          | 271px                    | 0                                                       |
| Explorer rows readable without scrolling, 1280x720    | **9**                    | **5**                                                   |
| Databases visible in the sidebar at 1280x800          | no                       | no (the Phase 87 reorder that made it yes was reverted) |
| Create-repertoire buttons on an empty Repertoire page | 3                        | 2 (header + page)                                       |
| "Start a study" on an empty Studies page              | 2                        | 1                                                       |
| "no reference games" shown for Carlsen, fresh profile | yes, then 705            | never                                                   |

**The trade-off in that table is real.** With the notation beside the board
on a laptop, the explorer's table has a third less height: nine readable rows
became five at 1280x720. The board gained 104px and the notation went from
two lines to the whole game; a person who wants the explorer at full height
folds the notation (remembered) or chooses a layout. The commit message of
`dcd1c0a` compares with an intermediate state ("five where three were") and
understates this; this table is the comparison with the baseline.

## 7. Verdict

**Can Kingfisher compete with ChessBase in its core workflows?** For the
eight workflows in §3, done with the data a player has — their own games,
the open reference packs, Lichess, a companion database of millions of
games — **yes, and this phase removed the laptop-layout, preparation-count
and continuity defects that stood against saying so**. Every row in §3 is
backed by a test that ran; the shortcomings left in it are stated.

**Is it an alternative to ChessBase for a professional?** **Not yet**, for
the reasons the Phase 84 audit gave and this phase did not change: the
licensed annotated corpus (§4), remote engines on a second machine, a
ChessBase file verified in ChessBase, and Windows. Each is blocked on
content, hardware or a licence, not on code in this repository.

**What still needs people rather than code.** Whether the new layouts are
_more comfortable_ is a judgement the measurements support and do not
settle: the notation/explorer trade-off in §6 in particular should be put
to strong players, coaches and seconds before it is called better for them.
No user evaluation was run in Phase 87.
