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
    features.ts            Counted structural facts; pawn half split for reuse
    structure.ts           Pawn-skeleton key and structure signature. ADR 0024
    tree/                  MoveNode, GameTree and their pure operations
    pgn/                   Tokenizer, parser, serializer, %-command handling
  engine/                  EngineProvider / EngineSession / EngineAnalysis
    uci.ts                 Pure UCI parsing
    pv.ts                  UCI variations → readable SAN
    trust.ts               What running each kind of engine means. ADR 0041
    stockfish/             WASM-in-a-worker implementation
  book/                    Opening books, which are not the explorer. ADR 0043
    polyglot.ts            Zobrist key and the .bin reader
    kingfisher-book.ts     A book derived from the installed reference
    registry.ts            Books in priority order, never merged
  reference/               The data catalog and its packs. ADR 0039
    pack.ts                The on-disk format, and its only codec
    reader.ts              Chunk → rows, with a bounded shard cache
    install.ts             Download → verify → store, all-or-nothing
    manager.ts             The one place that knows what exists right now
    sources.ts             Packs, services and collections as one list
    legends.ts             106 historical players no open archive contains
  database/                ChessDatabaseProvider and the normalized result model
    local-index.ts         In-memory position index (pure, used by tests)
    cache.ts               The explorer query-cache ceiling
    providers/             Lichess explorer, PKCE sign-in, local collection
  theory/radar.ts          Move shares over three date windows. ADR 0026, 0024
  repertoire/              Repertoire rules, and the transposition graph
  tablebase/               Providers, priority and provenance. ADR 0031
  persistence/             Local-first storage. See ADR 0008.
    schema/migrations.ts   Versioned stores and indexes; an ordered array
    indexeddb/database.ts  The IndexedDB wrapper: transactions, error mapping
    indexeddb/memory.ts    Same interface in memory, for tests
    domain.ts              Repertoire, training, model-game, decision, review
                           queue and training-set records
    backup.ts              Versioned validation and transactional restore
    search.ts              Bounded cross-entity command search
    position-search.ts     Everywhere one canonical position is stored
    structure-backfill.ts  Indexing an old collection in place
    repositories/          Studies, games, drafts, repertoire, training, library
    validation.ts          Runtime guards for everything read back out
    import-game.ts         PGN → parse → normalize → persist → index
    autosave.ts            Pure debounce-with-a-cap scheduling
  features/                UI, one folder per product area
    workspace/             The shared workspace seam. See ADR 0017.
      ChessWorkspaceContext.tsx  Read-through view of the analysis store
      CanonicalBoardSurface.tsx  The one full-size board pipeline
      WorkspaceToolDock.tsx      Route → tool table, and the tool host
    databases/             Data-source management, the reference catalog, health
    book/                  The book panel, and the book manager in Settings
    player/                One player's profile, and the player library
    review/                Self-analysis, the decision journal, the critical
                           queue, scheduling and journal analytics. ADR 0025
    calculation/           A calculation tree and the blindfold. ADR 0030
    preparation/           Sessions, dossiers and the game-day sheet. ADR 0029
    opening-files/         One opening subject, and its references
    endgame/               The endgame library
    model-games/           Guess-the-move
    theory/                The radar panel
    movetree/flatten.ts    One flattening pass, so the tree can be windowed
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
  ├── ReferencePackProvider                a bundled or installed reference pack
  ├── LichessExplorerProvider('masters')   over-the-board master games
  ├── LichessExplorerProvider('lichess')   online games, rating/speed-filterable
  ├── LichessExplorerProvider('player')    one player, indexed on demand
  ├── CompanionSqliteProvider              a local SQLite collection, if paired
  └── LocalCollectionProvider              your imported PGNs, indexed by position
```

`ReferencePackProvider` is the one that makes a fresh installation useful, and
it is the explorer's default. It reads an installed pack — `src/reference/` —
and is a provider like any other, which is the point: the explorer, the
position report and preparation all talk to `ChessDatabaseProvider`, so the
bundled reference works everywhere a database does without a single surface
learning what a pack is.

Its declared capabilities are deliberately narrow. A pack stores per-position
aggregates, so it _cannot_ answer "rated 2600+ only" or "since 2024" — see ADR
0023 — and it says `ratingFilter: false`, `dateFilter: false`,
`playerFilter: false` rather than accepting a filter and ignoring it. What it
does carry is a second set of counters built alongside the totals, restricted
to a `recentSince` year the manifest names, which is the one date comparison an
aggregate can make honestly. The explorer shows the two apart, because "recent"
means a different window in each case.

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
authentication. Settings → Accounts connects an account through OAuth with
PKCE (ADR 0042) — no secret, no scopes requested, no token to paste — and a
personal token remains under Advanced. Without either, the provider fails as
`authentication-required` before sending anything, rather than issuing a
request it knows will 401 and reporting the result as an empty position. The
explorer panel then names the source that failed and offers the bundled
reference, which is on the machine and answers with the network off. `401`, `403`, `404`, `429`, `5xx`, timeouts and unparseable
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

### The compact position index

In a SQLite collection the position index and its indexes are **81% of the
file**, and three of its columns repeat between five and nine times over as
text while a fourth — the FEN — is the position key with two integers on the
end. `companion/src/position-schema.mjs` makes those three integer ids into
lookup tables and the FEN two integers, which on real games is **41% off the
whole database** with no cost to the explorer.

Three things about it are load-bearing.

**A database does not migrate itself when it is opened.** The migration
rewrites the table holding most of somebody's data; a collection that did it on
open would hang on open. `positionSql()` resolves which schema a file is on
once, so the reader is the same code either way and no query carries a runtime
conditional.

**It commits per chunk, not once.** One transaction over four million rows
builds a write-ahead log the size of the table before it commits, which on the
collections where this is worth doing is the failure it exists to avoid. Each
chunk is committed with the cursor that says it is done, so an interrupted
attempt resumes rather than restarting.

**Nothing is destroyed until it is proved unnecessary.** The text columns stay
the source of truth until every encoded row has been shown to reproduce them;
a mismatch aborts with them intact. Only then are they dropped and the space
reclaimed, and the preflight refuses to start when there is not room for the
VACUUM's second copy.

---

## The data catalog

`src/reference/` is where "a database" stopped meaning two unrelated things.

```
reference/
  pack.ts        the on-disk format: manifest, chunk kinds, line codecs
  reader.ts      chunk → decoded rows, with an eight-shard LRU
  store.ts       installed packs and their chunk bytes, in IndexedDB
  install.ts     download → verify → store, resumable, all-or-nothing
  catalog.ts     the packs this build knows how to obtain
  manager.ts     the one place that knows what exists right now
  sources.ts     packs + providers + the user's switches, as one list
  players.ts     search across every installed pack, plus the roster
  legends.ts     106 historical players the open archive cannot contain
```

`manager.ts` owns three things that have to agree: the packs stored in this
browser, the `ChessDatabaseProvider`s the explorer queries, and the catalog
rows the settings UI lists. Keeping them in one module rather than three hooks
is what stops a removed source still being offered, or a freshly installed one
not appearing until a reload. It lives outside React, because providers do.

`sources.ts` composes packs, the remote services and the companion's SQLite
collections into one `ReferenceSource` list carrying provenance, state and the
user's switches, and provides the one function every surface should use to
decide what to ask: `useSourcesFor(capability)`. Sources are never merged. A
caller takes the first that can answer, or shows several side by side, but two
populations are not added together — "34%" means nothing without knowing which
database it came from.

The pack format, the filters and the build pipeline are described in
[`docs/data/reference-packs.md`](docs/data/reference-packs.md); ADR 0039 covers
why a pack is installed rather than served.

---

## Opening books

A book and an explorer answer different questions, and ADR 0043 is why they are
different panels. `src/book/` holds:

- `polyglot.ts` — the Zobrist key and the `.bin` reader. A binary search over
  the sorted key array, so a hundred-megabyte book costs two or three reads per
  position. The en-passant square is hashed only when the capture is really
  available, and castling arrives as king-takes-own-rook and is translated.
- `polyglot-constants.generated.ts` — the 781 constants the format is defined
  by, generated with a check against the specification's published key for the
  initial position.
- `kingfisher-book.ts` — a book derived from whichever reference sources are
  installed, so a user who has never added a `.bin` still has one.
- `registry.ts` — books in priority order, never merged.

Engines are sent `setoption name OwnBook value false` at session construction.
Not a preference: an engine answering from an internal book returns a move with
no search behind it, and the panel would report that as an evaluation.

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

**Any UCI engine can be added**, not only the six the catalogue knows. The
engine layer needed nothing for this — capabilities have been read from the
engine rather than tabulated since Phase 6 — so what registration adds is
trust, not plumbing. `POST /engine/register` is the one companion route that
accepts a filesystem path rather than a resource key, and a path only becomes a
key after two checks: that it is a real executable file, and that it completes
a full `uci` → `uciok` → `isready` → `readyok` handshake. `/bin/ls` is
executable; only the handshake establishes that a binary is an engine. The
handshake has its own timeout and always cleans up after itself, so a binary
that hangs or crashes produces a specific rejection rather than a destabilised
companion. Keys are derived from the path, so re-registering the same binary
resumes rather than duplicating, and a registration whose file has since gone is
dropped at load. Once registered, a custom engine is indistinguishable from a
catalogue one: same provider, same session, same selector. Its search family is
recorded as `unknown` rather than guessed, because the family exists to explain
_why_ two engines disagree and a wrong guess would misrepresent exactly that.
See ADR 0036.

**Getting an engine is now part of the application.** Settings → Engine →
Engines lists the catalogue for this platform with Install buttons.
`companion/src/managed-engines.mjs` downloads from the project's own release
page, checks the SHA-256 against `scripts/engine-digests.json`, makes the file
executable, and then interrogates it: `companion/src/engine-verify.mjs` runs
nine checks — handshake, isready, a real search, stop, MultiPV, `searchmoves`,
WDL, Syzygy, and an option that does not exist which the engine must survive.
Handshake and search are fatal and delete the download; the rest are recorded
as capabilities and shown on the row.

That verification is not thoroughness for its own sake. Halogen 16 answers
`go … searchmoves` with "unable to handle command", and Viridithas 20 publishes
no `MultiPV` option at all. A catalogue that declared those would have been
wrong about exactly the cases that matter.

**The trust model is three levels and the UI shows the right one.**
`src/engine/trust.ts` names them: the browser engine is genuinely sandboxed by
the browser; a managed native engine is verified and runs with the user's own
operating-system permissions, which the interface says in those words; a custom
one is the user's own program. ADR 0041 records why no OS sandbox is claimed
for a binary, and `trust.test.ts` fails if the word "sandboxed" ever appears
against a native level.

Two engines may run at once and they split the thread budget. Two is a hard
limit: a third search takes cores from the interface. `engine/comparison.ts`
reports top-move agreement, PV divergence and the evaluation gap, and refuses
to subtract a mate score from an evaluation. See `docs/ENGINES.md`.

## The desktop shell

`desktop/` is an Electron application that serves the same Next.js application
the browser runs and owns the two local processes it needs. It adds no chess
code and holds no chess state: the renderer is the unmodified web application,
and the entire surface between them is `desktop/src/preload.cjs` and
`src/desktop/bridge.ts`, which returns `null` in a browser.

Why Electron and not Tauri is a measured decision in
[ADR 0049](docs/adr/0049-the-desktop-shell.md), and it turns on two facts. The
browser engine is a multi-threaded WebAssembly Stockfish, which needs
`SharedArrayBuffer`, which needs cross-origin isolation — and under Tauri's
WKWebView `crossOriginIsolated` stays `false` even with COOP and COEP declared.
And the companion is Node: Electron 44 embeds Node 24.20 with `node:sqlite` and
`worker_threads`, so it is forked unmodified rather than rewritten in Rust or
shipped beside a 119 MB Node.

Four rules hold here and are the ones to keep:

- **The shell owns the companion's lifetime, and the shutdown is a contract.**
  `SIGTERM` first, so the companion runs its own `stopAll` and ends its
  engines; escalation if it will not go; and an IPC channel the companion
  watches, so a shell that is _killed_ rather than quit still takes its engines
  with it. Engines are spawned detached, in their own process groups, which is
  exactly the property that lets them outlive a parent nobody told to stop.
  `desktop/src/services.test.mjs` forks real processes and asserts all three.
- **Native file access goes through one boundary.** Everything the renderer can
  read was chosen in a dialog or dropped on the window; there is no
  `readFile(path)` on the bridge, deliberately. A collection opened by path
  goes through `/db/attach`, which opens the file read-only and refuses
  anything that is not already a Kingfisher collection.
- **The web build is not changed to suit it.** Standalone output and
  cross-origin isolation are opt-in behind environment variables that only
  `scripts/build-desktop-web.mjs` sets.
- **A platform claim needs evidence — from the packaged bundle.**
  `npm run desktop:certify` drives the real `Kingfisher.app` electron-builder
  produced, through Playwright, and checks the things only the shell can be
  wrong about: the smoke's seventeen (launch, bridge, isolation, companion,
  a PGN from the command line, a tablebase probe, nothing survives the quit),
  the window chrome, restart, the engine fleet, suspend, a seeded walk with
  invariants, and the DMG. The checkout shell is a development convenience.
  Every packaged build from Phase 35 to Phase 45 launched and exited before
  a window because the bundle held no server, and the harness of the day
  reported it as a Playwright timeout; `desktop/src/builder-config.test.mjs`
  and `scripts/desktop-lib/launch.mjs` are the two things that make that
  impossible to miss again. README states which platforms have actually
  been run.

### What a packaged bundle is

`Resources/app.asar` holds the shell (`desktop/src/`). Under
`Resources/kingfisher/` — unpacked, because they are spawned or served —
sit the Next.js standalone server and its static assets, the companion
source, the engine catalogue and digests, the sanitised engine records and
the Syzygy probe helper. `desktop/src/paths.mjs` resolves that layout and
`desktop/electron-builder.yml`'s `extraResources` block produces it; the
two are cross-checked by test.

The bundle records its **identity** — marketing version, build number
(`git rev-list --count HEAD`), commit, dirty flag and channel — in
`CFBundleVersion` and the packaged `package.json`
(`desktop/src/build-identity.mjs`), and _Settings → Diagnostics_ reports
them. The channel decides two things: the DMG's filename (a `preview`
carries its build number, so two previews never collide and no published
bytes are ever overwritten) and what _Check for Updates…_ does.

### Updates

One service, in the main process (`desktop/src/update-service.mjs`,
`kingfisher-updater.mjs`). The user's click is the only network event. A
`stable` build asks `electron-updater`, configured with the GitHub
provider baked into `app-update.yml` and with auto-download,
install-on-quit, pre-releases and downgrades all off; it is offered only a
strictly newer release that carries `latest-mac.yml`. Installing runs
download → SHA-512 → the renderer's save barrier → macOS's own update
engine, which refuses an update whose signature does not match the running
application. A `preview` build asks nothing: it answers with its build
number and a button to the download page. The dialog is its own
`BrowserWindow` with a three-channel preload that `update-window.mjs`
answers; `update-window.test.mjs` reads the preload and checks every
channel has a handler, because for ten phases none did.

The public DMG is named in one place, `src/release/macos-download.json`,
which the landing, the install guide, `docs:check` and
`desktop:public:verify` all read.

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
LinkedAccountRepo      linked Lichess/Chess.com usernames and their sync cursors
```

Fifteen object stores are created by a versioned migration array, never by
deleting the database. Schema v3 moves trees and normalized PGN into
`gameContent`; lists, search and explorer read only `games` summaries. Phase 3
adds repertoires/positions, training items/reviews, model-game links and the
explicit personal profile. Schema v4 adds chapter revisions; v5 extends
revisions to repertoire positions and training items; v6 adds `studyReferences`
with a unique `(chapterId, kind, targetId)` index; v7 adds `analysisQueue` and
`engineEvidence`. Schema v11 adds `linkedAccounts`. Records are validated on the
way out, because a record written by an older build is plausible and malformed
data must not reach the board.

Every one of those versions now has a **historical migration fixture**: a real
IndexedDB database opened at that version, seeded the way a session at that
version would have seeded it, closed, and reopened at the current version so the
real upgrade path runs against real data. What is asserted afterwards is
semantic equality, not "it did not throw" — a chapter's tree with its comments
and its side variation compared byte for byte, a v1 game's fields untouched
beside the player keys the v2 backfill added, references and queue jobs still
resolving through their indexes, and a position indexed before v9 absent from
the structural indexes rather than fabricated into them.

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

`features/workspace/modules.ts` is the single catalogue: each module's label,
its home region, the regions it may be moved to, and which workspaces offer it.
This used to be three separate literals — a label map, a route table and a
render switch — which is how `personal-results` came to be listed on a route
whose dock never rendered it.

Games has no dock of its own: opening a row loads the game as the workspace
document and lands on Analysis, which has the full set.

Training is the one route that gates the dock — it is not rendered at all
until the answer is revealed, because an engine evaluation beside a position
you are being asked to solve is the answer.

### Regions and placement

Phase 10 turned the dock from _the_ place a tool lives into one of three named
regions. A workspace is a board plus:

| Region    | What it is                                            |
| --------- | ----------------------------------------------------- |
| `dock`    | The side column, or a bottom sheet on a narrow screen |
| `lower`   | An optional panel beneath the board                   |
| `primary` | The board column itself                               |

There is no pane tree, no floating window and no arbitrary drop target, and
that constraint is the design. It keeps the board large, keeps the number of
reachable layouts small enough to test, and lets a layout be a plain record
that survives a schema change. Kingfisher is chess software, not an IDE.

`features/workspace/layout-model.ts` holds the rules and imports neither React
nor storage, so what a layout _means_ is testable without a browser. A
`WorkspaceArrangement` is:

```
placement    Partial<Record<ModuleId, Region>>   sparse: only the differences
active       Partial<Record<Region, ModuleId>>   the selected tab per region
dockWidth    320–640
lowerHeight  140–520
dockCollapsed
```

`placement` is sparse on purpose: a module absent from it sits in the home
region its descriptor declares. That is what lets a later phase add a module
without every saved layout needing a migration to mention it.

Two resolution rules carry most of the weight. `activeInRegion` falls back to
the first module present when the stored selection has moved elsewhere —
otherwise moving the active tool to the lower panel leaves the dock selecting
something that is not in it, rendering nothing and looking broken. And
`moveModule` selects the module in its new region, so a move is visible rather
than appearing to do nothing.

The move tree's home is `lower`, not `primary`, and that is load-bearing.
Stacking a fixed move tree _and_ a lower panel under the board took the board
from 490px to 277px on a 1440x900 screen while this was being built — exactly
the shrunken board the design forbids. Making the move tree the lower panel's
default occupant means the default layout is what it always was, moving the
engine down puts it in a _tab_ beside the move tree rather than below it, and
moving the move tree away gives its height back to the board. A Playwright
test holds the board above 400px at that viewport.

### Presets, saved layouts and reset

Eight presets (Analysis, Opening Research, Study, Preparation, Calculation,
Review, Endgame, Minimal) each express an opinion about what a kind of session
needs on screen. Users save their own under any name; a saved layout stores
arrangement only and never which document or position was open, because
"Tournament Prep" is a shape of workspace and restoring it should not drag last
month's document back with it.

Reset **removes** the stored entry rather than writing the default into it, so
a workspace nobody has touched and one that has been reset are the same thing.
Storing an explicit "this is the default" record is how saved layouts start
silently pinning themselves to an old default. Reset is two clicks from
anywhere a layout can be broken, and Diagnostics has "Reset all layouts": a bad
drag must never require clearing `localStorage` by hand.

### Devices and migration

Arrangements are keyed `${device}:${workspace}` where device is `desktop` or
`compact`, split at the same 1100px breakpoint the dock has always used. A
phone cannot honour a three-region desktop arrangement and does not try:
modules placed in `lower` fold into the single bottom sheet, and they stay
_visible_ in the tab strip rather than being pushed into More — on a desktop
they had a panel of their own, and demoting the move tree to a menu entry
because the screen got narrower loses it where it is hardest to find again.

The store is at version 3. Version 2's single dock width, collapsed flag and
per-route active tool all have equivalents here and are carried across rather
than dropped: making every user re-arrange every workspace after an update is
the failure the migration exists to prevent.

Persistence is debounced through `lib/debounced-storage.ts`. Zustand's persist
middleware serialises the whole store synchronously on every `set`, and the old
resize handler called it on every `pointermove` — several hundred synchronous
JSON writes on the pointer thread for one drag. Reads go through the pending
value so a read after a write still sees it; only the trip to disk is delayed,
and it is flushed on `pagehide` and on becoming hidden.

### Tabs, pinning and availability

Phase 9 rendered every tool as an equally weighted tab in a horizontally
scrolling row — thirteen of them on Analysis, so the last five sat off-screen
behind a scrollbar most people never noticed. The strip now shows the route's
own context panel, the pinned tools, and the active one; everything else is
behind a single **More**. Tabs are 32px with real words on them: miniature
navigation is cheap to add and expensive to use.

The route's context panel (Journal on Review, Opening tree on Preparation,
References on Studies) is always in the strip. It is the reason that route
exists, and putting the most important tab on a page behind a menu is the
discoverability failure, not a cure for it.

A tool that cannot help says why rather than disappearing — "Available for
positions with 7 pieces or fewer. This one has 32." A tool that vanishes
teaches the user the application is unreliable; one that explains itself
teaches them how it works.

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

## Studying your own thinking

The Review workspace inverts the direction every other route runs in. Everywhere
else, Kingfisher's job is to put evidence in front of the player as fast as
possible. In `/review` its job is to withhold it until the player has committed
to a judgement — because a player who opens a position with the evaluation
already on screen reads rather than calculates.

**The gate is state, not discipline.** `review-session-store` holds whether the
current decision has been revealed, and the tool dock consults it: engine,
explorer, tablebase, repertoire, structure and model games render a statement
that computer evidence is hidden during self-analysis, rather than rendering
empty. "Empty" and "withheld by your own choice" are different states, and a
workspace that shows the first when it means the second looks broken.

**The record is structured and, after reveal, immutable.** A `DecisionRecord`
carries candidate moves entered on a board, an evaluation estimate as a band and
an optional number, a plan, calculation notes and the move the player would
play. `revealedAt` is set once and never cleared, and `updateDecision` refuses
once it is set — the only write allowed afterwards is `annotateDecision`, for
themes and notes. Tagging what happened is not rewriting it; editing a plan
after seeing the engine is.

Nothing in the record is generated. There is no field the application writes an
opinion into, and the reveal panel is called a comparison rather than a score:
outside tablebase-eligible positions the engine is strong evidence, not truth.

**The queue carries its reason.** `ReviewItemRecord` is the work-queue entry a
critical mark cannot be, because a tree cannot be filtered, counted or worked
through. A suggested item states the fact that produced it — an evaluation
swing, a change of top move, a MultiPV separation, a repertoire deviation, a
tablebase result change — in those terms, and is never labelled a blunder or a
mistake. Nothing is auto-accepted into the study system.

**Themes are the player's.** A starting taxonomy plus custom tags, assigned by
hand. Deriving a theme from an engine score would be inventing a diagnosis from
a number that does not contain one, and every count in the improvement summary
opens the positions behind it rather than standing as a statistic.

See ADR 0025.

---

## Preparing for a game

Everything before Phase 9 could prepare an _opening_. A `PreparationSession`
prepares a _game_: an opponent, a colour, a round, a date. The distinction
matters because it decides what the evidence is even about — a dossier for the
player with Black is a different document from one for the same player with
White.

**A session holds ids, not copies.** Repertoires, studies, opening files, model
games and review items are referenced, so a session opened four days later
shows what those records say now. A player who prepares on Tuesday and plays on
Saturday edits their repertoire in between, and a folder of copies would show
them Tuesday's lines without saying so.

**The game-day sheet is the exception, and it is the reason for the rule.** It
is the document read twenty minutes before the round, and it is not derivable:
which eight positions matter is a judgement, and the value of a preparation
sheet is entirely in what was left off it. So a card owns its FEN, its line and
the player's own reason — it must read correctly when printed, exported, or
opened on a phone in a playing hall with the database unavailable.

`preparation/dossier.ts` answers the three questions a tree cannot: what they
play, what has changed between two windows, and which move orders they use.
Move-order fingerprints are written rules over the opening moves — "1.Nf3
before d4", "castled after move ten" — each falsifiable by opening the games it
returns. Nothing here infers a tendency, and there is deliberately no code path
that could produce a sentence about what an opponent "prefers".

See ADR 0029.

---

## Calculating before looking

The same discipline as self-analysis (ADR 0025), for a position being
calculated now. The artefact is different: a review captures a judgement, a
calculation captures a _search_, and a search has a shape.

`features/calculation/tree.ts` is a scratch tree, deliberately not a
`GameTree`: no revisions, no undo, no save path, because it is free until
submitted and most of it is discarded. Moves advance the position, so entering
1...Rd8 2.Qe2 walks the variation the way it is calculated. The candidate list
is derived from the tree's roots rather than maintained beside them, so the two
cannot disagree.

**The gate lives inside `WorkspaceToolDock`.** This is the load-bearing part.
The dock reads the calculation store directly rather than taking a `locked`
prop from each workspace, because a guarantee that depends on nine call sites
remembering is one refactor away from leaking an engine line into a session
somebody asked to be blind.

Submitting writes the same `DecisionRecord` self-analysis writes, with the tree
attached, so a calculation lands in the same journal with the same
frozen-at-reveal guarantee and feeds the same analytics.

See ADR 0030.

---

## Where a tablebase answer comes from

`tablebase/` splits capability from probing, and the split is the design.

Capability is read from the files: the companion scans the configured directory
and derives from Syzygy filenames exactly which material is present and what
the real piece limit is. Someone with five-piece tables is told five; someone
with WDL but no DTZ files is told that too, because the two are downloaded
separately and a partial set is the state most users are in.

Probing is delegated to a local tablebase server. Kingfisher does not implement
Syzygy decompression — several thousand lines of Huffman-coded table decoding
whose failure mode is a silently wrong endgame assessment, in a feature whose
central claim is that a tablebase result is proof rather than opinion.

`chooseTablebaseProvider` returns a decision _with a reason_, and the panel
prints it: local when it can genuinely answer, remote otherwise, and the reason
names both numbers when it declines. The configuration users most often arrive
at — files downloaded, no server running — produces a sentence rather than a
silent fall back to the network.

See ADR 0031.

---

## Games from a linked account

`src/sync/` pulls a Lichess or Chess.com account's games into the ordinary
local collection. Its most important property is what it does not contain:
there is no game model here, no duplicate rule and no position index. A
provider produces PGN, and that PGN goes to `importGames` — the same function
the paste-a-file dialog calls.

```
remote service → provider → PGN → importGames → fingerprint index → collection
```

That is why syncing the same account twice imports nothing the second time
while this feature contains no deduplication logic at all: the `fingerprint`
unique index has enforced one row per game since schema version 1, and a synced
game is subject to it because it is not a special kind of game.

The two providers get different cursors because their APIs genuinely differ.
Lichess takes an epoch-millisecond `since`, so an incremental sync is one
request for exactly what is new. Chess.com publishes immutable monthly
archives and has no timestamp cursor, so the unit is the calendar month:
everything before the last synced month is settled and skipped, and that month
itself is re-fetched because a month in progress will have gained games.
Chess.com requests are strictly serial, which its documentation asks for.

Cursors advance only after the import they describe has landed. A cursor
written first would turn a failed import into permanently skipped games — the
one failure of an incremental sync a user can neither see nor recover from.

No credential is required: both APIs serve public games anonymously. A Lichess
token raises that API's rate allowance, so the one that may already be set for
the explorer is reused; nothing asks for a new one. Failures are reported in the
same `ProviderHealthState` vocabulary a database provider uses, so a
rate-limited account reads as rate limited rather than as an account with no
games. See ADR 0035.

## The position report

`src/features/position-report/report.ts` assembles ten sections about the
position on the board from evidence that already existed in six different
panels. The assembly is a pure function over already-fetched evidence, so its
rules are testable without a database or a network.

Two rules govern every section. **Provenance or a reason**: a section with
evidence names its source ("Lichess Masters · 18,431 games"), and a section
without evidence says why it is empty — "Lichess is rate limiting this client"
and "no repertoire covers this position" are different facts and must never
both render as blank space. **No best move**: a highlighted move carries the
rule that selected it — most played, highest scoring among moves with at least
100 games, most recently played — with the sample threshold written into the
label, because three wins in three games is not a 100% scoring move. A test
asserts that no criterion anywhere contains "best", "recommended", "strongest"
or "should".

Sources are queried independently, so one failing empties its own section and
nothing else; a report that vanished because the explorer was rate limited would
hide the repertoire and journal evidence that was available all along. Engine
evidence stays in its own section attributed to engine and depth, because
mixing it into the move list would blur what people have played with what a
search calculated. See ADR 0037.

## The opening report

`src/features/openings/opening-report.ts` is the same idea aimed at an opening
rather than a position, and it reuses the position report's `ReportSection` on
purpose: the provenance-or-a-reason rule is enforced by the type both share,
and a structural test walks every section and requires one of the two.

It composes evidence that already existed and adds none. Where the theory book
places the position and what the classification dataset calls it; the variation
brief, if one is written; what each installed population played, one row per
source with its own game count; which branches the repertoire does not answer.

Three rules shape it beyond the two it inherits.

**Populations are never merged.** There is no combined percentage anywhere in
the file, and a disagreement between two sources is reported as two shares with
neither averaged.

**Authored prose stays distinguishable from counts.** The brief is a section
attributed to Kingfisher; where the pieces go is a section attributed to the
games it replayed. Neither borrows the other's authority.

**A name is never printed without the distance to it.** A position twenty plies
past the last one the dataset names still gets the name, always beside how far
past it the board is, because the name describes the opening and not the
position in front of you.

Two modules under it produce the evidence a report cannot get from an explorer.
`src/theory/opening-plans.ts` replays the recorded continuations of the games
that reached a position and counts where each piece got to, keeping a piece's
identity as it travels — so "the knight from g1 reached f3 in 1,204 of 1,431
games" is a sentence with a denominator. It replays validated moves rather than
generating them, so it needs no rules engine and does not touch the chess.js
boundary. `src/theory/critical-branches.ts` orders the branches and attaches
the facts that put them in that order. Both collapse to one number to sort, and
that number never leaves its module: `reasons` is what a reader gets and is
complete without it.

**Only one kind of source can supply those continuations**, and it is not the
one the report's population columns come from. A reference pack aggregates its
games into per-position counts before Kingfisher ever sees it; a SQLite
collection through the companion keeps one row per game and ply, so a
continuation is a range scan. `OpeningReportPanel` therefore asks the provider
registry, never the reference list — asking the reference list is what made
both plan sections unreachable until `66c6251`. It prefers the chosen explorer
source when that source can answer, and **the section names the collection it
replayed**, because a machine can hold several and only one of them supplied
those games. When nothing can answer, the sections are absent rather than
empty, which is a different statement.

## Reviewing a repertoire

`src/repertoire/review.ts` turns a repertoire into a queue of prompts. It is
deliberately not a second spaced-repetition system — the scheduling is
`src/training/schedule.ts`, so a repertoire prompt and a tactics card compete
in one queue on the same terms, and every prompt reports the interval, the last
review and the next due date it arrived with.

A position is one prompt however many move orders reach it. ADR 0010 already
made a repertoire a map from positions to moves rather than a tree of
sequences, so most of that is inherited; what this module has to get right is
training cards, where nothing stops two existing for one position. A position
with two reviews on the sooner of them, so a due card cannot hide behind a
distant one.

**A session is a selection, not a syllabus.** Starting a review replaces the
membership of the static training set it uses rather than adding to it, so a
player who reviews forty positions and then wants the five they keep failing
gets five. No card and no schedule is touched by that — the set holds
membership, and the cards belong to the queue.

**And the link the review hands the queue has to be read from the route.**
`?set=`, `?item=` and `?scope=` are how a review session, a critical position
and the command palette all give the training workspace a subject. Reading them
from `window.location` during the first render is right after a page load and
wrong after a client navigation, which is what every one of those links is; the
workspace reads `useSearchParams`, and `src/app/training/page.tsx` carries the
Suspense boundary a prerendered route needs for that.

## Strategic themes

`src/chess/themes.ts` extends deterministic search from pawn skeletons to
piece and material motifs. Sixteen themes, each admitted on one condition:
**it can be decided by counting.** Every definition is written in the same
terms the code checks, is shown beside the match rather than living only in
the catalogue, and is versioned (`THEME_VERSION`) so a stored match cannot be
silently reinterpreted when a rule changes.

Opposite- and same-coloured bishops, bishop against knight, the bishop pair,
rook against a minor piece, queenless middlegame, rook ending, minor-piece
ending, isolated queen's pawn, hanging pawns, the Carlsbad skeleton, symmetrical
pawns, an open central file, opposite-side castling, and both wing majorities.

What is deliberately absent matters as much: "good bishop", "bad bishop",
"initiative", "attack", "weak squares", "space". Each is a judgement, and a
search that claimed to find them would be inventing evidence. A test asserts
that no definition in the catalogue contains a judgement word, which is what
stops that line being crossed by a later addition.

Themes are indexed on the **existing** `structureClaims` multi-entry index,
prefixed `theme:` so the two kinds of claim can never be confused. That means
one index, one search path, and an older collection picks them up through the
structure backfill that already exists rather than needing a re-import.

Two definitions were tightened by their own tests before landing: an open
central file requires four pawns on the board, because with bare kings every
file is open and the term means nothing.

## Structural research

`chess/structure.ts` turns a position into two comparable identities, both pure
functions of the FEN and both computed identically in the browser, the import
Worker and the companion:

- **The pawn-skeleton key** is the pawns and nothing else — `p1:` then eight
  file groups of White ranks, `|`, Black ranks. Two positions share it if and
  only if their pawns stand on the same squares, which is what a player means by
  "the same structure" and is why the pieces are excluded by construction rather
  than down-weighted.
- **The structure signature** is coarser: the files that matter, the bishop
  pairs, the material profile and each king's third of the board. Positions
  sharing it are the same structural _type_, and the result row says so rather
  than claiming they are the same position.

Both embed a format version, so a key written under an older definition is
detectable rather than silently a miss. Both are stored on the position row and
indexed in SQLite and IndexedDB, which makes structure search an equality lookup
rather than a scan.

**Claims are the third identity, and the one that needed an index of its own.**
A position carries a flat list of chess claims — an isolated d-pawn, an open
c-file, a strategic theme — and searching for one was the slowest query in the
product. Two facts made a cheap index possible and are worth keeping in mind
before changing either:

- **The sort key is already on the position row.** `positions.rating_key` and
  `year_key` hold the game's `max_rating` and `year`, denormalised there for the
  filter cache. So a claim search orders on the position, and the join to
  `games` is needed for the rows it returns rather than for every row it
  matched. `claim-index.test.mjs` asserts those columns stay equal to the
  game's, after an import, after a deletion and after a second import — the
  ordering is only correct while that holds.
- **Claims repeat in sets, not in positions.** A collection with 11.3 million
  positions carries 1.5 million distinct claim sets, so the index is claim to
  claim _set_ rather than claim to position — which would be 114 million rows.

Two query plans, chosen by selectivity: an ordered walk of a rank index that
stops at thirty, and the seek-and-sort that is cheaper for a rare claim. They
return the same rows, so a wrong choice is slower and never different. **An
index that is not finished is never used** — a claim search against a half-built
one would return nothing, which reads as "no game here has that structure", so
the fast plan waits for a completed build and everything else falls back to
scanning.

`structureOverlap` returns a count of shared claims and the totals on each side.
Not a similarity score: the caller decides what "close enough" means, and the
table shows the count so the reader can decide too.

See ADR 0024.

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

**There is one board, and `BoardLayers.tsx` is why.** The square grid and the
piece layer live there and are rendered by both the interactive board and the
`MiniBoard` used for previews and thumbnails — which differs only in what it
leaves out. There used to be two implementations, and they drifted: the
miniature laid pieces out _inside_ grid cells with no explicit row track, so
the rows sized themselves to the pieces' intrinsic height and the grid
overflowed its own square box. At 120px the Settings preview was eight columns
of 14.8px and eight rows of 18.4px, and the bottom two ranks were clipped away.
That is the class of bug two renderers produce, and the reason there is now one.

### How large the board is

A policy, not a pixel setting — ADR 0040. `BOARD_PRIORITIES` sizes the chrome
(dock width, notation height, whether the notation folds into the dock, and a
ceiling), and the board takes what is left, which is why one setting works on a
1280x720 laptop and on a 27-inch display. On screens under 860px tall the
notation panel starts smaller, because at 720px the board is limited by height
by a wide margin.

A stored arrangement always wins; the policy only decides the shape of a
workspace nobody has rearranged. `e2e/board-size.spec.ts` holds absolute pixel
floors, and `docs/performance/phase-13-out-of-the-box.md` has the before-and-
after measurements and the three separate causes of the small board.

### The board capability contract

Phase 5 unified the full-size board; Phases 6 to 9 then built Review,
Calculation, Guess the Move, Endgame, Preparation, Opening Files and Model Game
mode on top of it, each expressing "hide the answer" its own way — Review by
passing `showEvaluationArtifacts={revealed}`, the dock by withholding tool
mounts, Calculation by an overlay. Three mechanisms, no single place to check,
and nothing stopping a fourth route from forgetting.

`features/workspace/board-capabilities.ts` is that single place:

```
allowMoves  allowAnnotations  showAnnotations  showLegalHints
showEvaluation  showCoordinates  allowFlip  allowContextActions  concealPieces
```

Two rules make it trustworthy.

It is **declared by the surface**, never inferred from the pathname. The same
document is editable in Analysis and frozen in a preview card, so behaviour is
a property of the surface rather than of the route. An earlier version guessed
from the route and the document kind, which made a game opened from Games
read-only in Analysis and quietly removed the ability to add a variation to
your own game.

Concealment is **subtractive and applied last**. `resolveBoardCapabilities`
takes the mode's base record, applies the caller's overrides, and _then_ turns
off everything that could carry the answer — so no future call site can
re-enable the evaluation bar inside a session somebody asked to think about
unaided, including by accident. That property is what the unit tests are
really for.

Concealment also withholds stored annotations, which the old
`showEvaluationArtifacts` flag never covered: a `!` sitting on the next move is
the answer written on the board.

`CanonicalBoardSurface` writes `data-board-conceals="evidence"` when it is
withholding, so an E2E test asserts the contract from the component's own
claim rather than from a bar happening to be absent for some other reason. The
Phase 10 matrix walks all nine board routes and checks each renders exactly one
canonical board — never two that could disagree about the position.

`BoardErrorBoundary` catches a board that fails to render and retries once with
the stock piece set and theme, with a diagnostic saying so. The board is the
one component every chess route depends on and it draws user-chosen artwork; a
piece-set renderer that throws should cost you the artwork, not an in-memory
analysis. Only one retry: if the plain board fails too the problem is not the
artwork, and re-rendering forever would be a loop instead of a message.

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

## Configuration

Eleven sections of settings means nobody can remember which one holds
"threads". `features/shell/settings-index.ts` is a searchable catalogue —
label, section, a sentence of explanation and the words a user would actually
type. Keywords are stored beside the entry rather than derived from the label,
because the failure mode is entirely about the words the label _does not_
contain: somebody looking for the Lichess token searches "token", not "Connect
Lichess". The explanation matters as much as the jump; "Hash (MB)" tells a user
nothing about whether they want to change it.

Each integration reports whether it works where it is configured. Before this,
learning whether Lichess was connected meant opening Diagnostics — a different
section, for a question about the section you were already in. Diagnostics
stays the detailed view; the health line is the one-line answer.

### Settings transfer

`features/shell/settings-transfer.ts` exports appearance, board, workspace
layouts, pinned tools and keyboard bindings, and no credentials. The exclusion
is a **deny-list**, and the reason is that the failure modes are not symmetric:
with an allow-list, a preference added next phase is silently dropped from
every export — annoying. With a deny-list, a _secret_ added next phase is
silently exported — a leak. So the deny-list is paired with a test that fails
the moment a preference whose name reads like a credential is not on it, which
turns the dangerous direction into a build error. Names that look like
credentials but are not (`rememberLichessToken`) are listed as reviewed
exceptions rather than weakening the pattern.

`companionUrl` and `assistantBaseUrl` are denied too. Neither is a secret, but
both are addresses of services on the user's own network, and an exported file
is a thing people paste into issue trackers.

Import validates each part on its own: an unknown preference key is dropped, a
preference of the wrong type is dropped, a damaged layout does not prevent the
appearance and shortcuts restoring. Malformed configuration should cost the
user the parts it got wrong and nothing else.

### Keyboard bindings

`features/command/shortcuts.ts` has always been a table of what the keys _are_,
rendered in the reference dialog, while the handler was a separate chain of
`if`s. The two agreeing was a matter of somebody remembering — which is how the
`D` binding came to be documented for a whole phase while doing nothing at all.

The table is now authoritative. `features/command/bindings.ts` resolves an
event to an action id through defaults merged with the user's overrides, and
`useGlobalHotkeys` switches on the action. A rebind therefore takes effect
without the handler being touched, and a documented binding is necessarily one
that fires. The E2E test presses the rebound key and checks the board flipped,
which is the only assertion that would have caught the original bug.

Deliberately not a chord grammar. Kingfisher's keys are single keys with at
most shift and the platform modifier; `Ctrl+K Ctrl+S` sequences would add a
parser, a timeout and a class of unreachable states for nothing a chess player
asked for. Shift is recorded only on keys whose identity it does not already
change — on `?` the shift is how the character is typed, so recording it would
store `shift+?`, which no event can match.

Conflicts are reported, never silently allowed: "C is already assigned to Edit
the comment on this move", with Replace and Cancel. Replace takes the key from
the action that held it rather than leaving two actions on one key, because
only one of them could ever fire. Escape is fixed rather than bindable — it is
the way out of every dialog and out of focus mode, and making it rebindable
offers the user a way to lock themselves in.

The reference dialog and the editor are the same screen. A separate "customise
shortcuts" screen is one nobody finds, and it guarantees the two drift.

---

## Refereed endgame practice

The point of playing a theoretical endgame against an engine is not to find out
who wins — you already know, that is why it is theoretical. It is to find out
whether _you_ can hold the result. So the referee is the tablebase, not the
engine's evaluation.

`features/endgame/conversion.ts` is pure. `outcomeFor` reads a Syzygy category
from a chosen side's point of view, inverting it when the side to move is not
the side being asked about — getting that wrong would announce a change on
every move of the game, which is the regression its test exists for. The two
fifty-move categories collapse to `draw`: a cursed win is a win on the board
and a draw in the game, and the game is what is being played.

`describeChange` returns `null` when the result held, because a trainer that
comments on every move trains the player to stop reading it. When it did move,
the wording is fixed and asserted by tests:

> The tablebase result changed from Win to Draw on this move.

Never "you blundered". That is not politeness. A tablebase knows the result
changed; it does not know whether the move was a slip, an experiment, or a line
the player understands better than the machine does, and a system claiming to
know that is making something up.

`endingFor` ends a session on mate, stalemate, the fifty-move rule, or the
starting result being gone — judged against where the session _began_ rather
than the previous move, so drifting Win to Draw and back to Win is a session
worth continuing rather than one that ended two moves ago.

The user picks the opponent: tablebase-perfect, a full engine search, or a
shallow one that will go wrong. A perfect defender in a lost position makes
practice impossible to fail; an opponent that plays perfectly while being
called "club strength" is a lie about the exercise. Only the perfect setting
consults the tablebase.

The session owns its own position rather than writing into the analysis tree:
twenty forced king moves in the user's variation tree would bury the study they
were working on.

---

## Collections

Kingfisher held games in two places — an IndexedDB collection in the browser and
any number of SQLite files behind the companion — and had no vocabulary for
moving a game between them. Import, delete, clear was the whole set.

`src/database/collections/` is the port that fixed that. One interface over both
stores, so copy, move, merge and duplicate search are one implementation rather
than four. Four rules shape it:

**Everything is paged.** No operation reads a collection into memory. A copy of
half a million games is a sequence of bounded pages, which is what lets it
report progress, be cancelled, and leave a defined state behind when it is.
Cursors are primary keys, never offsets: an offset makes each page re-walk
everything before it, which turns a linear job quadratic somewhere around the
hundred-thousandth game.

**The unit of transfer is a stored game, not a PGN.** A game already carries its
normalized movetext, its position index and its classification; sending those
rather than re-deriving them is both faster and safer, because a re-derived
fingerprint that differs by one byte is a duplicate the destination cannot
recognise. Only a SQLite-to-browser copy reparses anything, because only the
browser stores game trees.

**A move never deletes what the destination has not confirmed.** Not "the write
did not throw" — confirmed, by asking the destination for the fingerprints
afterwards. A destination that reports success and stores nothing leaves every
game where it was and says so, which is asserted directly against a double that
does exactly that. Verified fingerprints are then deleted in batches of two
thousand rather than once per page, because deletion cost is dominated by a
fixed per-call price (rebuilding the explorer aggregates for every affected
position) and the difference is 24.0 ms per game against 1.92 ms. Buffering only
widens the window in which a game is in _both_ places, which is the safe
direction, and a cancel flushes what is already confirmed.

**Duplicates are two findings, not one.** Byte-identical copies share a
fingerprint and can be removed on request. The same game annotated two different
ways shares only a metadata key, and there is no correct automatic answer to
whose notes survive — so it is shown, labelled, and never resolved
automatically.

Federated search never merges source identity. A game held in two collections
appears once for each, because "it is in both" is the useful answer, and a
filter is only offered when every selected source can honour it.

---

## Opening classification

ECO used to be whatever an imported PGN's tag said. A great many PGNs carry no
tag, and a great many carry one computed by a different program at a different
depth from a different table.

`data/openings/` vendors the CC0 lichess-org/chess-openings dataset — 3,810
named openings, licence recorded, nothing derived from ChessBase — and
`npm run openings:build` replays every line through **this application's own
rules code**, writing an index keyed by the canonical position identity the game
tree will present. That is the whole point of building it rather than parsing at
runtime: a second implementation of the rules would show up as an opening that
is silently never recognised.

Two consequences fall out of keying on position rather than move order, and both
are why it is done that way:

- **Transpositions converge.** 1.d4 Nf6 2.c4 e6 3.Nc3 Bb4 and 1.c4 e6 2.Nc3 Bb4
  3.d4 Nf6 are the same position and get the same name, with no special case.
- **Depth wins.** A Sicilian that reaches a Najdorf is a Najdorf. Reading `[ECO]`
  off a two-move prefix throws away the part the reader cares about.

The imported tags are never overwritten. `classification` is a separate stored
field and `classifiedWith` records which index examined a game, so "not looked at
yet" stays distinguishable from "looked at and unnameable" — which is what makes
a backfill bounded and resumable rather than a job that revisits every unnamed
game for ever. Where the two disagree, the game list says so.

---

## Player profiles

`/player/[id]` exists for every name in the collection, keyed on the canonical
player key the games already carry, so nothing has to be created before somebody
can be looked at.

Two rules run through it. **Every figure carries its denominator** — "41 of 118",
not "35%" — because a percentage over eleven games and one over eleven hundred
are different kinds of fact. And **nothing is an adjective.** The tendency
section reports rules, counts and denominators, and no code path in this
application can produce the word "aggressive".

The tendency metrics are three-valued: a measure returns true, false, or null for
"this game cannot answer". A twelve-move draw says nothing about castling by move
fifteen, and counting it as a "no" would turn short games into evidence. Each
metric prints the rule it applied, reusing the published structural-theme
definitions where it can and carrying their version alongside its own.

Cost is split deliberately. The aggregate walks game _summaries_, which is cheap
enough to cover an archive; the tendencies read game _trees_, which is not, so
they run over a bounded sample that says how big it was.

Identity is stated, never inferred. Kingfisher will not decide that "M. Carlsen"
and "Carlsen, Magnus" are one person: linking is one explicit action, an alias
cannot belong to two identities, and the panel says out loud that linking widens
what the profile counts.

---

## Performance

The choices already made, and why:

- Engine analysis runs in a Web Worker; the UI thread never blocks on a search.
- Engine updates are throttled at the source, not at the component.
- Node evaluations are written to the tree only when depth changes, and never
  create undo entries — otherwise a running engine would fill the history.
- The move tree is flattened once per tree and windowed: only the visible rows
  plus an overscan margin are mounted, and keyboard navigation operates on the
  flattened order rather than on mounted DOM, so `End` does not require the
  20,000 rows between here and there to exist. Nested variations, variable-height
  comments, branch connectors and context menus all survive it. This was adopted
  after profiling a real 20,000-node tree, not before. See ADR 0027.
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
- Player and metadata search over the SQLite companion are indexed rather than
  scanned. The player prefix lookup used to run two `GROUP BY` passes over every
  game and the text search was four leading-wildcard `LIKE`s — both proportional
  to the whole database on every keystroke. A `players` table keyed by the same
  normalized name key `games.white_key` holds, maintained on import, turns the
  prefix lookup into an index range scan; a contentless FTS5 index over players,
  event, site, ECO and opening answers the text search in one lookup.
  Deliberately **not** the movetext: it is by far the largest column, indexing it
  would multiply the database size for a query nobody has asked for, and the
  position index already answers "which games reached this position" properly.

  Measured with `npm run bench:player-search -- 500000`, median over 20 runs:

  | Query                 | Before   | After   |
  | --------------------- | -------- | ------- |
  | player prefix "car"   | 121.6 ms | 0.0 ms  |
  | player prefix "carl"  | 72.6 ms  | 0.0 ms  |
  | player prefix (empty) | 262.5 ms | 0.0 ms  |
  | text, two terms       | 137.2 ms | 25.8 ms |
  | text, no match        | 126.4 ms | 0.1 ms  |
  | text, one common term | 0.3 ms   | 29.0 ms |

  The last row is an honest regression. `LIKE` looked fast on a common term only
  because `LIMIT` stopped the scan once fifty rows matched; the same query on a
  term the database does not have cost 126 ms. What changed is that the cost
  stopped depending on which name you typed — 29 ms is below the threshold at
  which a search box feels like it responds at all, and the 127–137 ms tail is
  gone. Bulk import pays for it: 500,000 games went from 11.7 s to 18.5 s, which
  is the right side of the trade for a background job with a progress bar.

  Both indexes are derived entirely from `games`, so an existing database
  rebuilds them on first open and a rebuild is never data loss — which is also
  why an SQLite build without FTS5 falls back to the `LIKE` scan instead of
  refusing to open. Deletion rebuilds rather than decrements: a player left
  listed with a game count no game supports is a wrong answer that survives until
  somebody notices.

- PGN parsing runs in a module Worker behind an acknowledged batch pipeline, so
  exactly one prepared batch is ever in flight and the producer is blocked on
  the consumer. Cancellation terminates the worker at once and resolves only
  after the batch already being written commits. See ADR 0021.
- The unfiltered SQLite opening aggregation is answered from a derived
  `position_aggregates` table maintained by triggers inside the writer's
  transaction: 0.3 ms instead of 129 ms at 100,000 games. See ADR 0023.
- Filtered SQLite aggregation is answered from exact `(move, year, rating,
result)` cells built lazily for the 128 positions being researched: 0.4–2.7 ms
  instead of ~132 ms. Cells, not buckets — a filter boundary lands exactly where
  the scan put it, and a filter that excludes nothing returns exactly what the
  unfiltered explorer returns. A player-name filter still scans, because a cell
  per player would be a copy of the collection. See ADR 0026.
- SQLite deletion suspends the per-row aggregate trigger, which re-aggregates a
  whole `(position, move)` group for every cascaded row, and rebuilds only the
  position keys the deletion could have touched: 199 ms rather than 1,651 ms to
  remove 1,000 of 100,000 games.
- The repertoire transposition graph is memoized on the positions array, and
  its search carries parent pointers rather than a path per queue entry and is
  bounded by an explicit visit budget. Measured on 2,639 positions, listing the
  move orders that reach one position went from 1,119 ms to 53 ms and
  convergence detection from 255 ms to 1.6 ms. See the Phase 9 notes.
- Pawn structure and file state are split out of `positionFeatures` and
  memoized by pawn skeleton across an import. Openings repeat heavily in an
  archive and roughly half the moves in a game are not pawn moves, so the memo
  hits often: indexing 210,319 positions went from 2,644 ms to 1,464 ms with no
  change to a single stored value.
- Explorer history is capped at 256 inactive entries. `gcTime` expires entries by
  age, which does not bound an afternoon of navigation. Only _settled_ entries
  are evictable: a prefetch in flight has no data and no observers, and evicting
  it would silently disable prefetching once the cache filled.
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
them. Phase 7 took the heaviest route from 309 kB of gzipped JavaScript to
289 kB while total emitted client JavaScript rose from 1,257 kB in 26 files to
1,373 kB in 60 — which is what code splitting looks like when features are
being added at the same time. As of Phase 11 the heaviest route is `/review`
at 330.7 kB gzipped over 21 scripts, with 1,829.9 kB emitted across 83 files —
+6.7 kB on the heaviest route for three new features, with the position report
and the accounts settings surface both lazily loaded. No runtime dependency has
been added since Phase 7: `fake-indexeddb`, added in Phase 11 for the historical
migration fixtures, is a devDependency and reaches no client bundle. Phase 11's
figures, including what was deliberately not measured and why, are in
`docs/performance/phase-11-release-candidate.md`.

Phase 10's search measurements are reproduced by
`npm run bench:player-search -- 500000`, which generates its own collection
and deletes it.

---

## Testing

1,570 tests across 108 files, all on the parts where being wrong is expensive.

| Area                | Covered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FEN                 | Valid parses, 11 kinds of malformed input, en passant rank rules, round trip, position key                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Position            | Legal move generation, castling (including through check), en passant, promotion, checkmate, stalemate, insufficient material, illegal positions                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Game tree           | Add / dedupe / delete / truncate / promote / promote-to-main-line, path and line walking, ply numbering from a custom FEN, annotation toggles                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Game                | Line insertion in SAN and UCI, threefold repetition along a line                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| PGN                 | Tokenizing, nested variations, comments and pre-comments, NAGs and suffix glyphs, `[%cal]` / `[%eval]` / `[%clk]`, FEN tag, illegal-move recovery, multiple games, serialization and round trip, a complete annotated master game                                                                                                                                                                                                                                                                                                                                  |
| Evaluation          | White-POV conversion, formatting, ordering with mate scores, winning chances                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| UCI                 | `info` with every field, mate scores, bounds, `bestmove`, options, command formatting                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Database            | Position aggregation, transpositions, rating averaging, player and date filters, performance rating                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Analysis store      | Navigation, variation creation, editing, undo/redo including redo invalidation, PGN/FEN load and export                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Board layout        | Pointer-to-square conversion in both orientations and animation identity across ordinary moves, promotion, and castling                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Providers           | Explicit handling of authentication-required Lichess explorer responses                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Variations          | Reordering as a pure permutation — every node, parent, position, comment and descendant compared before and after; promotion from inside a nested line; whole-side-line deletion                                                                                                                                                                                                                                                                                                                                                                                   |
| Persistence         | Study and chapter CRUD, ordering and gap-closing on delete, cascade delete, duplication, refusal to resurrect a deleted chapter; draft save/restore; corrupted-record rejection                                                                                                                                                                                                                                                                                                                                                                                    |
| Round trip          | A chapter with a nested variation, multi-line comments, NAGs, arrows, highlights and saved evaluations — stored, reloaded and compared node by node, then exported to PGN and reimported                                                                                                                                                                                                                                                                                                                                                                           |
| Migrations          | Contiguous versions, every store and index created on a fresh database, nothing replayed over an existing one                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Historical upgrades | Real `fake-indexeddb` databases opened at v1, v3, v6, v7, v8, v9 and v10, seeded the way a session at that version would have, reopened at the current version through the real upgrade path, and checked for semantic equality: chapter trees and their comments and variations byte-identical, player keys backfilled without disturbing neighbouring fields, references and queue jobs still resolving through their indexes, profiles backfilled without clobbering, and a pre-v9 position absent from the structural indexes rather than fabricated into them |
| Randomized games    | Sixteen fixed seeds generating legal games biased toward captures, castling, en passant and promotion, with variations branched off them. Asserts tree well-formedness, that every move is legal from its parent, PGN round-trip line equality, node reuse on replay, immutability under `addMove`, and well-formedness after promote/truncate/remove. Curated SetUp/FEN fixtures cover castling both sides, all four promotion pieces, checkmate, stalemate and threefold repetition                                                                              |
| Layout corruption   | Unknown module ids, illegal regions, NaN, negative and gigantic dimensions, non-object roots, unknown future fields, malformed saved layouts and unrecognised presets — each sanitized to something renderable rather than thrown on                                                                                                                                                                                                                                                                                                                               |
| Account sync        | Request shape and cursor arithmetic for both providers; 404/429/401/network mapped to distinct states; Chess.com month-cursor arithmetic skipping settled months; and the property the design rests on — syncing the same games twice imports nothing the second time, through the ordinary fingerprint index                                                                                                                                                                                                                                                      |
| Custom engines      | Executable validation (missing, directory, not executable); a real UCI handshake against a fake engine; truthful rejection of a process that never answers, exits early, or prints non-UCI output; and no process left behind after a failed handshake                                                                                                                                                                                                                                                                                                             |
| Managed engines     | The catalogue as one platform sees it; refusal to fetch an asset with no recorded digest; refusal of a download whose digest does not match, with nothing left on disk; a real executable that is not an engine deleted after failing its UCI check; and a recorded engine whose binary has since vanished dropped at load rather than left to fail later                                                                                                                                                                                                          |
| Engine trust        | That only the browser engine is ever described as sandboxed, that a managed engine says out loud that it is not, that every level states limits as well as guarantees, and that the digest claim is scoped to byte-identity rather than authenticity                                                                                                                                                                                                                                                                                                               |
| Reference packs     | Round-trips for every line format; shard stability and distribution; refusal of a manifest in an unknown format or naming a chunk without a usable digest; a digest mismatch, a 404 and a cancel each leaving the store in a defined state; resumption re-verifying rather than re-downloading; and a damaged installation reporting which chunks it lost                                                                                                                                                                                                          |
| Player catalog      | Whole-word matches ranked above prefix matches whatever the game counts, roster players reported as zero games rather than hidden, the championship and women's lineages present, dates never invented, and no alias claimed by two people                                                                                                                                                                                                                                                                                                                         |
| Opening library     | Every one of the 3,810 dataset lines replayed to the position it is filed under; search by ECO, name, nickname, move sequence and FEN; every alias resolving to something the dataset contains; and transposition search returning only orders the rules code played to the same position                                                                                                                                                                                                                                                                          |
| Polyglot            | All nine positions the specification publishes worked keys for, including the en-passant cases; the packed-move encoding and its king-takes-rook castling; binary search hitting the first and last entries; and refusal of a file that is not a book                                                                                                                                                                                                                                                                                                              |
| Lichess PKCE        | Verifier alphabet and length, S256 determinism, an authorization request carrying no secret and no empty scope, a mismatched `state` refused rather than repaired, a cancelled sign-in reported as cancelled, and every refusal shape from the token endpoint including a non-JSON error body                                                                                                                                                                                                                                                                      |
| Appearance          | Twelve themes with square colours far enough apart to see and a piece colour legible on each; ten piece sets with an author, a licence URL and a source, and none carrying a non-commercial or no-derivatives clause                                                                                                                                                                                                                                                                                                                                               |
| Navigation          | Every section owning its own icon, drawn from the one icon set, in a declared group, with a distinct route and a hint that says what it is for                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Position report     | Every section carries provenance or a stated empty reason; the reference source is named with its size; a failed lookup is distinguished from an empty one; the scoring threshold is stated and small samples excluded; and no highlight criterion anywhere contains "best", "recommended", "strongest" or "should"                                                                                                                                                                                                                                                |
| Position key        | Counters ignored, castling distinguished, en passant kept only when usable, transpositions merged                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Import              | Multi-game files, stage ordering, duplicate skipping, cancellation, damaged-game accounting, position-index entries                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Explorer            | Result and rating aggregation, popularity ordering, transposition merging, per-game counting, filters, deletion and clearing                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| PV insertion        | Structured insertion, branch reuse, variation creation, comment and evaluation preservation, idempotence, stale-line rejection with the tree left untouched, undo                                                                                                                                                                                                                                                                                                                                                                                                  |
| Autosave            | Debounce, the cap that stops steady editing postponing a write forever, no concurrent writes                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Repertoire          | Line authoring, explicit opponent replies, transposition convergence, roles, coverage, evidence-backed gaps deduplicated by position, and own/opponent deviation                                                                                                                                                                                                                                                                                                                                                                                                   |
| Repertoire PGN      | Position map to playable line, variations for alternatives, rejected moves as prose, transposition cut-off, and reparsing what was written                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Game search         | Whole-name identity, ordered pages that neither repeat nor skip, totals across the match set, and every predicate applied when the index answers only one                                                                                                                                                                                                                                                                                                                                                                                                          |
| Training answers    | Accepting any recorded move, partial candidate sets, band comparison, and refusing to grade prose mechanically                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Preparation         | Exact identity, factual profiles, transposition-aware trees and prepared/gap comparison                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Training            | Every grade transition, interval previews, queue stages, review history and transactional deletion                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Backup              | Portable/full export, validated merge/replace, game preservation, unique-index collisions on merge, and rollback on malformed input                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Global search       | Studies, chapters, games, players, repertoires, training, model games and tags                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Chapter revisions   | A refused stale write, the winning record handed to the loser, renames and reorders moving the revision on, a reorder that changes nothing leaving it alone, and the v4 backfill                                                                                                                                                                                                                                                                                                                                                                                   |
| Data integrity      | Each rule against a fixture that breaks exactly one relationship, the healthy cases that must produce no finding, safe repair, and the refusal to delete anything not marked repairable                                                                                                                                                                                                                                                                                                                                                                            |
| Diagnostic report   | No configured secret present, no prefix of one, a secret redacted out of an error message, an unknown bearer token redacted, and ordinary text left alone                                                                                                                                                                                                                                                                                                                                                                                                          |
| Provider retries    | Network errors retried once; rejected credentials, rate limits, schema mismatches and misconfiguration never retried; `Retry-After` in seconds and as a date; request deadlines                                                                                                                                                                                                                                                                                                                                                                                    |
| Transpositions      | Move orders read from stored trees, a genuine transposition found and a near-miss rejected, merging across sources, ordering by frequency then length, and excluding the order the reader is already on                                                                                                                                                                                                                                                                                                                                                            |
| Import hardening    | A broken game beside good ones, Unicode names, a 2,000-character event, a 20,000-character comment, nested variations, SetUp/FEN, the same game twice, a moveless pairing, and interrupted-import consistency                                                                                                                                                                                                                                                                                                                                                      |

Run with `npm test`.

### Browser tests

Seventy-two Playwright tests across nine spec files in `e2e/`, run with
`npm run test:e2e` against a real dev server and a real Stockfish build, and at
**zero retries** — a test that only passes on its second attempt is a bug, and a
gate that re-runs it hides that bug rather than reporting it. They exist because the failures these
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
| Phase 11          | A linked Lichess account syncing into the ordinary collection over a routed network; a second sync importing nothing; a rate limit reported as a rate limit rather than an empty library; a missing account named; a Chess.com sync walking only published archive months; and the position report rendering every section with provenance and no "best" anywhere in its criteria                                                                                                                                                                   |
| Concealment       | The review board's `data-board-conceals` attribute **and** the absence of any `EvaluationBar`-shaped accessible name from the DOM before reveal — concealment proven by absence, not by a flag the component sets about itself                                                                                                                                                                                                                                                                                                                      |

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

**Phase 4 — engines, artwork and scale.** _Done._ Native engines through the
companion, SQLite collections measured at 100,000 games, real vector piece sets.

**Phase 5 — one application.** _Done._ A shared workspace context, one tool
dock, one board pipeline, and evidence that follows the position between routes.

**Phase 6 — reliability.** _Done._ Chapter revisions, cross-tab conflict
detection, drafts written before chapters, an integrity scan, and a diagnostic
report that carries no secrets.

**Phase 7 — speed and scale.** _Done._ Derived explorer aggregates, PGN parsing
in a Worker behind acknowledged batches, revisions for repertoire and training,
chapter references, lazy tool surfaces, and a background analysis queue.

**Phase 8 — studying your own thinking.** _Done._ Self-analysis with evidence
withheld until submission and the record frozen at reveal; a decision journal;
a critical-position queue with stated reasons; player-chosen improvement themes
and factual summaries that drill into the positions behind them; training sets;
deterministic structural and pawn-skeleton search; model-game discovery and a
study mode with the engine off; preparation priorities with visible reasons;
exact filtered explorer queries; SQLite deletion; a virtualized move tree; and a
rules-engine replacement measured and rejected.

**Phase 9 — elite preparation.** _Done._ Tournament preparation sessions and
opponent dossiers, curated game-day sheets, the theory radar, a
transposition-aware repertoire, opening files, guess-the-move, a calculation
workspace with a blindfold, the endgame lab with local Syzygy, restricted-search
candidate comparison and stored engine evidence, review scheduling and journal
analytics, position search, and one position-action list behind the menu, the
palette and the keyboard.

**Phase 10 — configurable, and hard to break.** _Done._ Workspaces composed
from three named regions with movable modules, eight presets, named custom
layouts, per-device storage and a reset two clicks from anywhere; a board
capability contract with concealment no call site can undo, and a fallback for
artwork that will not render; a searchable settings screen that reports whether
each integration works, and exports configuration without credentials;
rebindable keyboard commands with conflict handling; the position-health panel;
tablebase-refereed endgame conversion; and indexed player and metadata search
measured at 500,000 games.

**Phase 11 — a release candidate that says where it got everything.** _Done._
Arbitrary UCI engines behind a real handshake; Lichess and Chess.com game sync
on each API's own cursor; the one-click position report with per-section
provenance; historical migration fixtures; seeded fuzz testing; concealment
asserted by DOM absence; and a zero-retry browser gate.

**Phase 12 — the last four reasons to leave.** _Done._ Cross-database
management — copy, move, merge, duplicate resolution, federated search and
named source sets over one collection port, with a move that never deletes what
the destination has not confirmed; factual player profiles whose every figure
carries its denominator and whose tendency metrics print the rule they applied;
opening classification from a CC0 position index keyed by canonical identity,
so transpositions converge and the deepest name wins; local Syzygy probing
through a companion-managed Fathom helper, so the whole setup is choosing a
folder; the position report's print and save-to-study; and the reliability work
Phase 11 deferred — provider chaos, accessibility, visual regression, an
extended soak and a configuration wiring audit.

**Phase 13 — useful before you add anything.** _Done._ A bundled reference pack
of 175,022 elite games that installs itself on first run and answers offline; a
data catalog listing every source with its licence, its provenance and a switch
per capability; a player library of 12,609 identities plus a curated roster of
106 historical figures the open archive cannot contain; an opening library
searchable by code, name, nickname, moves or position; opening books including
Polyglot, kept separate from the explorer; a managed engine catalogue that
downloads, digest-checks and interrogates five open-source engines without
leaving the application, with a trust model that does not claim a sandbox it
does not have; Lichess sign-in through PKCE; conditional Chess.com syncing; a
board that is the largest thing on the screen at every supported size, drawn by
one renderer that the Settings preview also uses; twelve themes and ten piece
sets; and a release gate that runs the whole thing on an empty browser profile
with the network switched off.

**Later — assistance.** A `ChessContext` assembled from engine output, database
evidence, position features and the user's own history, so that an explanation
is grounded in structured evidence rather than generated from a number.

## Phase 22 navigation and acceptance boundaries

Theory Book's **All openings** action uses the existing analysis cursor's
`toStart`; it does not replace or clear the game tree. Named branches continue
to use the existing PGN import boundary. A library load failure renders a
terminal explanation rather than an indefinite loading label.

Diagnostics and desktop logs remove URL credentials, query strings, fragments
and home-directory identities, including values not registered as application
secrets. Both have regression tests at their output boundary.

`playwright.packaged.config.ts` runs the same long navigation assertions through
`e2e/desktop-test.ts` in a fresh packaged Electron profile. Development servers
are not started for that run. The synthetic query-cache injection test remains
browser-only because production deliberately exposes no query-client test hook.
Resource counters treat repeated close/terminate/disconnect calls as idempotent.
`scripts/desktop-field.mjs` installs all real optional packs through the UI and
checks restart, source-specific offline answers and Theory Book navigation.
