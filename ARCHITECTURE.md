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
  │  features/       analysis · games · openings · repertoire │
  │                  preparation · training · explorer ·      │
  │                  engine · assistant · shell · command     │
  ├───────────────────────────────────────────────────────────┤
  │  stores/         analysis · engine · ui · preferences     │
  ├───────────────────────────────────────────────────────────┤
  │  engine/   database/   persistence/  (capability layer)   │
  ├───────────────────────────────────────────────────────────┤
  │  chess/          the domain — no React, no I/O            │
  └───────────────────────────────────────────────────────────┘
```

Dependencies point downwards only.

- `chess/` imports nothing from the layers above it and contains no React. It is
  the part of the codebase most worth keeping, and it is fully unit tested.
- `engine/`, `database/` and `persistence/` define capability interfaces and
  their implementations. They may use `chess/`; they know nothing about React.
  `persistence/` is the only place that mentions IndexedDB — the domain does not
  know that storage exists, and no component holds a transaction.
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
    local-index.ts         In-memory position index (pure, used by tests)
    providers/             Lichess explorer, persistent local collection
  persistence/             Local-first storage. See ADR 0008.
    schema/migrations.ts   Versioned stores and indexes; an ordered array
    indexeddb/database.ts  The IndexedDB wrapper: transactions, error mapping
    indexeddb/memory.ts    Same interface in memory, for tests
    domain.ts              Repertoire, training, model-game and profile records
    backup.ts              Versioned validation and transactional restore
    search.ts              Bounded cross-entity command search
    repositories/          Studies, games, drafts, repertoire, training, library
    validation.ts          Runtime guards for everything read back out
    import-game.ts         PGN → parse → normalize → persist → index
    autosave.ts            Pure debounce-with-a-cap scheduling
  features/                UI, one folder per product area
    workspace/             The shared workspace seam. See ADR 0017.
      ChessWorkspaceContext.tsx  Read-through view of the analysis store
      CanonicalBoardSurface.tsx  The one full-size board pipeline
      WorkspaceToolDock.tsx      Route → tool table, and the tool host
    databases/             Data-source management, health and connection tests
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

### Repertoire knowledge

A repertoire is a canonical-position map, not another game tree. One unique
`[repertoireId, positionKey]` entry holds the user's own move choices and the
opponent continuations explicitly recorded while authoring a line. Own moves
have main/alternative/candidate/avoid roles; opponent moves carry
`expected: true` and do not inflate coverage. This is what lets transpositions,
coverage gaps, and own-versus-opponent deviations share one definition. ADR
0010 records the alternatives.

### Training items

Training content and scheduling are separate concerns. The content stores a
position, one of five prompt modes, structured move/evaluation/plan answers,
tags, and an optional source reference. The schedule is a small deterministic
state transformed by a pure `grade` function. Review history is append-only in
a separate store and is written transactionally with the next schedule. See
ADR 0011.

An answer is checked against what the item's author wrote down, never against a
search. `training/answer.ts` compares an attempt with the recorded moves, band
or plan and reports `correct`, `partial`, `incorrect` or — for prose plans and
items with nothing recorded — `unchecked`, where the reviewer's own grade is the
only evidence there is. Items also record where their accepted moves came from
(`user`, `engine`, `repertoire`) and say so at review time, because "the engine
liked this" and "this is my repertoire move" are different claims.

### Exporting a repertoire

`repertoire/export.ts` walks the position map from the start, depth first, and
writes the result as PGN: alternatives at one position become variations,
recorded opponent replies continue the line, and roles and notes become
comments. What does **not** survive the round trip is the model itself — roles,
expected-reply status, depth and position identity read back as prose, because
PGN has nowhere to put them. Lines that transpose back into themselves are cut
rather than followed.

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
  ├── LichessExplorerProvider('masters')   over-the-board master games
  ├── LichessExplorerProvider('lichess')   online games, rating/speed-filterable
  ├── LichessExplorerProvider('player')    one player, indexed on demand
  ├── CompanionSqliteProvider              a local SQLite collection, if paired
  └── LocalCollectionProvider              your imported PGNs, indexed by position
```

Every provider optionally implements `health(signal)`, which runs a real query
and validates the response shape — not "a fetch returned something" — and
reports one of `ready`, `loading`, `authentication-required`,
`companion-offline`, `misconfigured`, `rate-limited`, `network-error`,
`unsupported` or `error`, with a remedy and a measured latency. `/databases`
renders that, and so does the Database tool in the dock. ADR 0018 covers the
model and why an empty result is now only ever a genuinely empty result.

Queries run with `networkMode: 'always'`. The default mode pauses a query when
the browser claims to be offline, leaving `status: 'pending'` with
`fetchStatus: 'paused'` — which panels drew as a loading message that never
resolved. Most queries here read IndexedDB anyway, and the explorer treats a
paused fetch as its own state rather than as loading.

All three answer the same query — _what happens from this position?_ — and
return the same `ExplorerResult`: totals, per-move counts, White/draw/Black
splits, average rating, performance rating, notable players, top games. The
panel does not know which provider it is talking to.

The opening explorer lives at `explorer.lichess.org` and requires
authentication. Kingfisher accepts the user's own scope-free personal access
token in Settings → Database and adds it only to explorer requests. Without
one the provider fails as `authentication-required` before sending anything,
rather than issuing a request it knows will 401 and reporting the result as an
empty position. `401`, `403`, `404`, `429`, `5xx`, timeouts and unparseable
bodies each carry their own state and message; the panel never substitutes
synthetic results.

The interface is shaped for databases of millions of games: the unit of work is
a question about a position, never "load the games".

`PersistentLocalCollectionProvider` is the local implementation. It reads the
IndexedDB position index through `GameRepository`, so what the explorer shows
survives a reload. Importing a PGN stores and indexes every game in the file,
keyed by the canonical position key — placement, side to move, castling and a
_usable_ en passant square, with no move counters — so transpositions merge.
ADR 0009 explains why each of those fields is in or out; getting it wrong splits
one position into two and reports half the evidence.

`PositionIndex` (`database/local-index.ts`) remains as the pure in-memory
implementation of the same aggregation, which is what the aggregation tests run
against. A collection of millions belongs behind a third implementation of the
same interface, which is exactly why the interface exists.

---

## Engines

One session drives every engine. `UciSession` owns everything that is hard —
serialising searches so a new request supersedes a running one, coalescing the
`info` flood into UI-rate snapshots, keeping MultiPV lines in rank order,
converting scores to White's point of view — and none of it depends on where
the engine runs. That is behind `UciTransport`:

```
UciTransport            one line in, one line out
  ├── UciWorkerClient   postMessage to a Web Worker   (Stockfish WASM)
  └── CompanionTransport fetch in, SSE out            (Lc0, Stormphrax, …)
```

Adding an engine is a transport plus a capability record, not a second copy of
the session. **Capabilities are read from the engine's own `option` lines** at
handshake rather than tabulated: Lc0 has no `Hash`, no `Use NNUE`, a `Threads`
default of 0 and a `WeightsFile` no alpha-beta engine has, and a hand-written
table would encode that as folklore and go stale.

Two engines may run at once and they split the thread budget. Two is a hard
limit: a third search takes cores from the interface. `engine/comparison.ts`
reports top-move agreement, PV divergence and the evaluation gap, and refuses
to subtract a mate score from an evaluation. See `docs/ENGINES.md`.

## The local companion

Optional, and nothing depends on it. `companion/` is a dependency-free Node
service for the two native capabilities shipped here: native UCI engines and
SQLite. It is reached through the ordinary `EngineProvider` and
`ChessDatabaseProvider` interfaces, so no UI code knows it exists. Tablebases
use the independent `TablebaseProvider` boundary; the current implementation is
the documented Lichess Syzygy service, not a companion route.

Loopback only; a token minted per run and never written to disk; origin
allowlist; resource **keys** rather than paths, so a request cannot name a file;
argv arrays rather than a shell. ADR 0015 and `companion/README.md` carry the
reasoning and the threat model.

## Evidence sources

Six kinds of evidence about a position, deliberately never merged:

| Source     | Says                               | Lives in              |
| ---------- | ---------------------------------- | --------------------- |
| Engine     | what a search currently believes   | `engine/`             |
| Database   | what has been played, and by whom  | `database/`           |
| Repertoire | what the user decided              | `repertoire/`         |
| Personal   | how the user has done with it      | `database/` + profile |
| Tablebase  | what is **proved**                 | `tablebase/`          |
| Structure  | what is **countable** on the board | `chess/features.ts`   |

`chess/features.ts` is pure and holds no judgement: isolated, doubled, passed,
connected passed and backward pawns, pawn islands, open and semi-open files,
rooks on them, the bishop pair, material imbalance by piece type, castling
rights, whether the king castled, and king shelter. Where a term has more than
one definition in the literature the one used is written beside the code — a
backward pawn needs its advance square covered by an enemy pawn, or the term
means nothing.

## The assistant

`assistant/` builds an **evidence packet** from the sources above, renders it as
a labelled document, and asks an OpenAI-compatible endpoint to explain _that_.
The model is never asked what it knows about chess. The packet names which
sources are empty, so "there is no database evidence here" is an available
answer, and the rendered packet is shown under every reply so any claim can be
checked. No key ships; an unconfigured assistant is a disabled one. ADR 0016.

## Persistence

```
StudyRepository        studies, chapters, ordering, duplication
GameRepository         summaries, content, indexed search and position evidence
DraftRepository        the one active workspace, for reload recovery
RepertoireRepository   canonical position knowledge and move roles
TrainingRepository     authored items, due queue and append-only reviews
Library repositories   model-game references and explicit personal aliases
StudyReferenceRepo     typed chapter links to games, repertoire positions, items
AnalysisQueueRepo      background analysis jobs and their stored engine evidence
```

Fifteen object stores are created by a versioned migration array, never by
deleting the database. Schema v3 moves trees and normalized PGN into
`gameContent`; lists, search and explorer read only `games` summaries. Phase 3
adds repertoires/positions, training items/reviews, model-game links and the
explicit personal profile. Schema v4 adds chapter revisions; v5 extends
revisions to repertoire positions and training items; v6 adds `studyReferences`
with a unique `(chapterId, kind, targetId)` index; v7 adds `analysisQueue` and
`engineEvidence`. Records are validated on the way out, because a record written
by an older build is plausible and malformed data must not reach the board.

### Revisions beyond chapters

Phase 6 gave chapters a revision checked inside the write transaction (ADR
0019). Phase 7 applies the same shape to the two other things a second tab can
be editing:

- **Repertoire positions.** `upsertPosition` takes an `expectedRevision` and
  throws `StaleRepertoirePositionWriteError` — carrying the winning record —
  when the stored revision differs. `removeMove` and `deletePosition` take the
  revision too, and both now run inside a transaction rather than as a
  read-modify-write.
- **Training items.** `update` compares revisions and throws
  `StaleTrainingItemWriteError`. Authoring fields are what the revision
  protects; the schedule is deliberately taken from the _current_ record on
  every accepted write, so a review graded in one tab is never erased by an
  editor that loaded the item before it. Review history stays append-only and
  does not advance the revision at all — grading a card is not an edit that can
  conflict with authoring.

Both surfaces reuse the chapter conflict vocabulary — **Reload latest** or
**Save mine as copy** — because a third dialect of the same idea would be a
third thing to get wrong.

Backups are domain documents rather than raw database dumps. Every included
record is validated before merge or replace starts, then every store is written
inside one transaction. Imported game data is optional but, when present,
summary/content/position stores are an inseparable triple. See ADR 0012.

### Planning a game search

`search()` never filters an array of every game. `planQuery` picks the index
that narrows most, and separately records two facts about the plan: whether the
range answers _every_ predicate (`exact`, so no record needs inspecting), and
whether walking that index already yields the requested sort order (`ordered`).
Three shapes follow, and the plan says truthfully which one it is:

| Plan                   | How the page is read                                          |
| ---------------------- | ------------------------------------------------------------- |
| exact + ordered        | key-cursor count for the total, cursor page for the rows      |
| exact, different order | order the matches, or walk the sort index testing each record |
| indexed + post-filter  | walk the narrowing index, apply the rest per record           |

`exact` is derived by counting the predicates a query carries and comparing that
with the number a branch consumed, so a filter can never be silently dropped by
a branch that forgot to mention it. Ranges are plain data (`indexeddb/key-range.ts`)
rather than `IDBKeyRange` values, which means the planner runs identically in a
browser and in a Node test — while ranges were built from the global, none of
this code was covered by any test, because the global does not exist there.

The rule the ordering exists for: **page 2 continues page 1**. Sorting only the
rows a cursor happened to hand back makes "the hundred most recent" mean "a
hundred arbitrary games, displayed in date order", and makes pages overlap.

A `player` filter means one whole normalized name, matched identically by the
index and by the per-record predicate. Partial names are what the free-text
search is for; quietly merging two people who share a surname is a worse failure
than returning nothing for half a name.

**Two things are written, and they answer different questions.** The _draft_
answers "what was on screen?" — document, tree, cursor, orientation — so a
refresh cannot destroy work that was never filed. The _chapter_ answers "what is
in my study?" and is authoritative. Both are written from one debounced pass
over the same store snapshot, so they cannot disagree.

**The draft goes first, and carries `unsaved` until the chapter write lands.**
The order matters: while the draft was written last, a chapter write that threw
— a refused revision, a full disk, a tab going away — took the session's work
with it. Writing the draft first means the work is durable before the risky
write is attempted, and the flag is also what distinguishes "the last session
ended tidily" from "there is work here nobody has seen since", which is what
decides whether a recovery is offered on startup. It is offered only when the
draft and the saved chapter actually differ; a prompt after every tidy session
is one people learn to dismiss unread.

**Chapters carry a write revision.** A workspace holds the revision it loaded
and offers it back when it saves; `saveChapter` re-reads and compares inside
the write transaction and refuses a stale write. A BroadcastChannel announces
accepted writes so a second tab finds out at once — adopting silently if it has
nothing of its own at risk, and offering to fork if it has. Nothing is merged.
ADR 0019 covers why, and why the check cannot sit outside the transaction.

**Flush points**, in order of how much they can be trusted:
`visibilitychange` to hidden (tab switch, minimise, mobile background) and
`pagehide` (navigation, bfcache eviction). `beforeunload` is deliberately not
the mechanism — it is unreliable on mobile and cannot await an IndexedDB write
anyway. The real guarantee is that the debounce is short and that ordinary
transitions save before they switch.

**Integrity.** `persistence/integrity.ts` checks that records which are
individually valid still agree with each other — a game summary with no moves,
an index entry for a deleted game, a chapter whose study is gone. Every rule
describes a relationship the schema guarantees, so a finding is a fact rather
than a suspicion, and repair only ever removes a pointer to something that
provably no longer exists. ADR 0020 lists what it deliberately will not fix.

**Autosave** debounces at 900 ms with a 5 s cap on the oldest unsaved change, so
steady annotation cannot postpone a write forever. The decision is a pure
function of timestamps (`persistence/autosave.ts`) and is unit tested without a
clock. Saves compare a monotonic `revision` against `savedRevision` rather than
diffing trees, which is what lets an edit made _during_ a write leave the
document correctly dirty.

**Ownership is explicit.** An analysis is one of three things, and the header
says which: an untitled analysis, a study chapter, or a database game opened as
read-only source material. Editing an imported game never writes back over the
imported record; "Save to study" is the one action that transfers ownership.

---

## State

Four stores, split by what the state _is_, not by which component uses it.

| Store               | Holds                                                                                      | Persisted    |
| ------------------- | ------------------------------------------------------------------------------------------ | ------------ |
| `analysis-store`    | The game tree, the cursor, orientation, undo/redo, the current document and its save state | Autosaved    |
| `engine-store`      | Engine status, identity, the latest snapshot, pinned lines                                 | No           |
| `ui-store`          | Palette / dialog visibility, active panel, notices                                         | No           |
| `preferences-store` | Themes, board and piece sets, engine defaults                                              | localStorage |

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

Pinned engine lines are deliberately session-only. A pin holds a reading still
while the search moves on; anything worth keeping is either inserted into the
tree as real moves or attached to a move as an evaluation, and both of those are
persisted. Storing live engine output would fill the database with chatter.

A running search emits a new best line several times a second, and none of it is
knowledge. An evaluation becomes study data only when a search _settles_ — the
engine finished, or the user stopped it — or when the user saves one explicitly.
That is what keeps autosave quiet while the engine runs.

---

## Workspaces and the tool dock

The research routes are one environment with different starting points, not
seven applications sharing a sidebar. Two seams make that true; ADR 0017
records the reasoning.

`ChessWorkspaceProvider` (mounted once in `AppShell`) publishes the tree, the
cursor, the FEN, the orientation and the document by reading the analysis
store. It holds no chess state of its own — a second source of position truth
is the bug class this seam exists to prevent.

`WorkspaceToolDock` renders a route's tools from one table:

| Route       | Tools                                                                           |
| ----------- | ------------------------------------------------------------------------------- |
| Analysis    | Engine, Explorer, Database, Repertoire, Features, Tablebase, Companion, Notes   |
| Studies     | Engine, Explorer, Database, Features, Tablebase, Companion, Notes               |
| Openings    | Explorer, Database, Engine, Repertoire, Model Games, Personal Results, Features |
| Repertoire  | Context, Explorer, Database, Engine, Model Games, Features, Notes               |
| Preparation | Context, Engine, Explorer, Database, Repertoire, Model Games, Features, Notes   |
| Training    | Context, Engine, Explorer, Database, Features, Tablebase, Notes                 |

Games has no dock of its own: opening a row loads the game as the workspace
document and lands on Analysis, which has the full set.

Training is the one route that gates the dock — it is not rendered at all
until the answer is revealed, because an engine evaluation beside a position
you are being asked to solve is the answer.

`stores/workspace-layout-store` persists the dock width, the collapsed state,
the selected preset (Analysis, Study, Opening Research, Preparation, Minimal
Board) and the last tool **per route**, so moving between workspaces does not
carry an unrelated tab along.

The selected tool is the only one mounted. An inactive tool therefore issues
no database query, opens no engine and makes no assistant call — the dock adds
tools to a route without adding work to it. Phase 7 extends that from runtime
work to bytes: Companion, Transpositions, Game insights, Features and Tablebase
are dynamically imported, so a route that never opens them never downloads
them. Engine, Explorer, Database and Notes stay in the route bundle because
they are what a player opens first. A lazy panel reserves its height while it
loads, so the dock does not resize under the cursor.

The dock's `document` slot is per-route context. Studies fills it with the
chapter **References** panel: typed links from a chapter to the model games,
repertoire positions and training items it is about, stored as
`studyReferences` rows rather than copies. Links are created from what is
actually at the current position — a repertoire entry, a tagged model game, an
existing training item, or a new training item created and linked in one step —
because this is a chess reference system, not a wiki. Deleting a chapter or its
study removes its references in the same transaction; a target deleted from
elsewhere reads **Missing reference** with the label it had when it was linked,
and the integrity scanner offers to drop the dead pointer.

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

**One surface, four modes.** Routes do not embed `Chessboard` directly. They
render `features/workspace/CanonicalBoardSurface`, which owns the frame, the
evaluation bar, the board controls and the position summary, and takes a mode:

| Mode          | Moves | Shapes | Used by                                              |
| ------------- | ----- | ------ | ---------------------------------------------------- |
| `interactive` | yes   | yes    | Analysis, Studies, Openings, Repertoire, Preparation |
| `read-only`   | no    | yes    | Surfaces that navigate but must not mutate           |
| `preview`     | no    | no     | Cards and thumbnails; no shape handlers              |
| `training`    | no    | yes    | Review, where legal hints would give it away         |

Cursor, tree and orientation come from `useChessWorkspace()`, so the board and
every tool in the dock read one position. The mode is passed by the surface
rather than inferred from the route — see ADR 0017 for why inferring it was a
bug rather than a shortcut.

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
  backwards and forwards costs nothing. The key is
  `['explorer', sourceId, sourceVersion, fen, filters]`: `sourceVersion` comes
  from the provider and changes when its collection does, so speed never buys a
  stale chess statement. Imports and deletions also invalidate `['explorer']`
  and `['transpositions']` explicitly, and autosaving a chapter invalidates the
  derived study queries — a chapter's moves are one of the two sources of
  stored move orders, and autosave used to change them without telling the
  cache.
- After an explorer result arrives, the two most-played continuations are
  prefetched into the same cache. Two, deliberately: on a 100,000-game
  collection, prefetching every legal move would turn one view into thirty
  aggregations.
- PGN parsing runs in a module Worker behind an acknowledged batch pipeline, so
  exactly one prepared batch is ever in flight and the producer is blocked on
  the consumer. Cancellation terminates the worker at once and resolves only
  after the batch already being written commits. See ADR 0021.
- The unfiltered SQLite opening aggregation is answered from a derived
  `position_aggregates` table maintained by triggers inside the writer's
  transaction: 0.3 ms instead of 129 ms at 100,000 games. Filtered queries still
  read `positions JOIN games`, because an all-time total cannot answer
  "Elo ≥ 2400". See ADR 0023.
- Dialogs and uncommon workspace tools are dynamically imported _and_
  conditionally mounted, so a closed dialog neither fetches nor evaluates its
  implementation. Engine, Explorer, Database and Notes stay in the route bundle:
  they are what a player opens first, and a loading flicker there costs more
  than the bytes save. Lazy panels reserve their height so the dock does not
  jump.
- Background analysis runs one engine and yields the moment interactive
  analysis starts. See ADR 0022.
- Game lists read 100 indexed summaries per page. Opening a row is the boundary
  that joins its tree back in.
- Opponent preparation is bounded at 1,000 full games and loads them in one
  transaction.
- Local exploration uses point reads for rare positions and a bulk summary join
  above 500 matching games. The persistent provider performs IndexedDB lookup,
  filtering and aggregation in a module Worker — one worker per query, torn down
  when it answers, so a result for a position the user has already left cannot
  arrive after the one they are looking at. When a module Worker cannot start at
  all, the query falls back to the main thread rather than reporting an empty
  database, which would read as "no games reach this position".

The 1k/10k/50k measurements are in `docs/performance/phase-3-indexeddb.md`,
from two independent runs that disagree on absolute numbers by two to three
times and agree on every conclusion drawn from them; `scripts/bench-indexeddb.js`
reproduces the second. The SQLite, import, bundle and responsiveness
before-and-after figures, together with the performance budgets and what was
deliberately left unmeasured, are in
`docs/performance/phase-7-speed-and-scale.md`; `npm run benchmark` reproduces
them. The heaviest route now ships 289 kB of gzipped JavaScript, down from
309 kB, while total emitted client JavaScript rose from 1,257 kB in 26 files to
1,373 kB in 60 — which is what code splitting looks like when features are
being added at the same time. No runtime dependency was added in Phase 7.

---

## Testing

576 tests across 46 files, all on the parts where being wrong is expensive.

| Area              | Covered                                                                                                                                                                                                                           |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FEN               | Valid parses, 11 kinds of malformed input, en passant rank rules, round trip, position key                                                                                                                                        |
| Position          | Legal move generation, castling (including through check), en passant, promotion, checkmate, stalemate, insufficient material, illegal positions                                                                                  |
| Game tree         | Add / dedupe / delete / truncate / promote / promote-to-main-line, path and line walking, ply numbering from a custom FEN, annotation toggles                                                                                     |
| Game              | Line insertion in SAN and UCI, threefold repetition along a line                                                                                                                                                                  |
| PGN               | Tokenizing, nested variations, comments and pre-comments, NAGs and suffix glyphs, `[%cal]` / `[%eval]` / `[%clk]`, FEN tag, illegal-move recovery, multiple games, serialization and round trip, a complete annotated master game |
| Evaluation        | White-POV conversion, formatting, ordering with mate scores, winning chances                                                                                                                                                      |
| UCI               | `info` with every field, mate scores, bounds, `bestmove`, options, command formatting                                                                                                                                             |
| Database          | Position aggregation, transpositions, rating averaging, player and date filters, performance rating                                                                                                                               |
| Analysis store    | Navigation, variation creation, editing, undo/redo including redo invalidation, PGN/FEN load and export                                                                                                                           |
| Board layout      | Pointer-to-square conversion in both orientations and animation identity across ordinary moves, promotion, and castling                                                                                                           |
| Providers         | Explicit handling of authentication-required Lichess explorer responses                                                                                                                                                           |
| Variations        | Reordering as a pure permutation — every node, parent, position, comment and descendant compared before and after; promotion from inside a nested line; whole-side-line deletion                                                  |
| Persistence       | Study and chapter CRUD, ordering and gap-closing on delete, cascade delete, duplication, refusal to resurrect a deleted chapter; draft save/restore; corrupted-record rejection                                                   |
| Round trip        | A chapter with a nested variation, multi-line comments, NAGs, arrows, highlights and saved evaluations — stored, reloaded and compared node by node, then exported to PGN and reimported                                          |
| Migrations        | Contiguous versions, every store and index created on a fresh database, nothing replayed over an existing one                                                                                                                     |
| Position key      | Counters ignored, castling distinguished, en passant kept only when usable, transpositions merged                                                                                                                                 |
| Import            | Multi-game files, stage ordering, duplicate skipping, cancellation, damaged-game accounting, position-index entries                                                                                                               |
| Explorer          | Result and rating aggregation, popularity ordering, transposition merging, per-game counting, filters, deletion and clearing                                                                                                      |
| PV insertion      | Structured insertion, branch reuse, variation creation, comment and evaluation preservation, idempotence, stale-line rejection with the tree left untouched, undo                                                                 |
| Autosave          | Debounce, the cap that stops steady editing postponing a write forever, no concurrent writes                                                                                                                                      |
| Repertoire        | Line authoring, explicit opponent replies, transposition convergence, roles, coverage, evidence-backed gaps deduplicated by position, and own/opponent deviation                                                                  |
| Repertoire PGN    | Position map to playable line, variations for alternatives, rejected moves as prose, transposition cut-off, and reparsing what was written                                                                                        |
| Game search       | Whole-name identity, ordered pages that neither repeat nor skip, totals across the match set, and every predicate applied when the index answers only one                                                                         |
| Training answers  | Accepting any recorded move, partial candidate sets, band comparison, and refusing to grade prose mechanically                                                                                                                    |
| Preparation       | Exact identity, factual profiles, transposition-aware trees and prepared/gap comparison                                                                                                                                           |
| Training          | Every grade transition, interval previews, queue stages, review history and transactional deletion                                                                                                                                |
| Backup            | Portable/full export, validated merge/replace, game preservation, unique-index collisions on merge, and rollback on malformed input                                                                                               |
| Global search     | Studies, chapters, games, players, repertoires, training, model games and tags                                                                                                                                                    |
| Chapter revisions | A refused stale write, the winning record handed to the loser, renames and reorders moving the revision on, a reorder that changes nothing leaving it alone, and the v4 backfill                                                  |
| Data integrity    | Each rule against a fixture that breaks exactly one relationship, the healthy cases that must produce no finding, safe repair, and the refusal to delete anything not marked repairable                                           |
| Diagnostic report | No configured secret present, no prefix of one, a secret redacted out of an error message, an unknown bearer token redacted, and ordinary text left alone                                                                         |
| Provider retries  | Network errors retried once; rejected credentials, rate limits, schema mismatches and misconfiguration never retried; `Retry-After` in seconds and as a date; request deadlines                                                   |
| Transpositions    | Move orders read from stored trees, a genuine transposition found and a near-miss rejected, merging across sources, ordering by frequency then length, and excluding the order the reader is already on                           |
| Import hardening  | A broken game beside good ones, Unicode names, a 2,000-character event, a 20,000-character comment, nested variations, SetUp/FEN, the same game twice, a moveless pairing, and interrupted-import consistency                     |

Run with `npm test`.

### Browser tests

Eighteen Playwright specs in `e2e/`, run with `npm run test:e2e` against a real
dev server and a real Stockfish build. They exist because the failures these
phases fixed — a board that did not track the selected node, tools missing from
a route, a provider reporting a `401` as an empty database, a chapter silently
overwritten by another tab — are all invisible to unit tests.

| Spec              | Covers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Routes and mobile | Every section reachable from the sidebar, the mobile bar and the drawer; no horizontal overflow                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Shared position   | A move in Analysis, saved to a repertoire, a PGN imported and opened from Games, explored locally                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Studies           | Chapter creation, moves, a variation, a drawn arrow, Engine and Explorer and Database inside Studies, and the annotation surviving a reload                                                                                                                                                                                                                                                                                                                                                                                                         |
| Canonical board   | Castling, en passant, promotion, two checks, orientation, and all five external piece sets                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Training          | The dock absent before reveal and present after it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Viewport matrix   | Eleven sizes from 320×568 to 2560×1440, each square and overflow-free                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Lichess contract  | Token attached as `Bearer`, connection test, explorer results, and board/piece preferences persisted                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Explorer failure  | A source that cannot answer states why instead of loading forever, while a local source still answers                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Reliability       | Work surviving a reload; a stale second-tab write refused and forked; re-import adding nothing; the report carrying no token; the integrity scan finding and repairing a planted orphan; Continue reopening the right document; transpositions listing only stored orders; an engine surviving rapid navigation and a restart                                                                                                                                                                                                                       |
| Viewports         | Nine routes at ten widths from 320×568 to 2560×1440, none scrolling sideways                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Phase 7           | A 20,000-game worker import backgrounded, kept responsive (longest main-thread gap under 500 ms) and cancelled cleanly; repertoire and training stale writes offering the same two choices; chapter references linked, opened and counted; saved filters surviving a reload; storage facts shown; the analysis queue paused, reloaded, resumed, yielding to interactive analysis and leaving real stored evidence; a 1,008-ply chapter imported, navigated, branch-switched, saved and reopened; an imported game still on the board after a reload |
| Soak              | Eight cycles of new-analysis, moves, engine start/stop, tool switching and route switching through client-side navigation, with `Worker`, `BroadcastChannel`, `EventSource`, `setInterval` and window listeners counted before and after                                                                                                                                                                                                                                                                                                            |

Every spec asserts the console produced no errors or warnings. Nothing in the
suite touches the real Lichess API, the public tablebase, an assistant endpoint
or a native engine: those belong to the opt-in scripts below, because a CI
suite that depends on them fails for reasons nobody changed.

### Scripts outside CI

| Script             | Answers                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------- |
| `smoke:lichess`    | Does the live API still match the providers? Token from the environment only, never printed |
| `benchmark`        | Every reproducible local suite in one run, with the environment in its output               |
| `bench:sqlite`     | SQLite import and query latency at 10k and 100k games, both explorer paths                  |
| `bench:pgn`        | PGN parse throughput in browser-equivalent code                                             |
| `bench:aggregates` | Explorer aggregate lookups with a large aggregate table                                     |
| `bench:engines`    | How long each native engine takes to reach `uciok`, `readyok` and a first line              |
| `bench:evidence`   | How long assembling and rendering a companion evidence packet takes                         |
| `bundle:report`    | Initial JavaScript per route, from a production build                                       |
| `bench-indexeddb`  | The Phase 3 local-database measurements                                                     |

---

## Continuous integration

`.github/workflows/ci.yml` runs on pushes to `master` and on pull requests
targeting it, in three jobs. `quality` runs typecheck, lint, format, the unit
suite and `git diff --check`; `build` runs the production build; `e2e` installs
Chromium and a real Stockfish and runs Playwright, uploading traces,
screenshots and video when it fails.

Only the npm download cache is kept — never `node_modules` — so every run
proves that a fresh checkout installs. Playwright browsers are cached by
resolved version, so a dependency bump fetches new ones rather than testing
against stale ones. Stockfish is deliberately not cached: the suite starts a
real engine, and a cached copy would let a broken installer pass unnoticed.

No credentials are installed. The authenticated Lichess paths stay
contract-tested against a routed network.

### The scheduled Lichess contract check

`.github/workflows/lichess-smoke.yml` runs `npm run smoke:lichess` against the
real API weekly (Mondays, 06:23 UTC) and on manual dispatch. It is a separate
workflow on purpose: ordinary CI must never depend on a third party's uptime or
on a credential, and this check exists precisely to fail when Lichess changes
something nobody in this repository changed.

The token comes only from the `KINGFISHER_LICHESS_TOKEN` repository secret, is
passed only as an environment variable, and is never printed — the script reads
it from the environment and its error messages deliberately omit request
headers.

A first job decides whether the secret exists. If it does not, the run ends
having said `Lichess smoke skipped: KINGFISHER_LICHESS_TOKEN is not configured`
and the contract job never starts. It does not pass by pretending Lichess was
checked. To enable it, the repository owner adds a scope-free Lichess API token
at **Settings → Secrets and variables → Actions → New repository secret**, named
`KINGFISHER_LICHESS_TOKEN`. If the authenticated responses stop validating, the
contract job fails and GitHub surfaces it.

---

## Roadmap

Phase 1 built the workspace. The order below is chosen so that each phase makes
the next one cheaper.

**Phase 2 — games and persistence.** _Done._ IndexedDB behind repositories,
studies and chapters with autosave, a local game database with position
indexing, and an explorer that answers from your own games.

**Phase 3 — preparation and training.** _Done._ Position-keyed repertoires,
opponent reports, model games, personal-game deviation evidence, deterministic
training, transactional backup, cross-entity search and measured 50k-game local
queries.

**Phase 4 — deeper study tooling.** Study-level search/navigation, repertoire
import/export formats, and richer training authoring over complete variations.

**Phase 5 — understanding.** Position feature extraction (pawn structures, weak
squares, outposts, king safety), and a move classifier that weighs evaluation
swing against complexity, uniqueness of the best move and depth stability —
deliberately not a threshold on centipawn loss.

**Later — assistance.** A `ChessContext` assembled from engine output, database
evidence, position features and the user's own history, so that an explanation
is grounded in structured evidence rather than generated from a number.
