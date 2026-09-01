# Kingfisher

A chess research workspace for players who study.

Engine analysis, opening databases, annotation and game trees in one interface,
built for someone who already knows what a Najdorf is and wants better tools —
not a tutorial, not a puzzle streak, and not a wrapper that prints `+0.34` and
calls it analysis.

> **Working name.** "Kingfisher" is a placeholder while the product is being
> built. Branding is deliberately not a Phase 1 concern.

---

## Status: Phase 2 — a place to keep the work

Phase 1 built the workstation. Phase 2 made it somewhere you can leave things:
analysis you did an hour ago is still there after a reload, filed in a study,
and the games you imported answer questions about the position in front of you.

Everything is stored in your browser. There is no account, no server and no
sync, and the application works with the network off.

**Working today**

| Area            | What you can do                                                                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Board           | Drag or click to move, promotion picker, flip, four board themes, two piece sets, coordinates, move animation                                            |
| Game tree       | Nested variations, promote / promote-to-main-line, delete, truncate, undo & redo, keyboard navigation                                                    |
| Annotation      | Comments, NAG glyphs, arrows and square highlights (right-drag), all surviving a PGN round trip                                                          |
| Engine          | Stockfish 17.1 in a Web Worker, MultiPV 1–5, live depth / nodes / nps, evaluation bar, click any move in a variation to insert the line up to that point |
| Move editing    | Right-click any move for comments, glyphs, variation reordering, "make this the main line", targeted deletion and copy                                   |
| Studies         | Notebooks of ordered chapters — create, rename, reorder, duplicate, delete; autosaved as you work; export a chapter or a whole study as PGN              |
| Games           | Import single or multi-game PGNs into a local database, with duplicate detection, search, filters, sortable columns and bulk delete                      |
| Explorer        | Your own games answered by position, so transpositions merge; plus auth-aware Lichess Masters and players providers                                      |
| Import / export | PGN and FEN in (format auto-detected), staged progress and cancellation for large files; PGN, FEN, SAN and UCI out                                       |
| Interface       | Responsive desktop/tablet/phone workspace, command palette (`⌘K`), keyboard-first navigation, dark and light themes, local-first preferences             |

**Deliberately not built yet** — the sidebar shows these dimmed rather than
hiding them, because the shape of the product should be visible:
Database (large external collections), Openings, Repertoire, Training.

Nothing in the application fabricates chess data. When the engine is not
installed, the engine panel says so. When a database cannot be reached, the
explorer says so and offers your own games instead. The evaluation graph plots
only evaluations you actually saved, leaving unanalysed moves blank rather than
drawing a curve through them. "Saved" means a write completed; if storage
fails, the header says the work is not saved.

### Where your data lives

Studies, chapters, imported games and the position index are stored in
IndexedDB under the database name `kingfisher`; preferences stay in
`localStorage`. Nothing leaves the machine except opening-explorer lookups you
make against Lichess.

An analysis is always one of three things, and the header says which:

- **Untitled analysis** — kept as a draft so a refresh cannot lose it, but not
  filed anywhere. `Save to study` (`⌘S`) turns it into a chapter.
- **Study chapter** — yours, and autosaved as you work.
- **Database game** — source material, marked read-only. Editing it never
  writes back over the imported game; save a copy to a study instead.

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
Phase 1 deliberately does not ask for or store a Lichess token, so the remote
providers explain that boundary and offer **My games** instead. Importing a PGN
indexes every game locally and that explorer remains fully offline. Authenticated
remote access belongs behind the existing database-provider interface in a later
milestone.

---

## Scripts

| Command                  | Purpose                            |
| ------------------------ | ---------------------------------- |
| `npm run dev`            | Development server on port 3210    |
| `npm run build`          | Production build                   |
| `npm test`               | Run the test suite                 |
| `npm run test:watch`     | Tests in watch mode                |
| `npm run typecheck`      | TypeScript, no emit                |
| `npm run lint`           | ESLint                             |
| `npm run format`         | Prettier                           |
| `npm run engine:install` | Download the Stockfish WASM builds |

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

---

## Licensing note

This repository's own code carries no license header yet. The Stockfish builds
downloaded by `npm run engine:install` are **GPL-3.0-or-later** and are not
redistributed here; `chess.js` is BSD-2-Clause. If this project is ever
distributed as a binary bundling Stockfish, the GPL obligations apply to that
bundle and need a deliberate decision. See
[`docs/adr/0004-engine-architecture.md`](docs/adr/0004-engine-architecture.md).
