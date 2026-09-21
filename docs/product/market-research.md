# The chess study market: what people ask for and do not have

_2026-09-21. Research for the stated goal — Kingfisher as the ChessBase of
its era: first close the gaps, then lead. Written from first-hand sources:
user forums, product reviews, practitioners' blogs and the products' own
documentation. Every claim below carries its source; the sources are
listed at the end. What this is not: a quantitative market study. No
telemetry, no survey of our own, no revenue figures — the people who write
in forums are the ones with a complaint, and the numbers here are counts
of what they said, not of the market._

## 1. The people

Five kinds of player use study software, and they do not want the same
thing. The design decisions in this document name which one they serve.

| Who                                         | What they do with software                                                                                                 | What they buy today                                                               |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Professionals and their seconds**         | Deep opening trees, engine farms, opponent files, a second who writes and a player who reads                               | ChessBase + Mega Database + cloud engines; Lichess studies for sharing            |
| **Club and tournament players** (1600–2300) | A repertoire they must remember, their own OTB games to annotate, an opponent to look up the night before, a coach to show | ChessBase or nothing; Lichess studies; a Chessable course; a spreadsheet          |
| **Adult improvers** (online, 1000–1800)     | Game review, tactics, an opening course, "what am I doing wrong"                                                           | Chess.com/Lichess, Chessable, Aimchess, Chessbook, Chessdriller                   |
| **Coaches and academies**                   | Homework, review of students' games, a class of fifteen, attendance                                                        | Lichess studies + Zoom + WhatsApp + a Google Sheet; Chessido; Chess Nexus; Chessr |
| **Juniors' parents and schools**            | Progress they can see, something safe                                                                                      | ChessKid, academy platforms                                                       |

Kingfisher's stated target is the second row, working with the fourth and
occasionally the first. That is also the row with the least software written
for it: the professional tools are too much and too Windows, the improver
tools stop at move fifteen, and the coaching platforms manage classes rather
than chess.

## 2. The products, by category

- **Database workstations.** ChessBase 18 (Windows; ~€650 first year with
  Mega Database and a Premium account [Disco]); HIARCS Chess Explorer Pro
  (Mac/Windows, $79.95–$169.95, reads CBH, Rosetta 2 on Apple Silicon
  [Disco]); Scid vs PC and ChessX (free, "UI from two decades ago" [Disco],
  [ChessMind]); En Croissant (free, open source, "development pauses for
  months" [Disco]); Manifest Chess Studio (€129, no CBH, no tablebases
  [Disco]); PGNBase (browser, 9.4M games, free tier [Chess.com-Mac]).
- **Opening trainers.** Chessable (author courses, MoveTrainer, spaced
  repetition — "the best in chess software" [DarkSquares]); Chessbook
  (own repertoire, Lichess stats by rating, mobile, no offline
  [64Squares]); ChessAtlas (own repertoire with deviation detection
  [DarkSquares]); Listudy, Chessdriller, ChessTempo (spaced repetition on
  Lichess studies or PGN, free/open [Chessdriller], [Lichess-SR]).
- **Platforms.** Lichess studies (free, 64 chapters a study, no cross-study
  search [Disco]) and Insights; Chess.com Game Review and Insights (premium
  gated, labels).
- **Analytics.** Aimchess (patterns across games, "Time Management",
  scouting [Aimchess]); OpeningTree (all your games in one tree, and an
  opponent's [Lichess-Weak]); DecodeChess (explanations).
- **Coaching / academy.** Chessido and Chess Nexus (rosters, homework
  templates, auto-grading, rating sync [Chessido], [ChessNexus]); Chessr
  (real-time online coaching) [Chessr].
- **OTB capture.** DGT boards; ChessCam and ChessGaze (camera transcription);
  scoresheet OCR apps (CheSScan, Score Sheet Scanner); FIDE-approved
  tablet scoresheets [OTB].

## 3. What people complain about — with the source

### 3.1 ChessBase

The incumbent's users are the clearest voices, because they pay the most.

- **Stability.** "It has crashed 4 times in about 2 hour" (mineriva, CB18
  disappointment thread); "Bug after bug after bug" (Phil4Real, same); a
  freeze needing Task Manager (tewald, same); crashes and "game resumption
  failures" (Trustpilot, 2.0/5 over 15 reviews) [Lichess-CB18],
  [Trustpilot-CB].
- **Broken features.** "Find player" returns the same result whatever the
  URL, in 17 and 18 (mineriva, Finnessed); player preparation "no longer the
  moves list" from 16 [Lichess-CB18].
- **Usability.** "Expensive, buggy, and hard to learn", "the UI is still
  rocking 1999" (Solon) [Solon-Files]; "Terrible usability — almost nothing
  is intuitively clear" (Trustpilot); the Lichess integration reachable
  from several places and confusing (Chessman2b) [Lichess-CB18].
- **Platform.** Windows only; Parallels "doesn't support certain CPU
  extensions" so engines run slowly; the Mac version was discontinued for
  poor sales [Chess.com-Mac], [Disco].
- **Price and licensing.** "Overpriced" for the functionality; account
  lockouts after disconnections; shop purchases that do not load
  [Trustpilot-CB]; the first year on a Mac ≈ €650 [Disco].
- **Support.** "Support does not respond"; tickets of two months
  [Trustpilot-CB].
- **Data hygiene.** "Lackluster at finding and deleting duplicate games"
  (Vladimir); Elo below 600 becomes zero; Chess960 import from CBV fails
  (jenesuispasdave) [ChessMind].
- **What its own reviewer flags.** The Error Report is slow; Beauty Search
  needs the new database format; natural-language auto-annotation "lacks
  nuance" [Watson], [ChessMind].

### 3.2 Study tools

- "Difficult to organize, and almost impossible to search" — opening files
  mixed with game reviews; no position search (Solon) [Solon-Files].
- Folders for studies requested from 2021 to 2026, repeatedly, still absent
  [Lichess-Folders]; the study search misses exact titles and buries
  relevant results under recent ones (jposthuma) [Lichess-Search].
- "No cross-study search"; "64 chapters per Study"; no offline work [Disco].
- No built-in spaced repetition on a study; three separate third-party
  tools exist to add it [Lichess-SR], [Chessdriller].

### 3.3 Opening trainers

- "Reviewing opening lines that never actually get played" — the drilled
  line nobody plays (Solon; the Chessbook review) [Solon-Files],
  [64Squares].
- Chessable: "full coverage means buying several courses"; built for
  consuming author content, not your own tree; no deviation detection;
  MoveTrainer "for memorization: good, for learning: terrible" (thread
  title); free courses turned Pro-only; the board too small
  [DarkSquares], [Chessable-MT], [Trustpilot-Chessable].
- Chessbook: no offline mode; no "how many times I made a particular
  mistake"; move-order flexibility [64Squares]; a free cap a two-colour
  repertoire outgrows [DarkSquares].
- Lichess and Chess.com: no scheduler for a custom two-colour tree, no
  deviation detection, the deeper tools behind premium [DarkSquares].
- The trainers stop at move ten to fifteen; what fails after that is
  calculation, not preparation [DarkSquares].

### 3.4 Platforms' game review

- Labels people distrust: a "Brilliant" on the results screen that the
  review then cannot find — "jank that it flat out lies to you"; accuracy
  computed at different depths by rating, so "impossible to compare"
  [Chess.com-Brilliant], [Chess.com-Wrong].
- A daily free review cap that the labels appear designed to spend
  [Chess.com-Brilliant].

### 3.5 Analytics and "style"

- Wanted: "common opening lines where I performed poorly across thousands
  of games" (theoretical_chaos) — answered by OpeningTree and Lichess
  Insights, both shallow [Lichess-Weak].
- The concern with any tool that profiles a player from their games: it
  profiles opponents too, "for cheating purposes" in classical (mrbasso)
  [Lichess-Weak]. A tool that shows facts from named games is defensible;
  an invented "style" is not.

### 3.6 Coaches

- The stack is "a Zoom link, a Lichess study, a WhatsApp group, a Google
  Sheet, and email drafts"; "Lichess and Chess.com are great for playing,
  not great for managing a class of 15" [Chessido]; coaches want homework
  as templates reused weekly and "which questions a student missed"
  [ChessNexus]. These platforms manage the class; none of them puts the
  student's game and the coach's engine on one board.

### 3.7 Getting the OTB game in

- Typing a scoresheet is "extensive time and labor"; the answers are OCR
  apps (CheSScan, Score Sheet Scanner, ChessTech), camera transcription
  (ChessCam, ChessGaze) and, since 2025, FIDE-approved tablet scoresheets
  [OTB]. Every one of them ends at a PGN file — which is where the study
  tool's job begins and where ChessBase's DGT integration is its only
  real answer.

## 4. What people ask for and do not have — ranked

Ranked by how many independent sources ask for it. "Have" is Kingfisher
today (after Phase 75); "ChessBase" is the incumbent.

| #   | Ask                                                                     | Sources                                     | ChessBase         | Kingfisher                                                                     |
| --- | ----------------------------------------------------------------------- | ------------------------------------------- | ----------------- | ------------------------------------------------------------------------------ |
| 1   | Find a position (and a structure) across **all my own work**            | Solon, Disco, Lichess-Search, ChessMind     | databases only    | **yes** — studies, hand-ins, games, repertoire, files, training; same pawns    |
| 2   | Organise studies: folders, tags, search that works                      | Lichess-Folders, Lichess-Search, Solon      | database keys     | partial — studies/chapters, opening files by subject; no folders               |
| 3   | Spaced repetition on **my own** lines, offline                          | Lichess-SR, Chessdriller, DarkSquares, 64Sq | no                | **yes** — Training queue, repertoire review, offline                           |
| 4   | Deviation detection from my games; "where I left the book, who left it" | DarkSquares, 64Squares, ChessAtlas          | partial           | **yes** — After the round, GameInsights, review queue signal                   |
| 5   | Which of my lines actually get played; personal win/frequency per line  | Solon, ChessMind (Nick), 64Squares, Weak    | no                | **yes** — Played against you; review ordered by it                             |
| 6   | Native Mac, no Parallels, no Rosetta                                    | Chess.com-Mac, Disco, Solon                 | no                | **yes** — arm64, signed, notarised                                             |
| 7   | Stable software that does not crash                                     | Lichess-CB18, Trustpilot-CB, Chessable      | no                | certified per release; seeded walks; zero-skip suites                          |
| 8   | Honest evaluation: no "brilliant", no incomparable accuracy             | Chess.com-Brilliant, ChessMind (Dennis)     | labels            | **yes** — facts with denominators, by rule                                     |
| 9   | Whole-game check with one button, feeding a to-do list                  | ChessMind (Vladimir), Chess.com forums      | Tactical Analysis | **yes** — queue + After the round + review queue                               |
| 10  | Coach ↔ student: homework, hand-in, review, on one board                | Chessido, ChessNexus, Chessr                | worksheets        | **yes** — Team hub; no cloud delivery                                          |
| 11  | Own data, exportable, no lock-in                                        | 64Squares, Solon, Trustpilot-CB             | proprietary CBH   | **yes** — PGN, JSON backup; CBH read-only via HIARCS not us                    |
| 12  | Reads ChessBase files (CBH/CBV/CTG)                                     | Disco, Chess.com-Mac                        | native            | **no**                                                                         |
| 13  | A large annotated master database                                       | Disco, Chess.com-Mac                        | Mega Database     | **no** — packs are aggregates; annotated corpora are a licensing question      |
| 14  | Getting the OTB game in (scoresheet, DGT, camera)                       | OTB                                         | DGT               | PGN import, paste, drop; no capture                                            |
| 15  | Duplicate removal, dynamic ECO, auto-flip to my colour                  | ChessMind                                   | partial           | duplicates by fingerprint; own classification; orientation from linked account |
| 16  | Cloud engines / remote compute                                          | Watson (ducats)                             | yes               | no — companion is local only                                                   |
| 17  | Opponent profile without "style" invention                              | Lichess-Weak, Aimchess                      | Style Report      | **yes** — dossier of facts, falsifiable                                        |
| 18  | Time management from my games                                           | Aimchess                                    | no                | **yes** — After the round clock section                                        |
| 19  | Publishing: print, web, PDF, share a link                               | Watson, ChessBase-Coaches                   | yes               | print of reports; no publish                                                   |
| 20  | Mobile                                                                  | 64Squares, Watson                           | app               | web at phone width; no native app                                              |

## 5. What this says about the strategy

**The complaints about ChessBase are not about missing chess.** They are
about crashes, an interface nobody can learn, a platform half the players
do not own, a price with a subscription behind it, and support that does
not answer. Kingfisher's position on each is structural, not a feature:
the certification harness, one workspace frame, a native Mac and the web,
no account, one download. Those should be _said_, on the landing, in
those words, because the people who search for "ChessBase alternative"
are searching for exactly them.

**The complaints about everything else are about silos.** Studies you
cannot search, a trainer that does not know your games, a review that does
not know your repertoire, a coach with five apps. Everything a player
makes in Kingfisher is keyed by position and lives in one store, which is
why items 1, 3, 4, 5, 9 and 10 in the table above were possible in one
phase. That is the moat. Every further feature should add to it (one more
store searchable, one more fact joined) rather than beside it.

**The trainers' honest weakness is our honest weakness too.** Preparation
stops at move fifteen; after that it is calculation. Kingfisher has
Calculation and Training; neither is yet a daily habit the way a tactics
trainer is. That is a later leap, not a parity item.

**What must be true before anyone at 2200 relies on it:** the OTB game
must get in without typing (14), the file they already own must open
(12), and the reference must be deep enough to trust (13). Those three are
the parity work, and they are ranked in §6.

## 6. Plan

### Now — done in Phase 75

After the round, the round journal, Played against you with the review
ordered by it, and search across studies and hand-ins with structure hits.
See `features.md`.

### Next — closing the gap with ChessBase, in order

1. **Read ChessBase files.** CBH/CBV import (read-only, never write): the
   file every club player and coach already has. HIARCS reads them; it is
   documented enough to do. Provenance recorded; the source named.
2. **Getting the game in.** Scoresheet photo → PGN (the OCR apps exist;
   the honest version says "check these six moves" and shows them on the
   board) and DGT PGN drop. Every After-the-round starts here.
3. **A deeper reference and an annotated corpus.** More packs is data
   work; an annotated master corpus is a licensing decision
   (`docs/data/historical-games-audit.md`). Say what we have and do not.
4. **Studies you can organise.** Folders or tags on studies and chapters,
   and the search that already exists surfaced as a page, not only a
   palette.
5. **Whole-game auto-annotation as facts.** Tactical Analysis's useful
   part: every critical moment written into the tree as a variation with
   its evidence line, never as prose. The queue and the suggester already
   compute it; this writes it down.
6. **Publishing.** A chapter or a report as a PDF and as a self-contained
   HTML file; a study shared as a link once a delivery exists.
7. **Similar games and structure search as a page**, over packs too.
8. **Duplicate review, dynamic ECO in the tree, board orientation from the
   profile** — the small ChessMind items, cheap and daily.
9. **Windows.** The shell is Electron; the companion builds there; what is
   missing is the harness and the signing.

### Later — leading

Overnight tree deepening with a morning report; the surprise finder
(repertoire × opponent × where the population leaves theory); a remote
companion on your own machine; academy export with an explicit audience;
the structured tournament brief; rehearsal with spaced repetition on the
game-day sheet. Each is designed in `docs/design/` before it is built.

## Sources

- [Lichess-CB18] "Chessbase 18 disappointment", lichess.org forum —
  <https://lichess.org/forum/general-chess-discussion/chessbase-18-disappointment>
- [Trustpilot-CB] ChessBase reviews, Trustpilot (2.0/5, 15 reviews) —
  <https://www.trustpilot.com/review/chessbase.com>
- [Watson] John Watson, "ChessBase 18 – Upgrade or stand pat?", Chess Life via ChessBase —
  <https://en.chessbase.com/post/john-watson-chessbase-18-review-chess-life>
- [CB18-Overview] "A quick and complete review and overview of ChessBase 18" —
  <https://en.chessbase.com/post/a-quick-and-complete-review-and-overview-of-chessbase-18>
- [ChessMind] "Alternatives to ChessBase?", The Chess Mind, with comments —
  <https://thechessmind.substack.com/p/alternatives-to-chessbase/comments>
- [Solon-Files] Nate Solon, "How I store my opening files" —
  <https://www.zwischenzug.gg/p/how-i-store-my-opening-files>
- [Solon-Remember] Nate Solon, "How to remember your openings" —
  <https://zwischenzug.substack.com/p/how-to-remember-your-openings>
- [64Squares] "Chessbook review", 64 Squares —
  <https://64squares.substack.com/p/chessbook-review>
- [DarkSquares] "The Best Chess Opening Trainers in 2026, Compared" —
  <https://darksquares.net/blog/chess-training-apps/best-chess-opening-trainers-2026-compared>
- [Disco] "The 7 Best ChessBase Alternatives for Mac in 2026", Disco Chess —
  <https://www.discochess.com/blog/comparisons/chessbase-alternatives-for-mac-2026>
- [Chess.com-Mac] "Chessbase alternatives for mac?", chess.com forum —
  <https://www.chess.com/forum/view/general/chessbase-alternatives-for-mac>
- [Lichess-Search] "Lichess Studies Search Function", lichess.org feedback —
  <https://lichess.org/forum/lichess-feedback/lichess-studies-search-function>
- [Lichess-Folders] "Feature request: Introduce 'Folders' to organise studies" and its siblings —
  <https://lichess.org/forum/lichess-feedback/feature-request-introduce-folders-to-organise-studies>,
  <https://lichess.org/forum/lichess-feedback/feature-request-folders-for-organizing-studies>,
  <https://lichess.org/forum/lichess-feedback/feature-request-study-folders>
- [Lichess-SR] "Spaced repetition for Lichess studies – a free tool I made" —
  <https://lichess.org/forum/general-chess-discussion/spaced-repetition-for-lichess-studies-a-free-tool-i-made>;
  "Future Request: Training studies with spaced repetition" —
  <https://lichess.org/forum/lichess-feedback/future-request-training-studies-with-spaced-repetition>
- [Chessdriller] Chessdriller, open-source spaced repetition for openings —
  <https://chessdriller.org/>
- [Chessable-MT] "MoveTrainer for memorization: good, for LEARNING: terrible", Chessable discussion —
  <https://www.chessable.com/discussion/thread/828448/movetrainer-for-memorization-good-for-learning-terrible/828556/>
- [Trustpilot-Chessable] Chessable reviews, Trustpilot (2.5/5, 10 reviews) —
  <https://ca.trustpilot.com/review/www.chessable.com>
- [Chess.com-Brilliant] "Why is the end game screen misleading about the amount of great and brilliant moves?" —
  <https://www.chess.com/forum/view/site-feedback/why-is-the-end-game-screen-misleading-about-the-amount-of-great-and-brilliant-moves>
- [Chess.com-Wrong] "Wrongly given brilliant in game review" —
  <https://www.chess.com/forum/view/help-support/wrongly-given-brilliant-in-game-review>
- [Lichess-Weak] "how do I analyse my opening weaknesses?", lichess.org —
  <https://lichess.org/forum/game-analysis/how-do-i-analyse-my-opening-weaknesses>
- [Aimchess] Aimchess review, The Chess Advisor —
  <https://thechessadvisor.com/website-review/aimchess/>
- [Chessido] "Chess Academy Management Software: What to Look for in 2026" —
  <https://www.chessido.com/blog/chess-academy-management-software/>
- [ChessNexus] "Chess Coaching Questions — How to Manage, Teach & Track Students" —
  <https://www.chessnexus.in/chess-coaching-questions>
- [Chessr] "Chessr vs ChessBase" —
  <https://www.chessr.io/blog/chessr-vs-chessbase-comparison>
- [ChessBase-Coaches] "ChessBase for Coaches: Creating a Worksheet" —
  <https://en.chessbase.com/post/chessbase-for-coaches-creating-a-worksheet>
- [EnCroissant] En Croissant, "Issues and features" (#11) —
  <https://github.com/franciscoBSalgueiro/en-croissant/issues/11>
- [OTB] "Digitize OTB Games with ChessCam" — <https://lichess.org/@/BlindfoldBlunderer/blog/digitize-otb-games-with-chesscam/6qtmsoNA>;
  ChessGaze — <https://chessgaze.com/record-otb-chess-games.html>;
  "Digitization of Handwritten Chess Scoresheets with a BiLSTM Network" — <https://doi.org/10.3390/jimaging8020031>;
  Tornelo, "Arbiter tokens, scoresheet app and certificates" — <https://tornelo.com/arbiter-tokens-scoresheet-app-and-certificates/>
- [Prep] "How to Prepare for a Chess Tournament", Chess Chatter — <https://chesschatter.substack.com/p/how-to-prepare-for-a-chess-tournament>;
  "Tournament Preparation: Complete Guide", TheChessWorld — <https://thechessworld.com/articles/training-techniques/tournament-preparation-complete-guide/>
