# Kingfisher

A chess research workspace for players who study.

Engine analysis, opening databases, annotation and game trees in one interface,
built for someone who already knows what a Najdorf is and wants better tools —
not a tutorial, not a puzzle streak, and not a wrapper that prints `+0.34` and
calls it analysis.

---

## Status: Phase 11 — a release candidate that says where it got everything

Phase 1 built the workstation, Phase 2 made the work durable, Phase 3 turned the
stored material into preparation, and Phase 4 gave it real engines, real artwork
and real scale.

Phase 5 made those parts one application: the engine, explorer, database,
tablebase, features and companion follow the position between routes through a
shared workspace context and a single tool dock, and every route draws the same
board through one pipeline.

Phase 6 made it something you can leave running for an afternoon. Chapters
carry a write revision, so two tabs cannot silently overwrite each other and a
refused write offers to fork rather than lose. The draft is written before the
chapter, so a failed write no longer takes the session with it, and unsaved
work found on startup is offered back rather than discarded. A data-integrity
scan reports what does not resolve and repairs only what is unambiguous.
Diagnostics produces a report you can paste into a bug thread without leaking a
token. Every gate runs in GitHub Actions, including the browser tests.

Phase 7 is about whether it gets out of the way. The opening explorer answers
an unfiltered question about a 100,000-game SQLite collection in 0.3 ms instead
of 129 ms, from a derived aggregate table the writer maintains transactionally;
filtered questions still read the source rows, because an all-time total cannot
honestly answer "Elo ≥ 2400". PGN parsing moved into a Worker behind an
acknowledged batch pipeline, so importing a hundred thousand games no longer
freezes the tab — you can navigate, move pieces and watch progress while it
runs, background it, and cancel it without losing what already committed.
Repertoire positions and training items now carry revisions like chapters do,
with the same two-choice conflict resolution. A study chapter can link the model
games, repertoire positions and training items it is about, without copying
them. Heavy feature surfaces load when opened rather than at startup, taking
about 7% off every route's initial JavaScript. And a persistent background
analysis queue will work through selected games with one engine, yield
instantly to interactive analysis, survive a restart, and store nothing but
final, factual engine answers — no accuracy score, no move labels.

Phase 8 changes the question from "is it fast" to "does it help you improve".
The answer is a workflow, not a dashboard. In `/review` you open one of your own
games with the engine, the explorer, the tablebase, the repertoire and the model
games **withheld** — visibly withheld, and by your own choice rather than
broken. You record what you actually considered: candidate moves entered on a
board, an evaluation estimate as a band or a number, a plan, what you
calculated. Only then do you reveal. What you wrote before the reveal is frozen
at that moment and can never be edited afterwards, because a "correction" made
after seeing the engine is a record of the engine's judgement wearing your name.
The comparison that follows is called a comparison: the engine is evidence, not
a verdict, and nothing is labelled a blunder, a mistake or brilliant.

Around that sit the pieces that make it compound over months. Critical positions
become a real queue with reasons attached — "suggested because engine evaluation
changed from +0.4 to −1.1" — that you accept, ignore or turn into training, not
a flood. Reviewed positions carry themes you choose, never themes derived from a
score, and the improvement summary counts them and drills into the actual
positions behind every number. Training sets group items by hand or by a saved
query, without copying anything.

Research got two new tools. Structural search asks where else you have had this
pawn structure, from a documented pawn-skeleton key that ignores every piece —
not an embedding, so a result can always explain itself. Preparation priorities
order the moves your repertoire has no answer to, printing every fact they are
ordered by rather than a score nobody can reconstruct.

And the measured limits Phase 7 named are gone. Filtered explorer queries on a
100,000-game SQLite collection dropped from ~132 ms to 0.4–2.7 ms, from exact
year/rating cells rather than buckets — a filter that excludes nothing returns
exactly what the unfiltered explorer returns, and a test says so. SQLite
collections can finally shrink: by selection, by an exact filter, or entirely,
in one transaction with the aggregates rebuilt for exactly what changed. A
20,000-node move tree was profiled before anything was virtualized, then
virtualized because it needed it, keeping nested variations, comments,
connectors and keyboard navigation intact. And an alternative rules engine was
benchmarked at 2.68× and **rejected**, because it bought that speed by
discarding variations, comments and NAGs.

Phase 9 asks whether a titled player could use Kingfisher as their primary
workstation, and builds the parts of a professional week that were missing.

Preparation is now for a _game_ rather than an opening. A session names an
opponent, a colour and a round; the dossier answers what they play, what has
changed recently and which move orders they use, with every figure followed by
the sample it came from and a warning when a window is too thin for its own
percentages. What comes out of hours of work is a curated game-day sheet —
positions you chose, with your reasons — that prints as a self-contained page,
copies as Markdown, and exports as PGN.

Calculation got its own workspace. Start one and the engine, explorer, database,
tablebase and repertoire are withheld; you enter the lines you actually look at
on a board that _advances_, so 1...Rd8 2.Qe2 walks the variation the way you
calculate it. The tree keeps its shape, because where your analysis forked and
which fork you never looked at is the useful part afterwards. Blindfold is a
control in the same panel, not a separate mode. On submission it becomes the
same frozen decision record self-analysis writes, so it feeds the same journal.

The journal now pays off. Two questions, both counts, both drillable: how far
your estimates sit from the evidence, and how often the engine's eventual first
choice was on your list. Reviewed positions can be scheduled to come back, using
the spaced repetition training already runs on — with a separate schedule,
because recalling a move says nothing about being able to rebuild the plan
behind it.

The repertoire shows its transpositions: every prepared move order that reaches
a decision, and the sentence that matters — editing it through any route changes
every route. Opening files gather the repertoire positions, chapters, model games
and training that belong to one subject. Model games can be worked through in
guess-the-move, which asks what the _player_ played rather than what the engine
prefers, and reports a difference rather than a mistake. There is an endgame lab
with a position library and local Syzygy through the companion, which reads your
tablebase directory to say exactly what it can answer and prints where every
proof came from.

And it got faster to drive. Position actions have one definition behind the
menu, the palette and the keyboard; a research trail says _where_ it goes back to
and restores the position; focus mode strips the chrome; a pasted FEN finds every
place that position is stored.

On the measurement side, Phase 8's import regression is a third smaller, an old
collection can be given its structural index in place without re-importing a
game, and the transposition graph went from 1,119 ms to 53 ms once it was
measured on a repertoire big enough to matter.

Phase 11 treats the whole thing as a release candidate, and spends most of its
effort trying to break ten phases of accumulated work rather than adding to it.

The data-safety work is the part that matters. Every historical schema version
now has a fixture that seeds a database the way a real installation at that
version would have, migrates it forward through the real upgrade path, and
checks the result for semantic equality — chapter trees, comments and variations
byte-identical, player keys backfilled without disturbing the fields beside
them, references and background jobs still resolving through their indexes. A
corrupted workspace layout can no longer take a route down: anything unknown,
absurd or NaN is dropped at load, and if rendering fails anyway the error screen
offers **Restore default workspace** without requiring you to reach Settings —
which was previously the only place that control existed.

Randomized testing arrived for the parts where hand-written fixtures only cover
what someone thought of. Sixteen fixed seeds generate legal games biased toward
captures, castling, en passant and promotion, branch variations off them, and
assert properties that must hold for any legal game: the tree stays
well-formed, every move is legal from its parent, PGN round-trips to the same
set of lines, replaying a move reuses its node rather than duplicating it, and
promoting or deleting a variation never leaves a malformed tree. Curated
SetUp/FEN fixtures cover castling both sides, all four promotion pieces,
checkmate, stalemate and threefold repetition, which random play reaches too
rarely to rely on.

And the release gate got stricter rather than kinder. Browser tests now run at
**zero retries**: a test that only passes on its second attempt is a bug, and a
gate that quietly re-runs it hides that bug instead of failing on it. Retries
still exist in a separate, manually-triggered, non-gating workflow, for telling
a flaky test apart from a broken one.

Three workflow gaps closed alongside that. **Any UCI engine** can now be
registered by path through the companion — validated as a real executable, then
made to complete a full `uci`/`uciok`/`isready`/`readyok` handshake before it is
trusted with a key, so a mistyped path is refused at registration rather than
during analysis. **Lichess and Chess.com accounts** can be linked by username
and their games pulled into the ordinary local collection: no Kingfisher
account, nothing uploaded, incremental against each API's real cursor, and
duplicate-free because a synced game goes through the same import pipeline and
the same fingerprint index as a pasted one. And a **position report** answers
"what do I know about this position" in one click, with every section naming its
source and no move ever labelled best — a highlighted move carries the rule that
selected it, with the sample threshold written into the label.

Where Kingfisher still trails ChessBase, En Croissant and ChessMonitor is
recorded honestly in
[`docs/product/pro-workstation-gap-analysis.md`](docs/product/pro-workstation-gap-analysis.md),
including the four gaps Phase 11 did not close.

Every number in those paragraphs is measured, reproducible and recorded with its
before-figure in
[`docs/performance/phase-9-preparation-and-scale.md`](docs/performance/phase-9-preparation-and-scale.md),
[`docs/performance/phase-8-study-and-research.md`](docs/performance/phase-8-study-and-research.md)
and
[`docs/performance/phase-7-speed-and-scale.md`](docs/performance/phase-7-speed-and-scale.md).

Everything is stored in your browser. There is no account, no cloud and no
sync, and the application works with the network off. An **optional** local
companion adds native engines and SQLite collections, the two native
capabilities shipped in Phase 4, and nothing depends on it. Tablebase evidence
currently comes from the separate Lichess Syzygy provider.

**Working today**

| Area                 | What you can do                                                                                                                                                                                                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Board                | Drag or click to move, promotion picker, flip, eight board themes, five selectable open-source vector piece sets plus an internal recovery set, coordinates, move animation                                                                                                                         |
| Game tree            | Nested variations, promote / promote-to-main-line, delete, truncate, undo & redo, keyboard navigation                                                                                                                                                                                               |
| Annotation           | Comments, NAG glyphs, arrows and square highlights (right-drag), all surviving a PGN round trip                                                                                                                                                                                                     |
| Engines              | Stockfish 17.1 in a Worker; Lc0 and Stormphrax as native processes through the companion. MultiPV 1–5, live depth / nodes / nps, evaluation bar, stability and line-separation metrics, click any move to insert the line                                                                           |
| Two engines          | Run any two on one position and see where they agree, how far their lines run together, and how far apart their evaluations are. No combined score                                                                                                                                                  |
| Tablebases           | Syzygy through lichess.org for any position of seven pieces or fewer: category, DTZ, DTM and the winning moves, kept in its own vocabulary rather than converted to centipawns                                                                                                                      |
| Structure            | Counted, not judged: pawn islands, isolated, doubled, passed, connected passed and backward pawns, open and semi-open files, rooks on them, the bishop pair, material imbalance, castling and king shelter                                                                                          |
| Companion (AI)       | Optional. Answers from an evidence packet the app builds — engine lines, database counts, your repertoire, the structure — and shows you the packet                                                                                                                                                 |
| Move editing         | Right-click any move for comments, glyphs, variation reordering, "make this the main line", targeted deletion and copy                                                                                                                                                                              |
| Marking              | Mark a position critical — opening, calculation, strategy, endgame or time trouble — and take it straight to a training item                                                                                                                                                                        |
| Studies              | Notebooks of ordered chapters — create, rename, reorder, duplicate, delete; autosaved as you work; export a chapter or a whole study as PGN                                                                                                                                                         |
| Games                | Import cancellable multi-game PGNs, paged indexed search, filters, sortable columns, bulk delete, model-game tags, and personal-game evidence                                                                                                                                                       |
| Explorer             | Every kind of evidence for one position side by side: frequency, score, average Elo, recent-theory comparison, engine rank, repertoire role, your own results. Sources are never mixed, and there is no combined score                                                                              |
| Databases            | IndexedDB for everyday collections; optional SQLite through the companion, measured at 100,000 games. Both use the same fingerprints and canonical position keys. SQLite collections can be pruned by selection or exact filter, emptied, or deleted — transactionally, with the aggregates rebuilt |
| Openings             | One board-led workspace combining local database moves, repertoire choices, personal results, engine evidence, and model games                                                                                                                                                                      |
| Repertoire           | White/Black repertoires keyed by canonical position, editable move roles and notes, explicit opponent replies, coverage counts, local evidence, gap detection, and PGN export                                                                                                                       |
| Preparation          | Exact-player reports with side/date/rating/ECO/result filters, profile facts, transposition-aware trees with frequency, score, average Elo and recency, prepared-vs-gap comparison, and a "My games" view of your own                                                                               |
| Training             | Answer on the board or by band: repertoire recall, best move, candidate moves, evaluation bands, and plans, each checked against what you recorded; due/new/learning/mature queues with deterministic SRS                                                                                           |
| Backup               | Versioned JSON export; authored-work or full-game backup; validated transactional merge and replace                                                                                                                                                                                                 |
| Background work      | Queue games for analysis with one background engine: quick / standard / deep / custom presets, every move or after move N, pause, resume, cancel, retry failed, resumable across a restart. Stores engine, score, depth, nodes, time and PV — never a move label                                    |
| References           | A chapter can link the model games, repertoire positions and training items it is about. Clicking one opens it; a deleted target reads "Missing reference" and the integrity scan offers to drop it                                                                                                 |
| Saved filters        | Name a database filter set and get it back from a menu; recently used filter sets are remembered and named after what they select                                                                                                                                                                   |
| Storage              | Estimated IndexedDB usage against the browser quota, SQLite collection sizes on disk, and counts of games, studies and training items. Estimates are called estimates, and nothing is ever deleted for you                                                                                          |
| Search               | `⌘K` searches actions plus studies, chapters, games, players, repertoires, training items, model games, tags, decision records, critical positions, themes and training sets                                                                                                                        |
| Import / export      | PGN and FEN in (format auto-detected) from a paste or a file, parsed in a Worker so the tab stays usable, backgroundable, cancellable without losing committed games; PGN, FEN, SAN and UCI out                                                                                                     |
| Workspaces           | The same board and the same research tools in Analysis, Studies, Openings, Repertoire, Preparation and Training. Layout presets, a resizable dock, and the last tool remembered per route                                                                                                           |
| Data sources         | `/databases` lists every provider with a real status — ready, authentication required, companion offline, rate limited, misconfigured — plus capabilities, game counts, measured latency and a connection test that validates the response, not just the transport                                  |
| Lichess              | Masters, the Lichess database and the player explorer over `explorer.lichess.org`, connected with your own scope-free token. `401`, `403`, `404`, `429`, `5xx`, timeouts and schema changes each say what actually happened                                                                         |
| Self-analysis        | Hide every computer source, record candidates on the board, an evaluation estimate, a plan and what you calculated, then reveal. Pre-reveal answers freeze permanently; the reveal compares, it never grades                                                                                        |
| Review queue         | Critical marks become a filterable inbox — unreviewed, reviewed, converted to training — plus candidates the background engine suggests from stated facts: an evaluation swing, a change of top move, a repertoire deviation, a tablebase result change                                             |
| Themes               | A starting taxonomy plus your own tags, assigned by hand and never derived from an engine score. The improvement summary counts them over 30/90 days or all time, and every count opens the positions behind it                                                                                     |
| Training sets        | Group training items by hand, or by a saved query (theme, source, window). A set is membership, never a copy, so an item cannot drift out of sync with itself                                                                                                                                       |
| Structure search     | Find the same pawn skeleton, the same structural signature, the exact position, or chosen facts — from documented, versioned, indexed keys rather than an embedding. Results state which kind of match they are                                                                                     |
| Model games          | Discover them by exact position, pawn skeleton, opening or structural facts; sort by Elo, recency or closeness of match; step through one in a study mode with the engine off by default                                                                                                            |
| Prep priorities      | The opponent moves your repertoire has no answer to, ordered by missing answer, rising recent frequency, then frequency — with every one of those facts, the model games, the training items and the last review printed on the row. No blended score                                               |
| Preparation sessions | One opponent, one colour, one round. References your repertoires, studies, opening files and model games rather than copying them, so a session opened a week later shows what those records say now                                                                                                |
| Opponent dossier     | What they play, what changed between a historical and a recent window, and which move orders they use — each figure followed by its sample, each move order openable to the games it was seen in                                                                                                    |
| Game-day sheet       | Curated by hand, ordered by you, printable as a self-contained page and exportable as Markdown or PGN. What you leave off is what makes the rest worth reading                                                                                                                                      |
| Theory radar         | A position's move shares over all time, three years and twelve months. Labels name the database and never claim a novelty                                                                                                                                                                           |
| Calculation          | Evidence withheld while you enter the lines you actually look at, on a board that advances. Optional blindfold. Submitting writes the same frozen decision record self-analysis does                                                                                                                |
| Journal patterns     | How far your estimates sat from the evidence, and how often the engine's first choice was on your list. Counts with denominators, never a score, and every bar opens the positions behind it                                                                                                        |
| Review schedule      | Bring a reviewed position back tomorrow, in a week, in three weeks, in two months, or let the scheduler decide. Separate from training, because recalling a move is not rebuilding a plan                                                                                                           |
| Transpositions       | Every prepared move order that reaches a repertoire decision, and the fact that follows: they share one record, so editing through any route changes every route                                                                                                                                    |
| Opening files        | One subject — “Black vs 1.e4, Najdorf” — gathering the repertoire positions, chapters, model games and training that belong to it. References, never copies                                                                                                                                         |
| Guess the move       | Work through a master game one decision at a time. The question is what _this player_ played, so the engine stays out of it and a different move is reported as a difference, not a mistake                                                                                                         |
| Endgame lab          | A library categorised the way you think about endgames, with the tablebase as referee and the engine as opponent. Local Syzygy through the companion, which reads your directory to say exactly what it can answer                                                                                  |
| Candidates           | Ask the engine about the three moves you are choosing between, using UCI `searchmoves` where the engine reports support — and keep a line as evidence with its engine, build, settings, depth and node count                                                                                        |
| Getting around       | One position-actions list behind the menu, the palette and the keyboard; a research trail that names where it goes back to and restores the position; focus mode; compact density; a pasted FEN that finds everywhere the position is stored                                                        |
| Interface            | Responsive desktop/tablet/phone workspace, command palette (`⌘K`), keyboard-first navigation, dark and light themes, local-first preferences                                                                                                                                                        |
| Custom engines       | Register any UCI executable by path through the companion. It must be a real executable and must complete a full `uci`/`uciok`/`isready`/`readyok` handshake before it is accepted; options and capabilities are then read from the engine itself, exactly as for a catalogue engine                |
| Linked accounts      | Link a Lichess or Chess.com username and pull those games into the ordinary local collection. Incremental per each API's own cursor, strictly serial where asked for, no account and nothing uploaded. Syncing twice imports nothing, because a synced game meets the same fingerprint index        |
| Position report      | One click: opening, reference statistics, notable moves, tablebase, repertoire, model games, your games, structural themes, stored engine lines and your own journal history. Every section names its source; an empty one says why. No move is ever called best                                    |

**Deliberately bounded.** IndexedDB collections are measured to 50,000 games and
SQLite ones to 500,000, where the opening explorer is still answered in 0.3 ms
from its derived tables but player and text search have grown to 67–141 ms.
Neither number is extrapolated to millions. Opponent
preparation uses at most the latest 1,000 matching games. Structural features
are counted, never scored — the application does not fabricate strategic labels,
and the assistant is forbidden from inventing numbers that are not in front of
it.

Nothing in the application fabricates chess data. When the engine is not
installed, the engine panel says so. When a database cannot be reached, the
explorer says so and offers your own games instead. The evaluation graph plots
only evaluations you actually saved, leaving unanalysed moves blank rather than
drawing a curve through them. "Saved" means a write completed; if storage
fails, the header says the work is not saved.

### Routes

| Route            | Purpose                                                                             |
| ---------------- | ----------------------------------------------------------------------------------- |
| `/analysis`      | Analyse a position or game. Opened games land here                                  |
| `/openings`      | Board-led opening research across evidence sources                                  |
| `/games`         | Your imported game collection: search, filter, sort, open                           |
| `/preparation`   | Opponent reports: their tendencies against your repertoire                          |
| `/databases`     | Collections, providers, connection health and imports                               |
| `/repertoire`    | The lines you intend to play                                                        |
| `/studies`       | Notebooks of chapters, each a full analysis workspace                               |
| `/training`      | Spaced recall over positions you recorded                                           |
| `/review`        | Self-analysis, the decision journal, the critical queue and the improvement summary |
| `/model-game`    | Step through a model game with the engine off, or guess the moves                   |
| `/opening-files` | One opening subject and everything already stored about it                          |
| `/endgame`       | The endgame library, with tablebase proof beside it                                 |

`/database` (singular) was opponent preparation, which read as data-source
management once real data-source management existed. It now redirects to
`/databases`, and preparation moved to `/preparation`; old bookmarks land
somewhere sensible rather than 404ing.

`/` still opens `/analysis` rather than `/recent`. Kingfisher already restores
the previous session there, so landing on Analysis _is_ continuing; putting a
list in front of it would add a click to the most common action.

### Where your data lives

Studies, chapters, imported game summaries/content, position indexes,
repertoires, model-game links, training schedules/history, chapter references,
background-analysis jobs, saved engine evidence, personal aliases, linked
online accounts and the active
draft are stored in IndexedDB under `kingfisher`; saved and recent database
filters and preferences stay
in `localStorage` — including your Lichess token, which is never committed,
never logged and never included in a backup. It is scope-free and revocable
from Lichess, which is what makes browser storage an acceptable place for it.
Network requests occur only when you deliberately use a remote evidence
source: the Lichess explorer, the Lichess tablebase, an account you linked and
asked to sync, or an assistant endpoint you configured. Local database, engine,
repertoire, study, training and backup workflows remain offline.

A linked account stores a username and two sync cursors. It is not a login:
both providers serve public games without one, nothing is uploaded, and no
password or OAuth flow is involved. The Lichess token you may already have set
for the explorer is reused if present — it raises that API's rate allowance —
and sync works without it.

An analysis is always one of three things, and the header says which:

- **Untitled analysis** — kept as a draft so a refresh cannot lose it, but not
  filed anywhere. `Save to study` (`⌘S`) turns it into a chapter.
- **Study chapter** — yours, and autosaved as you work.
- **Database game** — source material. You can move and explore freely, but
  nothing writes back over the imported game; save a copy to a study instead.

---

Phase 10 is about shaping it around your own workflow without being able to
break it. A workspace is now a board plus three named regions — a side dock, an
optional lower panel, and the board column — and any module can be moved
between them from a menu, not only by dragging. Eight presets, layouts you can
name and save, and a reset that is two clicks from anywhere a layout can go
wrong: a bad arrangement should never mean clearing `localStorage` by hand.
Layouts are stored separately per device size, so arranging a phone cannot
overwrite a desktop.

Deliberately not a docking system. There is no pane tree and no floating
window, because the single most valuable thing on screen is the board, and any
system that lets it be dragged into a corner will eventually put it there by
accident. The board cannot be rearranged, and a test holds it above 400px on a
1440x900 screen.

Every board on every route now resolves one capability record, and concealment
is subtractive: Review, Calculation, Guess the Move and Training withhold the
evaluation, the legal-move hints and the stored annotations, and no call site
can turn any of it back on. A board whose artwork fails to render falls back to
the stock set rather than taking the route down.

Settings gained a search box — "threads", "piece set", "shortcut", "lc0" — and
each result explains the setting rather than just naming it. Every integration
says whether it works where you configured it, instead of sending you to
Diagnostics to find out. Settings and layouts export to a file that carries no
tokens, no keys and no addresses from your own network, and a test greps the
export for a real-looking credential to keep it that way.

Every keyboard command can be rebound, conflicts are reported rather than
silently allowed, and the reference dialog is the editor. The binding table is
now what the handler actually reads, so a documented shortcut is necessarily
one that fires — which was not previously true.

A saved endgame can be played out against the engine with the tablebase as
referee. It reports what the position is now worth — "The tablebase result
changed from Win to Draw on this move" — and never tells you that you blundered,
because it does not know that.

Player and metadata search over a 500,000-game SQLite collection are indexed
rather than scanned: a player prefix lookup went from 72–262 ms to under a
millisecond, and text search from a 127–137 ms tail to a flat 26–29 ms.

## Getting started

```bash
npm install
```

```bash
npm run engine:install
```

```bash
npm run dev
```

Then open <http://localhost:3210>. The application opens directly into the
analysis workspace.

### About the engine download

`npm run engine:install` fetches two Stockfish 17.1 WebAssembly builds (~14 MB)
into `public/engine/stockfish/`. They are **not** committed and **not** an npm
dependency, because Stockfish is GPL-3.0 licensed and large. The application
runs without them — the engine panel reports that analysis is unavailable and
tells you how to fix it.

The single-threaded build is used by default and works everywhere. The
multi-threaded build needs `SharedArrayBuffer`, which needs cross-origin
isolation; enable it with:

```bash
KINGFISHER_CROSS_ORIGIN_ISOLATION=1 npm run dev
```

The engine provider then selects the threaded build automatically.

### About the opening explorer

Lichess began requiring authenticated opening-explorer requests in April 2026.
Kingfisher therefore ships no shared developer credential. Add your own
scope-free token in Settings → Database to enable the Masters and Lichess
sources. Without one, those providers explain what is missing and **My games**,
repertoire, personal and SQLite sources continue to work. The token is stored
only in this browser's preferences and is sent only as the authorization header
for requests to the Lichess opening explorer.

### About the Grandmaster Companion

The optional assistant accepts any OpenAI-compatible `/chat/completions`
endpoint. Configure its base URL, model and optional API key in Settings →
Assistant. Hosted providers work, as do local runners such as Ollama, LM Studio,
llama.cpp server and vLLM. Kingfisher sends the current labelled evidence packet
to that configured endpoint; no key ships with the app, and an unconfigured
assistant stays disabled without affecting the rest of the workstation.

---

## Scripts

| Command                                 | Purpose                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| `npm run dev`                           | Development server on port 3210                                                 |
| `npm run build`                         | Production build                                                                |
| `npm test`                              | Run the test suite                                                              |
| `npm run test:watch`                    | Tests in watch mode                                                             |
| `npm run test:e2e`                      | Playwright browser tests against a real dev server                              |
| `npm run test:e2e:ui`                   | The same suite in Playwright's interactive runner                               |
| `npm run benchmark`                     | The reproducible local benchmark group, with the environment in its output      |
| `npm run bench:sqlite`                  | SQLite companion import and query latency (needs a running companion)           |
| `npm run bench:pgn`                     | PGN parse throughput in browser-equivalent code                                 |
| `npm run bench:aggregates`              | Filtered explorer, structure search and SQLite deletion at 100,000 games        |
| `npm run bench:rules`                   | The rules-engine replacement experiment (ADR 0028)                              |
| `npm run bench:preparation`             | Dossiers, transposition graphs, the theory radar and journal analytics          |
| `npm run bench:player-search -- 500000` | Player prefix and metadata search over a generated collection                   |
| `npm run bench:engines`                 | Native engine startup to `uciok`, `readyok` and a first line                    |
| `npm run bench:evidence`                | Assembling and rendering a companion evidence packet                            |
| `npm run bundle:report`                 | Initial JavaScript per route, from a production build                           |
| `npm run smoke:lichess`                 | Opt-in live check that the Lichess API still matches the providers              |
| `npm run typecheck`                     | TypeScript, no emit                                                             |
| `npm run lint`                          | ESLint                                                                          |
| `npm run format`                        | Prettier                                                                        |
| `npm run format:check`                  | Verify formatting                                                               |
| `npm run engine:install`                | Download the Stockfish WASM builds                                              |
| `npm run engines:install`               | Install every engine for this platform (see [docs/ENGINES.md](docs/ENGINES.md)) |
| `npm run companion`                     | Start the optional local companion                                              |

---

## Keyboard

The workspace is meant to be driven from the keyboard; press `?` in the app for
the full list, and to change any of them. Bindings below are the defaults.

|              |                                           |
| ------------ | ----------------------------------------- |
| `←` `→`      | Previous / next move                      |
| `↑` `↓`      | Previous / next variation                 |
| `Home` `End` | Start of game / end of line               |
| `E`          | Start or stop the engine                  |
| `D`          | Database explorer                         |
| `F`          | Flip the board                            |
| `1`–`6`      | Annotate `!` `?` `!!` `??` `!?` `?!`      |
| `C`          | Comment on this move                      |
| `⇧P` / `⇧M`  | Move variation up / promote to main line  |
| `⇧↑` `⇧↓`    | Reorder this variation among its siblings |
| `Delete`     | Delete this move and everything after it  |
| `X`          | Clear arrows and highlights               |
| `⌘Z` / `⇧⌘Z` | Undo / redo                               |
| `⌘S`         | Save this analysis to a study             |
| `⌘K`         | Command palette                           |

Every command except `Esc` can be rebound from the same dialog that lists them.
A binding already in use is reported before it is taken, with the choice to
replace it or cancel; `Esc` is fixed because it is the way out of every dialog
and out of focus mode.

On the board: right-drag draws an arrow, right-click highlights a square. Hold
`⇧` for red, `⌥` for blue, `⇧⌥` for yellow. In the notation window, right-click
any move for comments, glyphs, variation ordering and deletion.

---

## Documentation

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — layering, domain models, engine,
  database and persistence architecture, state, performance, testing.
- [`docs/adr/`](docs/adr) — short records of the decisions that shaped the
  codebase and why.
- [`docs/ENGINES.md`](docs/ENGINES.md) — the engines, their licences, how they
  are installed, and the obligations that come with them.
- [`THIRD_PARTY_ASSETS.md`](THIRD_PARTY_ASSETS.md) — every piece of artwork,
  who drew it, and under what licence.
- [`companion/README.md`](companion/README.md) — what the local companion does
  and its threat model.
- [`docs/performance/phase-9-preparation-and-scale.md`](docs/performance/phase-9-preparation-and-scale.md)
  — the transposition graph before and after it was measured, every Phase 9
  workflow path, the import regression Phase 8 recorded and how much of it came
  back, and what was deliberately not measured. `npm run bench:preparation`
  reproduces it.
- [`docs/performance/phase-8-study-and-research.md`](docs/performance/phase-8-study-and-research.md)
  — before-and-after measurements for the filtered explorer, structure search,
  SQLite deletion, the 20,000-node move tree, the explorer cache ceiling and
  the rules-engine experiment, plus what Phase 8 made slower and why.
  `npm run benchmark` and `npm run bench:sqlite` reproduce them.
- [`docs/performance/phase-7-speed-and-scale.md`](docs/performance/phase-7-speed-and-scale.md)
  — before-and-after measurements for opening aggregation, PGN import,
  main-thread responsiveness and route bundles, plus the performance budgets and
  what deliberately was not measured. `npm run benchmark` reproduces it.
- [`docs/performance/phase-6-companion-and-engines.md`](docs/performance/phase-6-companion-and-engines.md)
  — measured SQLite import and query latency at 10k and 100k games, native
  engine startup, and evidence-packet assembly. `npm run bench:sqlite`,
  `bench:engines` and `bench:evidence` reproduce them.
- [`docs/performance/phase-3-indexeddb.md`](docs/performance/phase-3-indexeddb.md)
  — measured 1k/10k/50k local-database behaviour and the thresholds it chose.
  `scripts/bench-indexeddb.js` reproduces the numbers in your own browser.

---

## Licensing note

This repository's own code carries no license header yet. The Stockfish builds
downloaded by `npm run engine:install` are **GPL-3.0-or-later** and are not
redistributed here; `chess.js` is BSD-2-Clause. If this project is ever
distributed as a binary bundling Stockfish, the GPL obligations apply to that
bundle and need a deliberate decision. See
[`docs/adr/0004-engine-architecture.md`](docs/adr/0004-engine-architecture.md).
