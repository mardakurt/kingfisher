# Kingfisher and ChessBase: a parity audit by workflow

_Phase 84, 2026-09-24. Question asked: can a serious player answer, in
Kingfisher, the study, preparation, database and analysis questions they
would answer in ChessBase? Not "does Kingfisher have a database search", but
"can the same work be done, and is it done as well or better". Written from
ChessBase's own current documentation and reviews (sources at the end) and
from this repository as it stands at the end of Phase 84, with each
Kingfisher claim pointing at code or a browser test. What this is not: a
hands-on test of ChessBase itself — no ChessBase licence or Windows machine
was available, and ChessBase for Mac is not released until November 2026.
Where ChessBase is described, it is described from its publisher's pages
and its own reviewer, and says so._

## 1. What ChessBase is today

- **ChessBase 26** (Windows, 2025-11-11) with **Mega Database 2026** (11.7
  million games, 1475–2025, the annotated subset its main attraction)
  [CB26-Horizon], [CB-Mac].
- **New in 26** [CB26-Wuellenweber]: an Opening Report generated from the
  reference database (key continuations, pioneers, popularity graphs,
  performance by Elo class, typical pawn and piece moves, instructive games,
  tactical exercises) [CB26-OpeningReport]; faster reference-search filters
  (player, colour, classical/rapid/blitz/correspondence); hover-a-piece
  manoeuvre visualisation coloured by success; Monte Carlo analysis
  (engine-vs-engine simulations for practical W/D/L); AI plan descriptions;
  a ray-traced 3D board; an engine manager; a rebuilt duplicate finder;
  database icons and themes.
- **Player preparation** [CB26-Guide3]: Style Report and Error Report
  (with a "Blunder Elo"), Identify Player (online handle → real player),
  statistics by opening and by opponent, Collect Openings (a player's games
  by ECO), Same Player (a player's games in a structure across openings).
- **Analysis** [CB26-Guide2]: Deep Analysis (an engine tree deepened
  overnight), Monte Carlo, AI Consult, Surveys, reference search with piece
  hover; Let's Check (200 million shared analysed positions) and the Engine
  Cloud [LetsCheck].
- **Databases and search**: the search mask (header, position, material,
  manoeuvre, annotations) with a search booster index [CB-Search]; merging
  games into one tree with Enter [CB-Merge]; repertoire databases and the
  Repertoire Scan over a new batch of games [CB-Repertoire]; player dossiers,
  theoretical-novelty marking against the reference database [CB-Dossier].
- **Training**: training annotations — a question at a move, hidden
  notation, points and time, worksheets printed with solutions [CB-Training].
- **ChessBase for Mac** (announced 2026-09-21 for November 2026): rebuilt
  rather than ported; board, engine lines, reference and top games side by
  side; a sidebar; search by position, opponent, colour, result or
  annotations; local Fritz, cloud Stockfish, remote engines to 128 cores;
  the Opening Report; cloud databases [CB-Mac]. Its full feature set against
  the Windows program is not stated.
- **What its own reviewer found** [CB26-Review]: the AI commentary is
  "generic" and contradicts the engine; the time-control filter showed blitz
  games that were filtered out; the reports depend on a well-kept reference
  database. The complaints collected in `market-research.md` §3.1 —
  stability, a learning curve, Windows-only until November, price and
  support — remain the market's.

## 2. Workflow by workflow

Each row: what the work is, how ChessBase does it, how Kingfisher does it,
and the verdict — **match**, **different** (the same question answered
another way), **stronger**, **weaker** or **missing**.

### 2.1 Opening preparation

| Question                                 | ChessBase                                      | Kingfisher                                                                                                                                                                             | Verdict                                                       |
| ---------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| What do strong players play here?        | Reference search on Mega                       | Explorer over named populations, each in its own column (Starter, Elite OTB, Recent Theory, High-Rated Online, Lichess, your collections)                                              | **different** — never merged; weaker in corpus size (§4)      |
| What does my opponent play?              | Player preparation, Collect Openings           | Preparation report: tree with frequencies, surprises, priorities, dossier, sheet                                                                                                       | **match**                                                     |
| What do I play, and how do I score?      | Player statistics                              | Personal Results, "Played against you", Season, Review's recurring facts                                                                                                               | **stronger** — facts with denominators, no invented grade     |
| When was this first played, and by whom? | Opening Report pioneers, popularity graph      | **Phase 84**: position page → History (first and latest game, games per year, who plays it) from dated collections                                                                     | **weaker** — dated only for your collections; packs keep none |
| Recent trends                            | Popularity over time                           | Theory Radar (three date windows per source), History                                                                                                                                  | **match** within the data held                                |
| Model games                              | Top games, instructive games                   | Model Games tool, similar games by structure, curated model games                                                                                                                      | **match**                                                     |
| Engine recommendation                    | Engine, Let's Check, Engine Cloud, Monte Carlo | Stockfish in the browser, native engines, two engines, **Phase 84**: labelled Lichess cloud evaluation and Deep analysis (a tree grown by the engine, with where it changed its mind)  | **match**; no Monte Carlo, no remote engines                  |
| Repertoire coverage and weak branches    | Repertoire database, manual                    | Coverage (evidence-backed gaps), Position Health, never-reached lines                                                                                                                  | **stronger**                                                  |
| Possible novelties                       | TN marking against the reference               | Surprise finder, deviation detection; **Phase 84**: Explorer → _This game against <source>_ — where the game leaves a named population, the games that got there, written in as a fact | **match** — one game at a time, no batch pass                 |

### 2.2 Opponent preparation

Kingfisher's Preparation report covers the same ground as ChessBase's player
preparation (openings by colour, results, games, a dossier and a game-day
sheet) and refuses the one thing ChessBase sells most loudly, the Style
Report's adjectives: `src/preparation/style.ts` measures and never grades,
because there is no population to grade against. ChessBase's Identify Player
(online handle → real name) has no equivalent and should not have one here:
it is profiling, and `market-research.md` §3.5 records why players object.
**Verdict: match, deliberately different on style.**

### 2.3 Post-game analysis

Import (PGN, Lichess and Chess.com accounts, the scoresheet with OCR through
your own endpoint, ChessBase CBH/CBV read-only), analysis with engine
evidence written into the tree as variations with one undo, After the round
(deviation from the repertoire, clock use, critical moments), the review
queue, and training positions from any move. ChessBase's Tactical Analysis
and Blunder check are the same job. **Verdict: match**; Kingfisher's is
facts with evidence lines, ChessBase's adds natural-language commentary its
own reviewer finds generic.

### 2.4 Repertoire building

A repertoire keyed by position (transpositions converge by construction),
spaced-repetition review, a daily rehearsal, coverage against a named
population, and — **Phase 84** — **the repertoire scan**: any collection,
including a SQLite file behind the companion, read game by game to report
which games reach the repertoire and where each leaves it (a new move
against the line, another choice for your side, past the preparation).
ChessBase's Repertoire Scan answers the same question over its repertoire
database. **Verdict: stronger** — position-keyed, and connected to training
and review, where ChessBase's repertoire is a database of games.

### 2.5 Database research

| Search                          | ChessBase                         | Kingfisher                                                                                                                    | Verdict                                                                       |
| ------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Header search                   | Search mask                       | Library search mask: event, site, dates, Elo band, time class by a printed rule                                               | **match**                                                                     |
| Position                        | Position search, search booster   | Exact position across every store; same pawn skeleton; the companion's claim index                                            | **match**                                                                     |
| Material                        | Material search                   | Material as books write it (`R v B`)                                                                                          | **match**                                                                     |
| Manoeuvre                       | Manoeuvre search                  | Piece-route search (`N b1 d2 f1 g3`)                                                                                          | **match**                                                                     |
| Annotations                     | Annotation search                 | Comment text search                                                                                                           | **match**                                                                     |
| Across databases                | Any database in the list          | **Phase 84**: the Library shows any collection (the browser's or a companion SQLite file); Databases searches several at once | **match**                                                                     |
| Merge games into one tree       | Select games, Enter               | **Phase 84**: Library → select → Merge into one tree                                                                          | **match**; transpositions counted and named                                   |
| Duplicates                      | Find Double Games (rebuilt in 26) | By fingerprint and by metadata key, reviewed, never auto-deleted                                                              | **match**                                                                     |
| Move search in a companion file | Search booster over the database  | **Phase 84**: the move-level mask reads a companion file too, page by page through the companion (no index)                   | **match** in answers; **weaker** in speed (measured in the Phase 84 handover) |

### 2.6 One position, all the evidence

The position page joins your games, your studies, hand-ins, repertoire
decisions, training cards, stored engine evidence, each reference population
in its own column, the same pawn structure elsewhere and — Phase 84 — the
position's history. ChessBase spreads the same answers over the reference
window, the tree, the opening report and Let's Check. **Verdict: stronger** —
it is one address, and it includes the player's own work, which ChessBase's
reference search does not.

### 2.7 Long-term knowledge

ChessBase keeps knowledge as annotated games in databases. Kingfisher keeps
it as position-keyed records — repertoire decisions, pinned engine lines,
training cards with a schedule, critical positions, notes — that every tool
reads. Phase 84 adds **questions inside a study chapter** (ChessBase's
training annotations): a coach marks the moves to find, a student solves the
chapter, the summary says what was missed, and the misses go to Training with
spaced repetition; _Publish → As a worksheet_ prints the questions as
positions with the solutions on the last page. **Verdict: stronger** for a
player's own knowledge, **match** for a coach's worksheet.

## 3. What Phase 84 changed

| Gap (market-research §6 and this audit) | Change                                                                                               | Where                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Merge games into one tree               | Library selection → one tree, first game the main line, each branch labelled, transpositions counted | `src/chess/tree/merge.ts`, `e2e/merge-games.spec.ts`                    |
| Repertoire scan                         | Any collection, three kinds of departure, grouped by position, deepest first                         | `src/repertoire/scan.ts`, `e2e/repertoire-scan.spec.ts`                 |
| Cloud evaluation                        | Lichess cloud, asked for per session, labelled as stored analysis, never mixed into local evidence   | `src/engine/cloud-eval.ts`, `e2e/cloud-evaluation.spec.ts`              |
| The opening report's missing half       | Position history: first and latest game, games per year, who plays it                                | `src/position/history.ts`, `e2e/position-history.spec.ts`               |
| Library limited to My games             | Any collection in the Library, with the filters a source cannot apply named                          | `src/features/games/library-source.ts`, `e2e/library-databases.spec.ts` |
| Questions inside a chapter              | Marked moves, solved with Training's control, misses to Training; a printed worksheet                | `src/chess/tree/questions.ts`, `e2e/chapter-questions.spec.ts`          |

Continued in the same phase (`docs/reports/phase-84-handover.md`):

| Gap                                 | Change                                                                                                 | Where                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Find Novelty / Novelty Annotation   | Where the game on the board leaves the explorer's source, the games that got there, written in as fact | `src/theory/departure.ts`, `e2e/departure.spec.ts`                   |
| Deep Analysis                       | A tree grown by the engine; the start's search beside the tree's; where the engine changed its mind    | `src/engine/deepen.ts`, `e2e/deep-analysis.spec.ts`                  |
| Move search inside a companion file | The Library's material, theme, route and comment search over a companion database                      | `src/features/games/deep-search.ts`, `e2e/library-databases.spec.ts` |
| Merging over unsaved work           | Merges, predecessor games and deep-analysis trees open in their own tab                                | `src/features/tabs/tab-actions.ts`, `e2e/merge-games.spec.ts`        |
| Preparation counts                  | Each source's count is its share of the games the report reads                                         | `src/features/preparation/opponent-games.ts`                         |

Found and fixed on the way: a move played in a study chapter and followed by
a reload inside the autosave debounce was lost while the header said
"Saved" (`e2e/study-reload.spec.ts`).

## 4. Where each is stronger

**Kingfisher is stronger** at: one store keyed by position across all of a
player's work; facts with denominators instead of labels (no "brilliant",
no style grades, no AI prose presented as analysis); populations kept apart;
spaced repetition and daily rehearsal on the player's own lines; the
repertoire as a position map with coverage and a scan; the web and the Mac
from one source with no account and no subscription; certified stability
(seeded hostile walks, suspend, restart, fault injection); reading ChessBase
files without writing them.

**ChessBase is stronger** at:

1. **The reference corpus.** 11.7 million games with a large annotated
   subset, updated weekly. Kingfisher's packs total about one million
   games in aggregated form, and it has no licensed annotated master
   corpus (`market-research.md` row 13). This is the largest gap, and it is
   a licensing and data problem rather than a software one.
2. **Reports drawn from that corpus**: the Opening Report's Elo-class
   performance and typical-move sections come from per-game data Kingfisher's
   packs do not keep; history by year is available here only for dated
   collections the player imports.
3. **Engine tooling for professionals**: Monte Carlo, remote engines to 128
   cores, a rented cloud engine, and a Deep Analysis that survives the night
   on its own. Kingfisher runs local engines, reads the Lichess cloud, and
   (Phase 84) grows a deep-analysis tree while its window is open.
4. **Speed of move-level search inside a large external database**:
   ChessBase's search booster is an index; Kingfisher's search of a
   companion file (Phase 84) reads every selected game.
5. **Publishing into its ecosystem** (ChessBase Magazine, the shop,
   cloud databases shared between users).
6. **Twenty years of incumbency**: users, courses, shop content.

## 5. Verdict

**ALMOST.** Asked for a plain YES or NO, the answer is **NO**, for the
reasons below; `docs/reports/phase-84-handover.md` §5 gives it with the
evidence from the rest of the phase.

Kingfisher can now do, for the player it is built for, every everyday
ChessBase workflow this audit found — prepare an opening and an opponent,
analyse and annotate a game, build and maintain a repertoire, search and
merge games across databases, study a position with all the evidence, and
keep what was learned — and it does several of them better. It is not yet
"at the level of ChessBase" for the professional whose work depends on
ChessBase's data and heavy engine tooling, and saying yes would claim the
corpus Kingfisher does not have.

What would have to be true for **YES**, in order:

1. **A deep, dated, annotated reference corpus** — licensed, with per-game
   years and ratings kept in the packs (a pack-format change), so the
   Opening Report's history and Elo-class sections can be answered from a
   population and not only from the player's imports.
2. **An index for move-level search inside companion databases** — the
   answers exist since the Phase 84 continuation; the speed on a
   ten-million-game file does not.
3. **Deep analysis that survives a night on its own** (the tree exists since
   the Phase 84 continuation; a run that persists across a reload or a sleep
   does not) and remote engines on the player's own machines.
4. **A Windows build**, run and certified (`docs/design/windows.md`); until
   then half of ChessBase's users cannot switch.

## Sources

- [CB26-Horizon] "ChessBase'26: Expand your chess horizon!" —
  <https://en.chessbase.com/post/chessbase-26-expand-your-chess-horizon>
- [CB26-Wuellenweber] "Matthias Wuellenweber on all new functions for ChessBase 26" —
  <https://en.chessbase.com/post/matthias-wuellenweber-on-all-new-functions-for-chessbase-26>
- [CB26-OpeningReport] "The Complete Guide to the ChessBase 26 Opening Report" —
  <https://en.chessbase.com/post/matthias-wuellenweber-the-complete-guide-to-the-chessbase-26-opening-report>
- [CB26-Guide2] "ChessBase´26: A Players Guide (2)" —
  <https://en.chessbase.com/post/chessbase-2026-a-players-guide-2>
- [CB26-Guide3] "ChessBase´26: A Players Guide (3)" —
  <https://en.chessbase.com/post/chessbase-2026-a-players-guide-3>
- [CB26-Review] "Review: ChessBase´26 – The beginning of a new era" —
  <https://en.chessbase.com/post/review-chessbase-26-the-beginning-of-a-new-era>
- [CB-Mac] "ChessBase – finally on Mac!" (2026-09-21) —
  <https://en.chessbase.com/post/chessbase-finally-on-mac>
- [CB-Search] "The search mask in ChessBase 16" —
  <https://en.chessbase.com/post/the-search-mask-in-chessbase-16>;
  "Search booster" — <http://help.chessbase.com/CBase/13/Eng/000077.htm>
- [CB-Merge] "Merging games" — <http://help.chessbase.com/CBase/16/Eng/merge_games.htm>
- [CB-Repertoire] "Repertoire database" —
  <https://help.chessbase.com/CBase/15/Eng/repertoire_database.htm>
- [CB-Dossier] "Player dossier" — <http://help.chessbase.com/Cbase/15/Eng/001549.htm>;
  "Reference database" — <https://help.chessbase.com/CBase/16/Eng/reference_database.htm>
- [CB-Training] "Annotating in ChessBase: creating training positions" —
  <https://en.chessbase.com/post/annotating-in-chessbase-creating-training-positions>
- [LetsCheck] "Let's Check" — <https://account.chessbase.com/en/apps/letscheck>
- The market research this builds on: `docs/product/market-research.md`.
