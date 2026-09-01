# 0015 — An optional local companion for engines, SQLite and tablebases

**Status:** Accepted

## Context

Three things a serious chess workstation needs are things a browser cannot do:

1. Run a native UCI engine. Lc0 has no WebAssembly build worth shipping, and
   native Stockfish is roughly an order of magnitude faster than the WASM one.
2. Query a game database of a million games. IndexedDB was measured to 50,000
   and is fine there; beyond that it wants a real query planner and indexes.
3. Read a 150 GB Syzygy directory from disk.

Phase 3 deferred all three. Phase 4 could not, because "multiple engines" is
not deliverable without at least the first.

## Decision

A small optional Node service in `companion/`, started by `npm run companion`.
It does exactly those three things and nothing else — no rendering, no chess
logic, no application state — and Kingfisher works fully without it.

It is reached through the existing interfaces. A native engine is an
`EngineProvider`; a SQLite collection is a `ChessDatabaseProvider`. Nothing in
the UI knows the companion exists, which is what keeps it optional rather than
load-bearing.

**Transport is HTTP + Server-Sent Events**, not WebSocket. UCI is a stream of
lines out and occasional commands in, which is the shape SSE already fits, and
SSE needs no protocol implementation, no upgrade handshake and no dependency.

**SQLite is `node:sqlite`**, built into Node 22+. This is the whole reason the
companion has no dependencies: the alternative was better-sqlite3 and a native
build step, in a project that has kept itself to five packages.

### Security

The companion spawns processes and reads files, so it is treated as hostile
surface:

- binds `127.0.0.1` only, with no option to change it;
- mints a 256-bit token per run, printed to the terminal and never written to
  disk, so closing the terminal revokes it;
- requires that token on every route except `/health`, compared in constant
  time;
- checks `Origin` against a localhost allowlist, so another site cannot reach
  it even knowing the port;
- resolves resource **keys**, never paths — a request cannot name a file;
- spawns with an argv array, never a shell.

It does not defend against another program running as the same user, and
`companion/README.md` says so. That program could read the token from the
process list. The boundary that matters is "a web page you visit cannot reach
your engines and files".

## Alternatives considered

- **Electron or Tauri.** Solves the same problems and turns a local-first web
  application into a desktop application with an install step, an update
  channel and a signing story. Too much for three capabilities.
- **WebAssembly everything.** Works for Stockfish, does not exist for Lc0, and
  cannot read a tablebase directory or a SQLite file the user already has.
- **File System Access API.** Real, and would cover reading a SQLite file, but
  it cannot run a process and is Chromium-only.
- **WebSocket.** More capable and needs either a dependency or a hand-rolled
  frame parser, for a stream that only goes one way.

## Consequences

- Native engines, large databases and local tablebases become available without
  changing the application's shape.
- There is a second process to start, and the pairing step is real friction. It
  is confined to users who want the capabilities.
- The companion is a security surface, which is why its rules are enforced in
  one file (`companion/src/security.mjs`) rather than at each route.
