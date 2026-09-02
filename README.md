# Kingfisher

A chess research workspace for players who study.

Engine analysis, opening databases, annotation and game trees in one interface,
built for someone who already knows what a Najdorf is and wants better tools —
not a tutorial, not a puzzle streak, and not a wrapper that prints `+0.34` and
calls it analysis.

---

## Status: Phase 7 — fast enough to disappear

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

Every number in that paragraph is measured, reproducible and recorded with its
before-figure in
[`docs/performance/phase-7-speed-and-scale.md`](docs/performance/phase-7-speed-and-scale.md).

Everything is stored in your browser. There is no account, no cloud and no
sync, and the application works with the network off. An **optional** local
companion adds native engines and SQLite collections, the two native
capabilities shipped in Phase 4, and nothing depends on it. Tablebase evidence
currently comes from the separate Lichess Syzygy provider.

**Working today**

| Area            | What you can do                                                                                                                                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Board           | Drag or click to move, promotion picker, flip, eight board themes, five selectable open-source vector piece sets plus an internal recovery set, coordinates, move animation                                                                                        |
| Game tree       | Nested variations, promote / promote-to-main-line, delete, truncate, undo & redo, keyboard navigation                                                                                                                                                              |
| Annotation      | Comments, NAG glyphs, arrows and square highlights (right-drag), all surviving a PGN round trip                                                                                                                                                                    |
| Engines         | Stockfish 17.1 in a Worker; Lc0 and Stormphrax as native processes through the companion. MultiPV 1–5, live depth / nodes / nps, evaluation bar, stability and line-separation metrics, click any move to insert the line                                          |
| Two engines     | Run any two on one position and see where they agree, how far their lines run together, and how far apart their evaluations are. No combined score                                                                                                                 |
| Tablebases      | Syzygy through lichess.org for any position of seven pieces or fewer: category, DTZ, DTM and the winning moves, kept in its own vocabulary rather than converted to centipawns                                                                                     |
| Structure       | Counted, not judged: pawn islands, isolated, doubled, passed, connected passed and backward pawns, open and semi-open files, rooks on them, the bishop pair, material imbalance, castling and king shelter                                                         |
| Companion (AI)  | Optional. Answers from an evidence packet the app builds — engine lines, database counts, your repertoire, the structure — and shows you the packet                                                                                                                |
| Move editing    | Right-click any move for comments, glyphs, variation reordering, "make this the main line", targeted deletion and copy                                                                                                                                             |
| Marking         | Mark a position critical — opening, calculation, strategy, endgame or time trouble — and take it straight to a training item                                                                                                                                       |
| Studies         | Notebooks of ordered chapters — create, rename, reorder, duplicate, delete; autosaved as you work; export a chapter or a whole study as PGN                                                                                                                        |
| Games           | Import cancellable multi-game PGNs, paged indexed search, filters, sortable columns, bulk delete, model-game tags, and personal-game evidence                                                                                                                      |
| Explorer        | Every kind of evidence for one position side by side: frequency, score, average Elo, recent-theory comparison, engine rank, repertoire role, your own results. Sources are never mixed, and there is no combined score                                             |
| Databases       | IndexedDB for everyday collections; optional SQLite through the companion, measured at 100,000 games. Both use the same fingerprints and canonical position keys                                                                                                   |
| Openings        | One board-led workspace combining local database moves, repertoire choices, personal results, engine evidence, and model games                                                                                                                                     |
| Repertoire      | White/Black repertoires keyed by canonical position, editable move roles and notes, explicit opponent replies, coverage counts, local evidence, gap detection, and PGN export                                                                                      |
| Preparation     | Exact-player reports with side/date/rating/ECO/result filters, profile facts, transposition-aware trees with frequency, score, average Elo and recency, prepared-vs-gap comparison, and a "My games" view of your own                                              |
| Training        | Answer on the board or by band: repertoire recall, best move, candidate moves, evaluation bands, and plans, each checked against what you recorded; due/new/learning/mature queues with deterministic SRS                                                          |
| Backup          | Versioned JSON export; authored-work or full-game backup; validated transactional merge and replace                                                                                                                                                                |
| Background work | Queue games for analysis with one background engine: quick / standard / deep / custom presets, every move or after move N, pause, resume, cancel, retry failed, resumable across a restart. Stores engine, score, depth, nodes, time and PV — never a move label   |
| References      | A chapter can link the model games, repertoire positions and training items it is about. Clicking one opens it; a deleted target reads "Missing reference" and the integrity scan offers to drop it                                                                |
| Saved filters   | Name a database filter set and get it back from a menu; recently used filter sets are remembered and named after what they select                                                                                                                                  |
| Storage         | Estimated IndexedDB usage against the browser quota, SQLite collection sizes on disk, and counts of games, studies and training items. Estimates are called estimates, and nothing is ever deleted for you                                                         |
| Search          | `⌘K` searches actions plus studies, chapters, games, players, repertoires, training items, model games, and tags                                                                                                                                                   |
| Import / export | PGN and FEN in (format auto-detected) from a paste or a file, parsed in a Worker so the tab stays usable, backgroundable, cancellable without losing committed games; PGN, FEN, SAN and UCI out                                                                    |
| Workspaces      | The same board and the same research tools in Analysis, Studies, Openings, Repertoire, Preparation and Training. Layout presets, a resizable dock, and the last tool remembered per route                                                                          |
| Data sources    | `/databases` lists every provider with a real status — ready, authentication required, companion offline, rate limited, misconfigured — plus capabilities, game counts, measured latency and a connection test that validates the response, not just the transport |
| Lichess         | Masters, the Lichess database and the player explorer over `explorer.lichess.org`, connected with your own scope-free token. `401`, `403`, `404`, `429`, `5xx`, timeouts and schema changes each say what actually happened                                        |
| Interface       | Responsive desktop/tablet/phone workspace, command palette (`⌘K`), keyboard-first navigation, dark and light themes, local-first preferences                                                                                                                       |

**Deliberately bounded.** IndexedDB collections are measured to 50,000 games and
SQLite ones to 100,000; neither number is extrapolated to millions. Opponent
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

| Route          | Purpose                                                    |
| -------------- | ---------------------------------------------------------- |
| `/analysis`    | Analyse a position or game. Opened games land here         |
| `/openings`    | Board-led opening research across evidence sources         |
| `/games`       | Your imported game collection: search, filter, sort, open  |
| `/preparation` | Opponent reports: their tendencies against your repertoire |
| `/databases`   | Collections, providers, connection health and imports      |
| `/repertoire`  | The lines you intend to play                               |
| `/studies`     | Notebooks of chapters, each a full analysis workspace      |
| `/training`    | Spaced recall over positions you recorded                  |

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
background-analysis jobs, saved engine evidence, personal aliases and the active
draft are stored in IndexedDB under `kingfisher`; saved and recent database
filters and preferences stay
in `localStorage` — including your Lichess token, which is never committed,
never logged and never included in a backup. It is scope-free and revocable
from Lichess, which is what makes browser storage an acceptable place for it.
Network requests occur only when you deliberately use a remote evidence
source: the Lichess explorer, the Lichess tablebase, or an assistant endpoint
you configured. Local database, engine, repertoire, study,
training and backup workflows remain offline.

An analysis is always one of three things, and the header says which:

- **Untitled analysis** — kept as a draft so a refresh cannot lose it, but not
  filed anywhere. `Save to study` (`⌘S`) turns it into a chapter.
- **Study chapter** — yours, and autosaved as you work.
- **Database game** — source material. You can move and explore freely, but
  nothing writes back over the imported game; save a copy to a study instead.

---

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

| Command                    | Purpose                                                                         |
| -------------------------- | ------------------------------------------------------------------------------- |
| `npm run dev`              | Development server on port 3210                                                 |
| `npm run build`            | Production build                                                                |
| `npm test`                 | Run the test suite                                                              |
| `npm run test:watch`       | Tests in watch mode                                                             |
| `npm run test:e2e`         | Playwright browser tests against a real dev server                              |
| `npm run test:e2e:ui`      | The same suite in Playwright's interactive runner                               |
| `npm run benchmark`        | The reproducible local benchmark group, with the environment in its output      |
| `npm run bench:sqlite`     | SQLite companion import and query latency (needs a running companion)           |
| `npm run bench:pgn`        | PGN parse throughput in browser-equivalent code                                 |
| `npm run bench:aggregates` | Explorer aggregate lookups when the aggregate table is itself large             |
| `npm run bench:engines`    | Native engine startup to `uciok`, `readyok` and a first line                    |
| `npm run bench:evidence`   | Assembling and rendering a companion evidence packet                            |
| `npm run bundle:report`    | Initial JavaScript per route, from a production build                           |
| `npm run smoke:lichess`    | Opt-in live check that the Lichess API still matches the providers              |
| `npm run typecheck`        | TypeScript, no emit                                                             |
| `npm run lint`             | ESLint                                                                          |
| `npm run format`           | Prettier                                                                        |
| `npm run format:check`     | Verify formatting                                                               |
| `npm run engine:install`   | Download the Stockfish WASM builds                                              |
| `npm run engines:install`  | Install every engine for this platform (see [docs/ENGINES.md](docs/ENGINES.md)) |
| `npm run companion`        | Start the optional local companion                                              |

---

## Keyboard

The workspace is meant to be driven from the keyboard; press `?` in the app for
the full list.

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
