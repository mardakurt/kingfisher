# Kingfisher

A chess research workspace for players who study.

Engine analysis, opening databases, annotation and game trees in one interface,
built for someone who already knows what a Najdorf is and wants better tools —
not a tutorial, not a puzzle streak, and not a wrapper that prints `+0.34` and
calls it analysis.

> **Working name.** "Kingfisher" is a placeholder while the product is being
> built. Branding is deliberately not a Phase 1 concern.

---

## Status: Phase 1 — the analysis workspace

This repository is at the end of its first milestone. The foundation is real
and tested; the rest of the product is architecture, not implementation.

**Working today**

| Area            | What you can do                                                                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Board           | Drag or click to move, promotion picker, flip, four board themes, two piece sets, coordinates, move animation                                            |
| Game tree       | Nested variations, promote / promote-to-main-line, delete, truncate, undo & redo, keyboard navigation                                                    |
| Annotation      | Comments, NAG glyphs, arrows and square highlights (right-drag), all surviving a PGN round trip                                                          |
| Engine          | Stockfish 17.1 in a Web Worker, MultiPV 1–5, live depth / nodes / nps, evaluation bar, click any move in a variation to insert the line up to that point |
| Import / export | PGN and FEN in (format auto-detected), PGN and FEN out                                                                                                   |
| Database        | Auth-aware Lichess Masters and players providers, plus an offline local index built from every PGN you import                                            |
| Interface       | Responsive desktop/tablet/phone workspace, command palette (`⌘K`), keyboard-first navigation, dark and light themes, local-first preferences             |

**Deliberately not built yet** — the sidebar shows these dimmed rather than
hiding them, because the shape of the product should be visible:
Games, Database, Openings, Repertoire, Studies, Training.

Nothing in the application fabricates chess data. When the engine is not
installed, the engine panel says so. When a database cannot be reached, the
explorer says so and offers your own games instead.

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

|              |                                          |
| ------------ | ---------------------------------------- |
| `←` `→`      | Previous / next move                     |
| `↑` `↓`      | Previous / next variation                |
| `Home` `End` | Start of game / end of line              |
| `E`          | Start or stop the engine                 |
| `D`          | Database explorer                        |
| `F`          | Flip the board                           |
| `1`–`6`      | Annotate `!` `?` `!!` `??` `!?` `?!`     |
| `⇧P` / `⇧M`  | Promote variation / promote to main line |
| `Delete`     | Delete this move and everything after it |
| `X`          | Clear arrows and highlights              |
| `⌘Z` / `⇧⌘Z` | Undo / redo                              |
| `⌘K`         | Command palette                          |

On the board: right-drag draws an arrow, right-click highlights a square. Hold
`⇧` for red, `⌥` for blue, `⇧⌥` for yellow.

---

## Documentation

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — layering, domain models, engine and
  database architecture, state, performance, testing.
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
