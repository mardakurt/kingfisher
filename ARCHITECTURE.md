# Architecture

## What this is optimising for

A chess research environment that is still worth working in several years from
now. Every structural decision here is made against that horizon rather than
against the shortest path to a working demo. Concretely, that means three
things:

1. **Chess data is modelled, not stringified.** A game is a tree, a move knows
   which position it was played in, and FEN / SAN / UCI are different types.
2. **Capabilities sit behind interfaces.** The engine, the database and the
   board are each defined by an interface that the rest of the application
   codes against, so any of them can be replaced without a rewrite.
3. **Nothing is faked.** A feature that cannot be built honestly yet is left
   visible and disabled rather than mocked, so that no fictional number ever
   ends up in a chess judgement.

---

## Layering

```
  ┌───────────────────────────────────────────────────────────┐
  │  app/            routes, providers, global styles         │
  ├───────────────────────────────────────────────────────────┤
  │  features/       board · movetree · engine · explorer ·   │
  │                  notes · analysis · shell · command       │
  ├───────────────────────────────────────────────────────────┤
  │  stores/         analysis · engine · ui · preferences     │
  ├───────────────────────────────────────────────────────────┤
  │  engine/         database/       (capability interfaces)  │
  ├───────────────────────────────────────────────────────────┤
  │  chess/          the domain — no React, no I/O            │
  └───────────────────────────────────────────────────────────┘
```

Dependencies point downwards only.

- `chess/` imports nothing from the layers above it and contains no React. It is
  the part of the codebase most worth keeping, and it is fully unit tested.
- `engine/` and `database/` define capability interfaces and their
  implementations. They may use `chess/`; they know nothing about React.
- `stores/` holds application state and is the only place where the domain and
  the capabilities are wired together.
- `features/` renders. Components read from stores and call domain functions;
  they never contain chess rules or protocol handling.

The one deliberate exception is `chess/position.ts`, which is the only module
allowed to import `chess.js`. Swapping the rules implementation means changing
that file and nothing else.

---

## Directory structure

```
src/
  app/                     Next.js App Router: layout, providers, /analysis
  chess/                   Domain. Pure TypeScript.
    types.ts               Branded Fen/San/Uci, Square, Piece, ChessMove
    result.ts              Result<T, ChessError> for every parse boundary
    board.ts               Square arithmetic (a1 = 0 … h8 = 63)
    fen.ts                 FEN parse / validate / format / position key
    moves.ts               UCI ⇄ intent conversions
    position.ts            Immutable Position; the only chess.js importer
    game.ts                Tree operations that need the rules
    evaluation.ts          Score, White-POV convention, winning chances
    annotations.ts         NAGs, arrows, square highlights
    tree/                  MoveNode, GameTree and their pure operations
    pgn/                   Tokenizer, parser, serializer, %-command handling
  engine/                  EngineProvider / EngineSession / EngineAnalysis
    uci.ts                 Pure UCI parsing
    pv.ts                  UCI variations → readable SAN
    stockfish/             WASM-in-a-worker implementation
  database/                ChessDatabaseProvider and the normalized result model
    local-index.ts         In-memory position index over imported games
    providers/             Lichess explorer, local collection
  features/                UI, one folder per product area
  stores/                  Zustand stores, one per state category
  components/              Shared primitives and icons
  hooks/                   Small, generic React hooks
  lib/                     Framework-free helpers and shared UI contracts
```

Feature folders, not layer folders, for the UI: `features/explorer` holds the
panel, its query hook and its table, because those change together.

---

## Domain models

### `Position`

Immutable. Constructed from a FEN either with validation (`Position.fromFen`,
returns a `Result`) or without (`Position.fromTrustedFen`, for FENs this
application produced itself). Exposes legal moves, board contents, terminal
state, and material balance. It memoises its own legal move list, which is why
the UI can derive it on every render without a cache.

`Position.outcome()` deliberately omits threefold repetition: repetition is a
property of a _game_, not a position, and lives in `game.ts` where the line
leading to a node is known.

### `ChessMove`

A fully resolved legal move. Every representation the application needs —
`from`, `to`, `promotion`, `san`, `uci`, `flags`, `before`, `after` — is
computed once, at the moment the move is validated against a position. Nothing
downstream re-parses SAN to ask whether a move was a capture.

### `GameTree` and `MoveNode`

The central structure. A flat `Record<NodeId, MoveNode>` plus a root id, so an
edit touches O(depth) objects instead of rebuilding a subtree, and React can
compare individual nodes cheaply.

Each node carries the move, the resulting FEN, its ply, NAGs, comments (before
and after), shapes, an evaluation, and a `meta` object reserved for clocks,
classification and repertoire status. `children[0]` is the continuation of the
line; the rest are variations, in order.

All operations in `tree/tree.ts` are pure and return a new tree with structural
sharing: `addMove`, `removeNode`, `truncateAfter`, `removeVariations`,
`promoteVariation`, `promoteToMainline`, `setComment`, `toggleShape`,
`setEvaluation`. `addMove` deduplicates: replaying a move that already exists
returns the existing node, which is what makes clicking through an opening tree
converge instead of fanning out.

`tree/tree.ts` knows no chess rules — it stores what it is given.
Rule-dependent helpers (`playSanAt`, `insertLine`, `repetitionCount`,
`outcomeAt`) live in `game.ts`.

### `Evaluation` and `Score`

`Score` is `{ kind: 'cp' } | { kind: 'mate' }` and is **always stored from
White's point of view**. Engines report relative to the side to move; that
conversion happens exactly once, at the UCI boundary. `winningChances` maps a
score onto expected result with the logistic curve fitted to real games, which
is what the evaluation bar uses — a bar linear in centipawns spends most of its
travel on differences that change nothing.

### PGN

Written from scratch, not delegated. `chess.js` flattens variations on import,
which would discard the data this application exists to work with.

- `pgn/lexer.ts` — a character scanner. Forgiving about the many ways a move
  number can be glued to a move (`1.e4`, `1. e4`, `1...e5`); strict about
  structure.
- `pgn/parse.ts` — recursive descent into a `GameTree`. Recovery-oriented: an
  illegal move truncates the variation it appears in and is reported as an
  issue, rather than failing the file.
- `pgn/serialize.ts` — the inverse, with move numbers repeated wherever a
  reader would otherwise lose the thread.
- `pgn/comment-commands.ts` — `[%cal]`, `[%csl]`, `[%eval]`, `[%clk]`, `[%emt]`.
  This is what makes arrows, evaluations and clock times survive a round trip.

---

## Engine architecture

```
EngineProvider  ──create()──▶  EngineSession  ──analyse()──▶  AnalysisHandle
     │                              │                              │
StockfishWasmProvider          configure()                    onUpdate(EngineAnalysis)
(native bridge, remote            stop()                      finished: Promise
 server: same interface)          dispose()
```

Nothing above `engine/` knows where analysis comes from. The UI subscribes to a
stream of `EngineAnalysis` snapshots and never sees a UCI line.

**Implementation.** `StockfishWasmProvider` reads a manifest written by
`scripts/install-engine.mjs`, picks the multi-threaded build when
`crossOriginIsolated` is true and the single-threaded one otherwise, and starts
it as a Web Worker. `UciWorkerClient` moves lines of text; `StockfishSession`
owns protocol state.

**Three details that matter.**

- _Searches are serialised._ A new analysis request stops the running search and
  waits for its `bestmove` before starting, through a promise queue. Without
  that, a fast sequence of moves interleaves two searches' `info` lines.
- _Updates are coalesced._ Stockfish emits `info` far faster than anything
  should re-render; the session batches to roughly 11 updates per second.
- _Score orientation is fixed at the boundary._ The session computes the side to
  move at the root of the search and converts every score to White's point of
  view before it leaves.

`uci.ts` is pure and separately tested: the protocol can be exercised
exhaustively without starting a worker, and a second UCI engine needs no new
parsing code.

---

## Database architecture

```
ChessDatabaseProvider
  ├── LichessExplorerProvider('masters')   real over-the-board games
  ├── LichessExplorerProvider('lichess')   real online games, rating-filterable
  └── LocalCollectionProvider              your imported PGNs, indexed by position
```

All three answer the same query — _what happens from this position?_ — and
return the same `ExplorerResult`: totals, per-move counts, White/draw/Black
splits, average rating, performance rating, notable players, top games. The
panel does not know which provider it is talking to.

Lichess has required authenticated opening-explorer requests since April 2026.
This milestone does not collect tokens, so those providers translate HTTP 401
into an explicit authentication message and local fallback. They do not claim
the backend is unavailable, and the panel never substitutes synthetic results.
Authenticated access remains an additive provider concern.

The interface is shaped for databases of millions of games: the unit of work is
a question about a position, never "load the games".

`PositionIndex` is the local implementation. Importing a PGN opens the first
game _and_ indexes every game in the file, keyed by `positionKey` (placement,
side to move, castling, en passant — no move counters), so transpositions are
found. A few thousand games fit comfortably in memory; a collection of millions
belongs behind a different implementation of the same interface, which is
exactly why the interface exists.

---

## State

Four stores, split by what the state _is_, not by which component uses it.

| Store               | Holds                                                   | Persisted    |
| ------------------- | ------------------------------------------------------- | ------------ |
| `analysis-store`    | The game tree, the cursor, board orientation, undo/redo | No           |
| `engine-store`      | Engine status, identity, the latest analysis snapshot   | No           |
| `ui-store`          | Palette / dialog visibility, active panel, notices      | No           |
| `preferences-store` | Themes, board and piece sets, engine defaults           | localStorage |

Two rules hold this together:

- **The tree and the cursor live in one store.** They are not independent — a
  deletion has to move the cursor, an undo has to restore both — and splitting
  them would mean synchronising two stores on every edit, which is the class of
  bug that corrupts a game.
- **Derived values are never stored.** The current position, the legal
  destinations, the main line and the evaluation shown on a node are all
  computed from the tree. There is one source of truth.

Server and cache state does **not** live in Zustand. Explorer lookups go through
TanStack Query, keyed by position and filters, cancelled when the user moves on.

The engine session object itself lives in a module-level variable rather than in
the store: it owns a Web Worker, it is not serialisable, and nothing should
re-render because a pointer to it changed.

---

## The board

`features/board/Chessboard.tsx` is a renderer, not a chess engine. Its
interface (`features/board/types.ts`) takes a FEN, an orientation, a map of
legal destinations and a set of shapes, and reports move intents. It contains no
rules, which is what lets the rest of the application treat it as replaceable.

Two parts are less obvious than they look:

- **Piece identity.** Matching pieces to squares by square alone would make
  every move a disappear-and-reappear. `layout.ts` carries identity across a
  position change — including the rook in a castle and the pawn that becomes a
  queen — so a move animates. This is state derived from a prop, adjusted during
  render; an effect would paint one frame with the pieces in the wrong place.
- **Pointer bookkeeping is in refs, not state.** Press and release can happen in
  the same tick — a fast click, or any touch tap — and a state value read on
  release would still hold the value from before the press. Getting this wrong
  makes one click play its move twice.

The board also guarantees it never emits an illegal intent: legality is
rechecked against the destinations of the position currently rendered, so a
click that races a position change is dropped rather than rejected downstream.

`pieces.tsx` is the single piece-rendering boundary. Board code asks it for a
piece by colour, type and set id; the internal SVG geometry shares one viewBox,
baseline and centring contract. This keeps pieces crisp without asset timing,
sprite clipping or per-square paths, and adding a set does not change board
interaction code.

**Sizing is CSS-owned.** The board is an `aspect-ratio: 1` surface inside a
grid capped by both available width and dynamic viewport height. JavaScript
does not measure pixels to keep it square. At 1100 px the information
architecture changes once: wide screens show engine/explorer/notes beside a
separate move tree; narrower screens place the board first and expose Moves,
Engine, Explorer and Notes as one compact tab set. The sidebar similarly moves
from full, to icon rail, to an accessible drawer.

---

## Performance

The choices already made, and why:

- Engine analysis runs in a Web Worker; the UI thread never blocks on a search.
- Engine updates are throttled at the source, not at the component.
- Node evaluations are written to the tree only when depth changes, and never
  create undo entries — otherwise a running engine would fill the history.
- The move tree renders recursively rather than virtually. This is honest about
  its limit: it is comfortable to a few thousand nodes. Virtualising a nested,
  variable-height structure is real work and belongs with the study system,
  where trees actually get large.
- Explorer results are cached by position for ten minutes, so walking a line
  backwards and forwards costs nothing.

---

## Testing

127 tests, all on the parts where being wrong is expensive.

| Area           | Covered                                                                                                                                                                                                                           |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FEN            | Valid parses, 11 kinds of malformed input, en passant rank rules, round trip, position key                                                                                                                                        |
| Position       | Legal move generation, castling (including through check), en passant, promotion, checkmate, stalemate, insufficient material, illegal positions                                                                                  |
| Game tree      | Add / dedupe / delete / truncate / promote / promote-to-main-line, path and line walking, ply numbering from a custom FEN, annotation toggles                                                                                     |
| Game           | Line insertion in SAN and UCI, threefold repetition along a line                                                                                                                                                                  |
| PGN            | Tokenizing, nested variations, comments and pre-comments, NAGs and suffix glyphs, `[%cal]` / `[%eval]` / `[%clk]`, FEN tag, illegal-move recovery, multiple games, serialization and round trip, a complete annotated master game |
| Evaluation     | White-POV conversion, formatting, ordering with mate scores, winning chances                                                                                                                                                      |
| UCI            | `info` with every field, mate scores, bounds, `bestmove`, options, command formatting                                                                                                                                             |
| Database       | Position aggregation, transpositions, rating averaging, player and date filters, performance rating                                                                                                                               |
| Analysis store | Navigation, variation creation, editing, undo/redo including redo invalidation, PGN/FEN load and export                                                                                                                           |
| Board layout   | Pointer-to-square conversion in both orientations and animation identity across ordinary moves, promotion, and castling                                                                                                           |
| Providers      | Explicit handling of authentication-required Lichess explorer responses                                                                                                                                                           |

Run with `npm test`.

---

## Roadmap

Phase 1 built the workspace. The order below is chosen so that each phase makes
the next one cheaper.

**Phase 2 — games and persistence.** IndexedDB behind the local database
provider, a game list, per-game review, and the "annotate before you switch the
engine on" workflow.

**Phase 3 — repertoire.** Positions and expected replies rather than PGN files,
with statuses, priorities and detection of when an imported game leaves the
repertoire.

**Phase 4 — studies and training.** Chapters over the existing tree and
annotation model; training items generated from positions already in the
database; spaced repetition.

**Phase 5 — understanding.** Position feature extraction (pawn structures, weak
squares, outposts, king safety), and a move classifier that weighs evaluation
swing against complexity, uniqueness of the best move and depth stability —
deliberately not a threshold on centipawn loss.

**Later — assistance.** A `ChessContext` assembled from engine output, database
evidence, position features and the user's own history, so that an explanation
is grounded in structured evidence rather than generated from a number.
