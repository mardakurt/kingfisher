# Every feature of Kingfisher

The complete inventory of what Kingfisher does, as of 1.2.5 and the Team hub (2026-09-20),
written from the code rather than from memory: the routes in
`src/features/shell/navigation.ts`, the tools in
`src/features/workspace/modules.ts`, the commands in
`src/features/command/useCommands.ts`, the shortcuts in
`src/features/command/shortcuts.ts`, the settings in
`src/features/shell/settings-index.ts` and their contract in
`settings-contract.ts`, the engines in `src/engine/registry.ts`, the sources
in `src/reference/`, and the desktop shell in `desktop/src/`. If a feature is
not here, it is not in the product; if it is here and not in the product,
that is a defect in this document and `docs:check`'s owner should hear.

Kingfisher is a local-first chess research workstation for strong players. It
runs as a web application at <https://kingfisherchess.app/analysis> and as a
signed, notarised macOS application; the two are one source and one build.
There is no account, no cookie and no subscription; everything you author
lives in your browser (IndexedDB and `localStorage`) or, on the Mac, in
`~/Library/Application Support/kingfisher-desktop/`.

---

## 1. The workspace: one board, one frame, three regions

Every board route is the same environment (`WorkspaceFrame`) with a different
starting point:

- **The board** (`CanonicalBoardSurface`) — one renderer for every surface,
  with legal-move hints, drag or click-click moves, promotion choice, last-move
  and check highlights, piece animation that keeps identity across a move
  (including the castling rook and a promoted pawn), coordinates inside,
  outside or off, and a flip (`F`) that snaps with a short fade.
- **Annotations on the board** — right-drag draws an arrow (green; ⇧ red, ⌥
  blue, ⇧⌥ yellow), right-click highlights a square, drawing the same shape
  again erases it, and every shape survives a PGN round trip as `[%cal]` /
  `[%csl]` comment commands. A colour-blind palette (Okabe–Ito) is a
  setting.
- **The evaluation bar** beside the board — winning chances from the engine's
  score (the logistic curve, not linear centipawns), a checkmate fills the
  winner's band and a draw sits at the middle, and between moves the bar
  keeps the last reading dimmed rather than dropping to 50 %.
- **The evaluation graph** under the board (off by default) — a column per
  move for stored evaluations.
- **The position summary** under the board — side to move, move number,
  ECO code and opening name, orientation.
- **Board controls** — start, back, forward, end, flip, and _Clear the move
  tree — back to the starting position_ (the tree goes, the board returns to
  the initial position or the FEN that was set up; undoable).
- **Three regions**: the board column (_primary_), the resizable **dock** on
  the right with a tab strip, and the resizable **lower panel** under the
  board (home of the Move Tree). Tools can be moved between the regions they
  allow; the dock collapses; the route's own list (the _rail_ — chapters,
  repertoires, the review queue, the training queue, the endgame library,
  opening files) folds to a strip.
- **The tab strip** shows the route's context panel, the pinned tools and
  the active one; everything else is behind _More_. It measures itself and
  fits one row, folding what does not fit and dropping icons before it folds
  tabs; pinned tools are per workspace.
- **The header** carries the route's actions, which fold into a "⋯" menu
  when the header is narrow (short labels first, then folding from the least
  important), and the four controls every route has: **Position** (the
  position-action menu), **Set up**, **Search commands** (⌘K), the theme
  toggle and **Settings** (⌘,).
- **Layouts**: eight presets — _Analysis_, _Opening Research_, _Study_,
  _Preparation_, _Calculation_, _Review_, _Endgame_, _Minimal_ — plus saved,
  named layouts of your own (arrangement only, never the document), stored
  per device class (desktop / compact at 1100 px), with _Reset_ removing the
  stored entry and _Reset all layouts_ in Diagnostics.
- **Board priority** — a policy (not a pixel count) for how much of the
  workspace the board takes, honoured until you rearrange.
- **Focus mode** — board, tree and one tool; **Compact density** — less
  chrome, same text size.
- **Position setup** (_Set up_) — place pieces by click or drag, choose side
  to move, castling rights, en passant and move counters, load a FEN, and
  see **Known position?** — where that exact position already is in your
  work (games with the ply, study chapters at the move — variations
  included — team hand-ins, repertoire, training, endgames, opening files,
  preparation, decisions), **Same pawns** — the chapters, hand-ins and
  repertoire positions that hold the same pawn skeleton without the
  position — and how many games the chosen reference has for it. Only legal positions can be applied; a castling
  right without the king and rook in place is refused.
- **`?fen=` in the address** puts that position on any board route.

## 2. Analysis (`/analysis`)

The default route. An analysis is one of three things, and the header says
which: an untitled analysis, a study chapter, or a database game opened as
read-only source material.

- **The move tree** — nested variations, comments before and after a move,
  numeric annotation glyphs (`!` `?` `!!` `??` `!?` `?!` and positional
  glyphs), arrows and highlights per move, stored evaluations, clocks
  (`[%clk]`, `[%emt]`), critical-position marks with a category (opening,
  calculation, strategy, endgame, time trouble). A 20,000-node tree is
  windowed so it stays responsive. Keyboard: ← → move, ↑ ↓ variations, Home
  End, ⇧↑ ⇧↓ promote or demote a variation, ⇧⌘↑ make main line, ⌫ delete
  from here, `C` comment, `!` `?` glyphs, ⌘Z / ⇧⌘Z undo and redo.
- **Move context menu** (right-click or the ⋯ on a move) — annotate,
  comment, reorder, promote, copy the line to here, **copy PGN from here**,
  delete after, delete the variation, clear arrows.
- **New / Import / Export** — New analysis (from the start or any FEN);
  Import PGN or FEN (paste or a file; a multi-game file goes to the game
  database with duplicates skipped and malformed games reported); Export:
  _Copy PGN_, _Copy PGN from this move_ (the game from the current move on,
  with a `[FEN]` tag), _Copy FEN_, _Copy this line (SAN)_, _Copy this line
  (UCI)_; and _Save to study…_, _Add to repertoire…_, _Create training
  position…_, _Mark as model game…_, _Clear the move tree_, _Mark critical_.
- **Autosave** — a draft is written 900 ms after a change (5 s at most), the
  chapter after it; a reload of the same tab restores the draft, a fresh
  launch opens a chessboard and keeps the work behind Recent's _Continue_.
- **Rename** the analysis inline; the title reaches Recent.

### 2.1 Tools available in Analysis (the dock)

`Engine`, `Companion`, `Explorer`, `Theory Book`, `Opening Report`, `Book
Moves`, `Database`, `Repertoire`, `Position Health`, `Transpositions`,
`Theory Radar`, `Calculation`, `Candidates`, `Features`, `Tablebase`, `Play
it out`, `Play From Here`, `Report`, `After the round`, `Notes`, and the
`Move Tree`. Each is described in §6; a tool that cannot help says why
instead of disappearing.

## 3. Study, prepare, improve, data — the other routes

### Recent (`/recent`)

_Continue_ (the last thing on the board, when you were doing it), pinned
studies, repertoires and games (up to twelve pins), recently opened
documents.

### Openings (`/openings`)

Two modes, remembered: the **Library** — every one of the 3,810 named
openings of the CC0 lichess-org/chess-openings dataset, searchable by ECO
code, name, nickname, move sequence or FEN, replayed through Kingfisher's own
rules code and keyed by position (transpositions converge; the deepest name
wins), with _Also reached by_, the variation brief, _In my games_, model
games and your repertoire's answer, and _Open on the board_; and the
**Explorer** mode — a board with the theory book and the sources beside it,
_New line_.

### Studies (`/studies`)

Tags file studies and chapters under as many subjects as they belong to
(typed, never inferred); the rail filters by them and narrows as you add
more.

Notebooks of chapters. Create, rename, delete, duplicate and reorder
chapters; every chapter is a full annotated tree with autosave, a write
revision (a second tab's stale write is refused and offered as _Reload
latest_ or _Save mine as copy_), a save-state indicator, _Copy study as
PGN_, and the **References** panel: typed links from a chapter to model
games, repertoire positions and training items, created from what is at the
current position.

### Repertoire (`/repertoire`)

Position-keyed repertoires (White or Black): _Add to repertoire_ files the
line on the board (whole line or last move) with a role — _Main_,
_Alternative_, _Candidate_, _Avoid_ — and a note; opponent replies recorded
along a line are _expected_ and do not inflate coverage; transpositions
share one entry. The rail lists positions by depth; the _Coverage_ panel
counts positions with an answer, main moves, alternatives, candidates,
ruled-out moves, expected replies and unresolved continuations in your own
games; **Coverage gaps** against your local games, **Played against you** — every
position with how many of _your_ games (your colour, by your profile
aliases) reached it beside what share of a named pack did, most met first,
or the other way round: **Never reached** in your games and under 0.5% of
the pack, deepest first — and **Coverage against
reference** against the Starter pack or an installed pack, with **Train
these gaps** (one click enrols every gap in a set named for the repertoire
and opens Training on it); _Review repertoire_ (§5); _Export PGN_;
**Position evidence** for the selected position (decisions, notes, the moves
played from it in local games). The dock adds Repertoire Health, Theory
Book, Opening Report, Explorer, Book Moves, Database, Transpositions, Theory
Radar, Engine, Model Games, Features, Notes and Play From Here.

### Preparation (`/preparation`)

Sessions that prepare a **game** — an opponent, a colour, a round, a date —
holding ids of repertoires, studies, opening files, model games and review
items (never copies), an opponent **dossier** from their games (what they
play, what changed between two windows, their move-order fingerprints, each
falsifiable by opening the games), the **game-day sheet** (positions you
chose, each with its line and your reason, readable offline), favourites,
_My games_, a **Sparring** tool that plays the opponent's own replies at
you, and the opening tree as the context panel.

### Players (`/players`)

The player library: everyone with games in the installed packs (11,746
people from the Starter's 13,738 identities once spellings merge), the 106
curated historical figures, and the 8,339 titled players from Wikidata; browse
sets (_Everyone_, _Top 100_, _Top 500_, _World champions_, _Women's
champions_, _Historical_, _With games here_, _Historical index_), search
with diacritics and aliases, and a profile per player — career, recent, as
White, as Black, openings, what changed recently, tendencies as rules with
denominators ("41 of 118", never an adjective), with explicit alias linking
under Settings → Profile.

### Opening Files (`/opening-files`)

One subject and everything stored about it: positions with their lines,
linked repertoires, chapters, model games, training items and review items.

### Team (`/team`)

The hub for a coach and their students, or a player and their seconds:
**assignments** (annotate a game, prepare a line, prepare for an opponent,
positions to solve) set for a member with a brief and a due date; a
**thread** of handovers on each — _Hand in what's on the board_, _Return
with notes_, _Accept_, _Add a note_ — each written once with its author,
time, note, the board as PGN and an evidence line derived from the tree
("1 of 3 positions evaluated · Stockfish 18 Lite, depth 27", or "no engine
evaluations recorded"); a rail in three columns, _To do_, _Handed in_,
_Accepted_, with a dot and a count for what is **new since you last
looked**; _Open on board_ (asking first when it would replace unsaved
moves) and _Copy PGN_ on any handover; the action box pinned under the
thread; an **opponent** assignment names the person and your colour and
opens their dossier in Preparation; _Position → Hand in to the team…_ from
any board route; a search that settles on this board is kept in the tree,
as on Analysis. Members carry a role (coach, second, player, student) that
orders the buttons and enforces nothing; _That's me_ is asked in place. The
team travels as a **packet** file (_Share packet_, _Receive packet…_, or
drop it on the route): every board in it is replayed through Kingfisher's
rules before anything is written, threads merge by union of their
handovers, the newer copy sets the assignment whole, and receiving the
same packet twice changes nothing. Which team and thread were open are
remembered on the device. No server, no account; `docs/design/team-hub.md`
has the research and the decisions.

### Review (`/review`)

Self-analysis with the evidence withheld until you commit: a **decision
record** — candidate moves entered on the board, an evaluation band (and an
optional number), a plan, calculation notes, the move you would play — then
_Reveal_, after which the record is frozen and only themes and notes can be
added. The **review queue** carries positions with the fact that produced
them (an evaluation swing, a change of top move, a MultiPV separation, a
repertoire deviation, a tablebase result change — never "blunder"), with
_Waiting / Reviewed / Training_ stages and category filters; the
**Improvement** view counts by theme (a starting taxonomy of twelve —
calculation, missed tactic, candidate generation, piece placement, trade
decision, pawn break, king safety, opening knowledge, time management,
endgame technique, evaluation error, plan selection — plus your own) and
every count opens the positions behind it; **Patterns**; **Rounds** — the
round journal: one learning point per game you played, in your words,
grouped by event, each opening its game; _Mark for review_ from any board; _Hidden / Visible_ evidence toggle; a game review that
walks a whole game and attaches strategic transitions (a passed pawn
created, a file opened, a king shield stripped) as facts.

### Training (`/training`)

A spaced-repetition queue of positions you author or Kingfisher offers:
five prompt modes — _Repertoire recall_, _Best move_, _Candidates_,
_Evaluate_ (a band), _Plan_ (prose, graded by you) — answered on the board
with legal-move hints withheld; the answer is checked against what the
author recorded (correct / partial / incorrect / unchecked) and says where it
came from (you, the engine, the repertoire); _Show answer_; grading advances
a deterministic schedule and appends to an immutable review history;
**Training sets** (static membership, or a repertoire review's selection);
_Create position_ from any board; the dock's tools stay locked until the
answer is revealed.

### Endgame (`/endgame`)

A library of endgames you save by category — rook, queen, minor-piece, pawn,
fortress, technical conversion, defensive study — with a goal (_Convert the
win_, _Hold the draw_, _Find the tablebase move_, _Study_); **Play it out**
against the engine as tablebase-perfect, strong, or club strength, with the
tablebase as referee after every move ("The tablebase result changed from
Win to Draw on this move" — never "you blundered"), ending on mate,
stalemate, the fifty-move rule or the starting result being gone.

### Games (`/games`)

Your game database: import PGN (a 20,000-game file parses in a Worker,
stays responsive, can be backgrounded and cancelled), search by player,
event, opening, year, result, filter and sort with pages that continue each
other, open a game on the board, the analysis queue (background engine
analysis of chosen games, paused, resumed and yielding to interactive
analysis), Kingfisher's own opening classification beside the PGN's tag, and
delete.

### Writing the engine's evidence into a game

_After the round_ → Engine, once the background queue has analysed the game.
Every move the engine disagreed with becomes a variation from the position
before it, carrying the engine's own line and one comment: the score before,
the score after, the depth, and which engine. Nothing else — no "blunder",
no "!?", no NAG, because those are labels pinned to a number. The threshold
(3, 10 or 20 points of win chance) is yours, the panel states what a run
would write before it writes it, and one undo takes the whole write back.
Positions the queue never reached produce nothing, which is different from
the engine having found nothing.

### Search (`/search`)

One box over everything you have made or imported: a FEN, a line of moves,
or a name. The page says which way it read what you typed, groups the
results by kind with a count each, adds the same-pawns group for a
position, and opens every hit where it was found — the same openers the
command palette uses. The query lives in `?q=`, so a search can be linked,
reloaded and walked back through. Reference packs and the explorer are not
searched here, and it says so: they answer about a population, this answers
about you.

### Coverage (a dock tool, wherever the Explorer is)

What every source you have holds and does not hold, for the position on the
board, from each source's own manifest: games aggregated, how many can be
opened in full, the months it was built from, its origin, and the depth past
which it aggregated nothing. Sources are never merged. Past a source's depth
the Explorer says so instead of "no games reach this position" — a pack that
stopped at move 21 cannot be read as evidence that a move 30 position has
never been played. The panel also states what Kingfisher does not ship: no
games before 2020, and no annotated master corpus
(`docs/data/historical-games-audit.md`).

### Scoresheet (`/scoresheet`)

The over-the-board game, from the sheet to the board. Type each cell as it
was written — `Nf3`, `Sf3`, `Cf3`, `0-0`, `ed`, `e8Q`, a missing `x` — and
the rules resolve it: one reading is the move, several is a move with the
alternatives kept, none stops there and says so. A cell nobody can read is
`?`: the moves after it are fitted against every legal move at the gap, and
the one that fits fills it (or the candidates are offered, and it says how
many). **Check these moves** lists every doubtful move with why, shows the
alternatives on the board, and replaces one when you choose it. With an
assistant endpoint configured (Settings → Assistant, your own endpoint and
key — none ships), _Read the sheet_ sends a photo and resolves what comes
back the same way, flagging everything the model was unsure of; without one,
the photo sits beside the board while you type. Saves to _My games_, or
saves and opens _After the round_. Kingfisher does not read handwriting; it
checks a reading against the rules and says where it could not.
`docs/design/scoresheet.md`.

### Databases (`/databases`)

Collections (the browser's IndexedDB collection, any SQLite collection
behind the companion, En Croissant databases read but never written),
**Import ChessBase** (a `.cbh` database chosen as its files, or a `.cbv`
archive, read in the browser — moves, variations, set-up positions,
comments, symbols, squares, arrows and clocks — into _My games_ or a new
companion collection, every game tagged with its source, annotator and
file; what the PGN cannot hold is counted, never dropped silently; the
files are never written),
**Copy to… / Move to… / Merge into…** with pages, progress and cancel (a
move never deletes what the destination has not confirmed), _Import PGN_ /
_Export PGN_ per collection, **Duplicates** (byte-identical copies removable;
same game annotated differently shown and never resolved for you),
**Search across collections** (a game in two collections appears once for
each), **Source sets**, **Reference sources** (the catalogue of packs with
licence, provenance, size and a switch per capability), _Set as reference_,
storage facts, structure and claim indexing, classification backfill, and
per-source health with a remedy.

### Model game (`/model-game`)

Guess-the-move through a model game with the engine off, with Theory Book,
Opening Report, Notes, Repertoire, Model Games, Features, Explorer, Book
Moves, Database, Engine and Play From Here beside it.

### Player (`/player/[id]`)

The profile described under Players.

## 4. Engines

- **Browser engines**: Stockfish 18 (WebAssembly, small network, ~7 MB,
  multi-threaded where the page is cross-origin isolated, single-threaded
  otherwise) on every deployment; **Stockfish 18 (full network)** on the web
  (113 MB fetched from its recorded address with a pinned SHA-256, kept by
  the browser).
- **Native engines through the companion** (built into the Mac
  application; paired by one command in a checkout): Lc0, Stormphrax 8,
  Stockfish 19 (native), Viridithas 20, Halogen 16, PlentyChess 8 on macOS;
  Berserk 14, Koivisto 9.0 and Obsidian 16.0 where their projects publish a
  build (Windows; Koivisto also Linux). Each is downloaded from its own
  release page, checked against a recorded digest, made to complete a real
  handshake and search before it is registered, and its capabilities
  (MultiPV, `searchmoves`, WDL, Syzygy) are measured rather than assumed.
  **Any UCI engine** can be registered by path.
- **The engine panel**: one or two engines (the second follows the board
  only while comparing; threads and hash are split), MultiPV 1–5 with a
  line per candidate (score, moves as clickable SAN — add the line up to a
  move — a PV preview mini-board), _Pin best_ (up to eight pinned lines held
  still while the search moves on), _Save this evaluation to the current
  move_, _Analyse this position_ / _Stop_, the best-move arrow (and
  **variation arrows**, fainter by rank), a footer with nodes, n/s, hash
  fill, tablebase hits, time, **score by depth** (a strip with a hollow point
  where the top move changed), top-move stability, top-move changes, score
  swing, the MultiPV gap and near-equal candidates. A checkmated or drawn
  position says so and offers no search. Every result carries session,
  position and engine identity; a stale result never lands on a new
  position; an engine that fails to acknowledge a stop is failed, not
  reused.
- **Candidates** — restrict the search to moves you name (`searchmoves`),
  offered only for engines measured to honour it, and the result says
  whether it was honoured.
- **Two engines** — top-move agreement, PV agreement in plies, the
  evaluation gap (never subtracting a mate from an evaluation), one table of
  every move either engine ranked.
- **Presets** — _Quick_, _Standard_, _Deep_, _Custom_; **threads**, **hash**,
  **search limit** (until stopped, depth, time, nodes), **line length**,
  **follow the board**, **analyse automatically**, **best-move arrows**,
  **variation arrows** — all in Settings → Engine.
- **Trust** stated at each level: the browser engine is sandboxed by the
  browser; a managed native engine is verified and runs with your own
  operating-system permissions (not sandboxed); a custom one is your own
  program.
- Engines are sent `OwnBook false` at every session and only the options
  they declared.

## 5. Evidence: the four questions, kept apart

- **Theory Book** — the established, named branches at a position from the
  CC0 classification dataset: no counts, no percentages, no evaluations;
  _All openings_ and _Next moves_.
- **Explorer** — what was played, in a population you name: the Starter
  pack (206,451 recent elite broadcast games, on every machine, offline),
  the optional **Elite OTB**, **Recent Theory (2y)**, **Recent Theory (6m)**
  and **High-Rated Online** packs (installed on demand, verified chunk by
  chunk, resumable, all-or-nothing), **Lichess Masters**, **Lichess Rated
  Games** (rating bands and speeds), **Lichess by player** (a username and a
  colour), a **SQLite collection** through the companion, and **My games**
  (your own collection, indexed by position). Per move: games, frequency,
  score, White/draw/Black, average Elo, opening name, whether it is in your
  repertoire; top and model games; _as White / as Black_; a minimum rating
  and a since-year where the source can honour them; the two most-played
  continuations prefetched; a ten-minute cache keyed by source version; and
  **source comparison** — several sources side by side, each with its own
  count and licence, deliberately without a combined figure. A source that
  cannot answer says why (sign in, rate-limited, offline, unsupported)
  rather than loading forever, and the bundled reference is offered.
- **Book Moves** — what a Polyglot `.bin` file weights at a position (your
  own books, added under Settings → Engine → Books, plus a book derived from
  the installed reference), never merged with the explorer.
- **Repertoire** — what _you_ intend to play: the decisions at this
  position, with roles and notes, and a deviation flag when the board has
  left your line.
- **Database** — health and details of every source, from the dock.
- **Tablebase** — Syzygy proof for positions with seven pieces or fewer,
  from local tables through the companion (a folder of `.rtbw`/`.rtbz`,
  the real piece limit derived from the files) or the Lichess service, with
  the reason for the choice printed; used by Play it out and the endgame
  referee.
- **Features** — countable structural facts: isolated, doubled, passed,
  connected passed and backward pawns, islands, open and semi-open files,
  rooks on them, bishop pair, material by piece type, castling, king
  shelter; and **strategic themes** decided by counting (opposite- and
  same-coloured bishops, bishop against knight, the bishop pair, rook
  against a minor piece, queenless middlegame, rook ending, minor-piece
  ending, IQP, hanging pawns, Carlsbad, symmetrical pawns, open central
  file, opposite-side castling, wing majorities), each with its definition
  on screen and a version.
- **Transpositions** — the stored move orders that reach this position, in
  your chapters and games.
- **Theory Radar** — move shares over three date windows in a source.
- **Position Health** (repertoire health) — how well the repertoire answers
  the position and its branches.
- **Model Games** — games tagged as models for this position or opening,
  with guess-the-move.
- **Personal Results** — how you have done from this position.
- **Report** — the **position report**: ten sections (opening, reference
  statistics per source, most frequent moves with the rule that selected
  each, tablebase, repertoire, model games, your games, strategic and
  structural themes, stored engine evidence, your history here), every
  section naming its source or the reason it is empty, printable and
  savable to a study; and the **opening report** (opening and distance to
  the last named position, the variation brief, branches worth the time with
  their reasons, what was played by population, where the pieces go with
  denominators, what the repertoire does not answer).
- **Calculation** — a scratch calculation tree with the evidence hidden
  (`Calculate here`), a blindfold, and submission into the decision
  journal.
- **After the round** — the evening-of-the-game page, from the game on the
  board (Analysis, Games, Review): which side you played (from your
  profile's aliases, or your say-so); where the game left your repertoire
  and _who_ left it; what the clock says — timed moves, the three longest
  thinks, the last reading, the first move under a third of the control
  (the `40/5400+30:1800+30` form is read); the engine's evidence from the
  background queue, with _Queue this game_ when there is none and _Send
  positions to review_ (the same suggester Review uses) when there is;
  and **one thing for tomorrow**, filed in the round journal (Review →
  Rounds). Facts only; the page never grades a move.
- **Notes** — free text on the current move.
- **Play From Here** — play the position out against the engine.
- **Companion** — pairing, status, the engine fleet, tablebase folder.
- **Context** — the route's own panel: chapter References on Studies, the
  Journal on Review, the Opening tree on Preparation, the file on Opening
  Files.

## 6. Repertoire review and training sets

_Review repertoire_ builds a session of prompts from a repertoire — modes
_my move_, _opponent reply_, _full branch_, _critical_ — due only or all,
capped, one prompt per position however many move orders reach it, ordered
by what is actually reached — "reached in 7 of your 40 games", the pack's
share — with every reason on the prompt, enrolled as recall cards in the
one training queue (a second run duplicates nothing), and opens Training on
that set.

## 7. Games from online accounts

Settings → Accounts links a **Lichess** account (OAuth with PKCE, no scopes,
no token to paste; a personal token under Advanced) or a **Chess.com**
username. _Sync_ pulls the account's games into the ordinary collection —
Lichess by an epoch cursor, Chess.com by monthly archive with ETags — with
progress ("Downloading games…", "Importing N of M…", "Indexing…") and
_Cancel_ keeping what landed; a synced game knows which side you played and
the board orients to it; duplicates are skipped by fingerprint; rate limits
and missing accounts are reported as such.

## 8. Search and commands

- **⌘K** — one box for openings (by name, code or moves), players, your
  studies, chapters, games, repertoires, training items, model games and
  tags, every page and every settings section, a pasted **FEN** (with where
  that position appears in your work — study chapters at the move,
  variations included, team hand-ins, games at the ply, and the rest —
  each hit opening where it was found; a second group, **Same pawns**, for
  the work that holds the pawn skeleton without the position; and _Open in
  Analysis / Explorer / Search databases / Add to Study / Add to Repertoire
  / Create training_), and a typed **move sequence**.
- **Commands** (the full list): Back up my work; Open the tour; New
  analysis; Import PGN or FEN; Copy PGN; Copy PGN from this move; Copy FEN;
  Copy the current line (SAN / UCI); Save this analysis to a study; Search
  this position; Open this position in Analysis / Explorer; Comment on this
  move; Move this variation up / down; Make this the main line; Delete this
  variation; Delete everything after this move; Clear the move tree; Insert
  the best engine line; Save the engine evaluation to this move; Clear
  pinned engine lines; Flip the board; Cycle board coordinates; Switch piece
  set; Switch board theme; Toggle the evaluation graph; Switch between dark
  and light; Start / Stop engine analysis; Run two engines; Switch to the
  next engine; Show position structure; Show the tablebase; Ask the
  companion; Cycle engine lines; Show the database explorer; Show the engine
  panel; Show notes; Focus mode; Compact density; Calculate here; Show the
  theory radar; Keyboard shortcuts; Settings; Report a problem; Report a
  data issue; Send feedback; Open support information; Check for Updates…
  (Mac); Install Kingfisher for macOS (web).
- **Keyboard shortcuts** — rebindable, with conflicts reported and Escape
  fixed: ← → ↑ ↓ Home End; `E` engine, `D` explorer, `A` analyse, `M` model
  games, `F` flip, `C` comment, ⇧↑ ⇧↓ variation order, ⌘Z ⇧⌘Z, ⌘K palette,
  `?` shortcuts, ⌘, settings, and the rest in the reference dialog, which
  is also the editor.
- **The position menu** (_Position_) — the same position actions on every
  route.

## 9. Settings (twelve sections, searchable)

- **Appearance** — theme (dark/light), move animation (off/fast/normal,
  reduced-motion wins), arrow colours (standard / colour-blind), compact
  density, skip the landing page (web).
- **Board** — twelve board themes (Slate, Classic Green, Tournament Blue,
  Walnut, Sand, Sage, Graphite, Classic Brown, Maple, Midnight, Ivory, High
  Contrast), coordinates inside/outside/off, evaluation bar, evaluation
  graph.
- **Pieces** — nineteen piece sets, each with its author and licence, drawn
  by one renderer at every size (the Settings preview included).
- **Workspace** — layouts and presets, board priority, pinned tools, reference
  sources and their switches.
- **Engine** — Analysis settings (preset, lines, threads, hash, search limit,
  line length, follow the board, analyse automatically, best-move arrows,
  variation arrows), Engines (install, remove, show or hide in the selector,
  capabilities, checks, digests; engines with no build for your machine are
  named, not listed as switches), Books (add and order Polyglot files).
- **Companion** — pair, status, tablebase folder, custom engines by path.
- **Database** — explorer source, minimum rating, since-year, Lichess token.
- **Accounts** — Lichess sign-in, Chess.com, linked accounts, sync.
- **Keyboard** — every binding, editable.
- **Assistant** — an OpenAI-compatible endpoint, model and key (none ships);
  the assistant is asked to explain an **evidence packet** assembled from
  the sources, shown under every reply, and is never asked what it knows
  about chess.
- **Profile** — your name, aliases (explicitly linked identities), favourite
  players, custom review themes.
- **Diagnostics** — settings transfer (export/import without credentials),
  data providers with _Test_, the engine list, services, an integrity scan
  (finds and repairs only unambiguous dangling pointers), recovery (restart
  engines, reconnect companion, clear provider cache, reset all layouts),
  support information and a full diagnostic report with every secret
  redacted, help and feedback, the tour, changelog and security policy,
  build identity.
- **Backups** — portable JSON of every store that holds authored work (the
  list is asserted against the schema), with or without games; restore by
  merge or replace, validated before anything is written; automatic backups
  on a schedule with retention and a status-bar reminder; pack _metadata_
  travels so a restore can say what to reinstall.

## 10. Data, provenance and honesty

- Every position is one identity (`positionKey`: placement, side, castling,
  usable en passant), whichever door it came in through.
- Every source's numbers carry that source's name and licence; populations
  are never merged; a remote failure never blanks local evidence.
- Opening names come from a licensed dataset and are never invented past
  it; variation briefs are authored, never generated at runtime.
- Historical games require verified redistribution rights; every dataset and
  asset is recorded in `THIRD_PARTY_DATA.md` and `THIRD_PARTY_ASSETS.md`.
- No fictional number reaches a chess judgement; a feature that cannot be
  built honestly is visible and disabled.

## 11. The macOS application

The same Next.js application served by an Electron shell over a loopback
origin whose port belongs to the profile (so your data survives every
relaunch), with the companion built in and owned by the shell (started,
stopped, revived after a crash, taken down with it); native file open for
PGN and databases through dialogs and drag-and-drop; a File menu with _Open
PGN…_, _Open Database…_, _Open Recent_; **Check for Updates…** through
Sparkle (EdDSA-signed appcast, a save barrier before relaunch, the profile
adopted after the update, one quiet information-only look at launch, no
telemetry); Diagnostics in the menu; the window's traffic-light reservation
handled in one place; full-screen; Developer ID signing, Hardened Runtime
and notarisation, verified byte for byte against the published DMG.

## 12. The public web surface

The landing at `/`, the application at `/analysis` (and `/studio`, which
redirects), `/install`, `/privacy`, `/security`, `/data-licences`, `/terms`,
a PWA manifest, `robots.txt` and a sitemap, `security.txt`, in-app feedback
that never sends your studies, and web analytics disclosed on the privacy
page.

## 13. What Kingfisher deliberately does not do

Chess960 (positions it cannot play are refused, not guessed); merging
populations into one statistic; labelling a move "best" or a position
"unclear" from a number; inventing an opponent's "style"; writing into
another program's database; a second board renderer; a cloud account.
