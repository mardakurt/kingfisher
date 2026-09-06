# Chess engines

The catalogue lists engine distributions by platform. Availability is not a
capability claim: a native engine must pass installation verification before it
is registered, and what it can do is read from the engine itself rather than
from this table.

`npm run engines:verify` installs every engine the running platform offers,
checks each download against its recorded digest, launches it and interrogates
it. The results below were produced by that command, not written by hand.

## What is supported

| Engine      | Version | Family                | Runs as            | Licence          | Needs the companion |
| ----------- | ------- | --------------------- | ------------------ | ---------------- | ------------------- |
| Stockfish   | **18**  | alpha-beta + NNUE     | WebAssembly Worker | GPL-3.0-or-later | **no**              |
| Stockfish   | **19**  | alpha-beta + NNUE     | native process     | GPL-3.0-or-later | yes (~82 MB)        |
| Stormphrax  | 8.0.0   | alpha-beta + NNUE     | native process     | GPL-3.0-or-later | yes (~57 MB)        |
| Viridithas  | 20.0.0  | alpha-beta + NNUE     | native process     | AGPL-3.0-only    | yes (~57 MB)        |
| Halogen     | 16.0.0  | alpha-beta + NNUE     | native process     | GPL-3.0-or-later | yes (~20 MB)        |
| PlentyChess | 8.0.0   | alpha-beta + NNUE     | native process     | GPL-3.0          | yes                 |
| Lc0         | 0.32.1  | neural network + MCTS | native process     | GPL-3.0-or-later | yes (see below)     |

Lc0 uses a different search/evaluation approach from Stockfish. The comparison
view keeps each engine's outputs and settings separate. A disagreement is a
reason to inspect the lines and search conditions, not proof of a strategic
claim or of which engine is right.

### Engines considered and left out

| Engine    | Why not                                                                                                                                                                                                                                                                                            |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RubiChess | Most recent release August 2024, one Windows archive. Kingfisher offers actively released engines.                                                                                                                                                                                                 |
| Ethereal  | Its current distribution model was checked before it was considered: recent Ethereal is sold commercially rather than released as a free binary, and its networks are not freely redistributable. It is not an open-source engine Kingfisher can install, and presenting it as one would be false. |

Berserk 14, Obsidian 16.0 and Koivisto 9.0 moved _onto_ the list in Phase 15.
They publish Windows-only builds (Koivisto also Linux), which used to be a
reason to leave them out entirely. It is a better answer to list them and let
the platform matrix decide: on Windows they are three more installable engines,
and on macOS the row states plainly that no build exists for this machine
rather than pretending the engine does not.

That table lives in `scripts/engine-catalogue.mjs` as `NOT_INCLUDED` as well as
here, because "why is X not on the list" is a question with an answer and the
answers change: an engine that ships only a Windows binary today may ship more
tomorrow.

### Why the two Stockfish rows differ

The native engine is **Stockfish 19**; the browser engine is **Stockfish 18**.
That is not an oversight and the versions are not going to be made to match for
the sake of matching.

Stockfish 19 was released on 5 September 2026. The native binary was upgraded
the day after, once it had been downloaded, hashed, launched and made to search
— see the fleet table below.

There is a Stockfish 19 WebAssembly build: `@lichess-org/stockfish-web@0.5.0`
ships `sf_19.wasm`. It is not the browser engine here, for four reasons that
were checked rather than assumed:

- It carries **no embedded network**. The 587 kB module requires a net to be
  fetched separately and injected through `setNnueBuffer`, where the build
  Kingfisher ships is 7.3 MB with the network already in it.
- Its interface is **not the UCI-over-`postMessage` worker protocol** the
  browser engine session speaks. It is an Emscripten module with `uci()` and a
  `listen` callback, and its own README says it "is not straight-forward to
  load and use" and points elsewhere for a simpler browser Stockfish.
- It is built for `web,worker` environments, and **it has not been seen to
  run here**. A load attempt under Node hung rather than initialising, which is
  consistent with that, and is not evidence that it works.
- It is **AGPL-3.0-or-later**, where the current browser build is GPL-3.0. That
  is a licence change for code served to every visitor and needs review, not a
  version bump.

`stockfish` on npm — nmrugg/stockfish.js, the package Kingfisher does ship,
which embeds its network and speaks plain UCI — is at **18.0.8**, published
15 June 2026. There is no Stockfish 19 release of it.

So the browser says Stockfish 18 because that is what runs in the browser.

### What the fleet actually reported

`npm run engines:verify` on macOS arm64 (Apple silicon, CPU features `neon`),
6 September 2026. Every row was installed from its official release, verified
against its recorded digest, launched and asked:

| Engine      | UCI `id name`         | MultiPV | WDL | searchmoves | Syzygy | UCI_Chess960 |
| ----------- | --------------------- | ------- | --- | ----------- | ------ | ------------ |
| Stockfish   | **Stockfish 19**      | yes     | yes | yes         | yes    | yes          |
| Stormphrax  | Stormphrax 8.0.0      | yes     | yes | yes         | yes    | yes          |
| Viridithas  | Viridithas 20.0.0-dev | **no**  | no  | **no**      | yes    | yes          |
| Halogen     | Halogen 16.0.0        | yes     | no  | **no**      | yes    | yes          |
| PlentyChess | PlentyChess 8.0.0     | yes     | no  | **no**      | yes    | yes          |
| Lc0         | Lc0 v0.32.1+git.dirty | yes     | yes | yes         | yes    | yes          |

Stockfish 19's binary hashed to
`8eed61129d1493c5d1f2fd9323f0c54c47ac49319911fbde18c6b9c87e8b13c5` after
extraction, from the release asset
`stockfish-macos-universal.tar.gz`
(`a1f0e3bc…`). Its Chess960 support was checked by more than the option being
present: with `UCI_Chess960` set it searched a shuffled start position and
returned a principal variation containing `f1h1` and `f8h8` — castling in the
king-takes-rook encoding, which an engine that had merely accepted the option
would not produce.

Stockfish 19 also changed how it publishes: one universal binary per operating
system instead of one per instruction set, gzip-compressed tarballs, and a
Linux arm64 asset that did not exist before. The catalogue names the same
asset for `darwin-arm64` and `darwin-x64` because upstream now ships one.

Berserk, Obsidian and Koivisto publish no macOS build and were correctly
offered no Install button. Lc0 is a `system` engine — located, not downloaded.

The bolded results are why the checks exist. Kingfisher had assumed that every
engine it could drive over UCI honoured `searchmoves`, on the reasoning that it
is part of UCI rather than an option an engine declares. Three of the five
engines installable on this machine ignore it and answer with their own
preferred move. Under the old assumption, "compare these three candidates"
would have returned a search of the whole position and presented it as a
comparison of the three moves. The capability now comes from this measurement,
and the session additionally checks that the move it got back was one of the
moves it asked about — because an engine can accept the restriction and ignore
it anyway, and only the answer proves what happened.

`UCI_Chess960` is recorded because it is a fact about the engine. **Kingfisher
does not play Chess960**: its rules code assumes the standard starting squares
for castling, and nothing in the board, PGN or FEN paths has been built or
tested for shuffled positions. Knowing which engines could support it is what
makes adding it later a question about Kingfisher rather than a survey of nine
binaries.

## Installing them

**From inside Kingfisher.** Settings → Engine → Engines lists every engine the
catalogue offers for this machine with an Install button. Installation
downloads from the project's own release page, checks the SHA-256 against a
digest committed to this repository, makes the file executable, and then
**interrogates it** before registering it — see the validation matrix below.
Progress, including which stage it is at, is shown on the row. Nothing is
registered unless every step passes, and a failure removes what it wrote.

**From a terminal**, for scripted or offline setups:

```bash
npm run engines:install            # the defaults for this platform
npm run engines:install -- --all   # including native Stockfish
npm run engines:install -- --list  # what is available, without downloading
npm run engines:digests            # re-record digests after adding an engine
```

The two paths keep separate records — `public/engine/manifest.json` for the
command-line installer, `companion/data/managed-engines.json` for the in-app
one — and both feed the same registry. Three provenances, three records, one
registry: merging them would make "where did this engine come from" unanswerable,
which is the question the trust model turns on.

### What a recorded digest proves

Exactly this: the file downloaded now is byte-identical to the one this project
downloaded when the digest was recorded. It is **not** a signature, and it does
not prove the release is authentic — no upstream chess engine project publishes
signed digests today. It does mean a release asset silently replaced after the
fact, or a download corrupted or intercepted in transit, fails the install
rather than being run.

## The validation matrix

Every managed install runs the binary and records what happened.
`companion/src/engine-verify.mjs` performs, in order:

| Check         | What is actually done                                                 |
| ------------- | --------------------------------------------------------------------- |
| `handshake`   | `uci` → `uciok`                                                       |
| `isready`     | `isready` → `readyok`                                                 |
| `search`      | `position startpos` + `go depth 6` → a syntactically legal `bestmove` |
| `stop`        | `go infinite`, then `stop` → `bestmove` promptly                      |
| `multipv`     | `MultiPV=2` → at least two distinct `multipv` indices in one search   |
| `searchmoves` | `go depth 8 searchmoves a2a3` → `bestmove a2a3` and nothing else      |
| `wdl`         | `UCI_ShowWDL=true` → an `info` line carrying `wdl w d l`              |
| `syzygy`      | a `SyzygyPath` option exists                                          |
| `malformed`   | an option that does not exist → the engine still answers `isready`    |

`handshake` and `search` are fatal: an engine failing either is deleted, not
installed. Everything else is recorded as a capability and shown on the row,
struck through where it is absent.

This is why Kingfisher carries no capability table. Measured on this machine in
September 2026:

| Engine     | MultiPV | searchmoves | WDL | Syzygy |
| ---------- | ------- | ----------- | --- | ------ |
| Stormphrax | yes     | yes         | yes | yes    |
| Halogen    | yes     | **no**      | no  | yes    |
| Viridithas | **no**  | **no**      | no  | yes    |

Halogen answers `go … searchmoves` with `info string unable to handle command`,
and Viridithas 20 publishes no `MultiPV` option at all. A hand-written table
would have claimed both, and the analysis panel would have quietly shown one
line where the user asked for three.

### Binaries are not committed

`engines/` and `public/engine/` are ignored. These are GPL binaries of 25–115 MB
and they belong to their projects, not to this repository. Downloading them on
demand also means the licence obligation is the user's normal one — they have
the binary the project published, and its source is where the project publishes
it.

### Lc0 on macOS

The Lc0 project ships no macOS release asset. Building it during
`npm install` would need meson, ninja and a C++ toolchain and would fail on
most machines, so the installer does the honest thing: it looks for an existing
`lc0` on `PATH` and tells you how to get one if there is none.

```bash
brew install lc0
```

Homebrew's formula is in `homebrew-core` and is maintained. On Linux most
distributions package it; on Windows the project's own releases have binaries.

### Lc0 weights

Lc0 0.32 embeds a small network, which is why it runs immediately after
installation. It is not a strong one. A better network goes in the engine's
`WeightsFile` option, and networks are at <https://lczero.org/play/networks/>.

The application reports what the engine says about itself rather than assuming:
the backend and network Lc0 announces on startup are surfaced in the engine
panel, so "which net am I actually running" is answerable.

## The trust model

Three ways an engine gets into Kingfisher, and they do not carry the same risk.
`src/engine/trust.ts` is where these words live in the code, and the engine row
shows them beside the engine they describe.

### 1. Browser engine — sandboxed by the browser

Stockfish WebAssembly runs in a dedicated Web Worker.

- No access to the page: a Worker has no `document`, no DOM, no `window`.
- No access to Kingfisher's state except the UCI lines on its message port.
- No filesystem, and no network beyond what the page itself is allowed.
- Terminating the Worker stops the search and frees its memory immediately.

This is a real sandbox, enforced by the browser, and it is the only one here.

### 2. Managed native engine — verified, runs as you

- Downloaded only from the URL in `scripts/engine-catalogue.mjs`, which is the
  project's own release page.
- SHA-256 checked against `scripts/engine-digests.json`; a mismatch installs
  nothing and deletes the download.
- Spawned with an **argument array, never a shell string**, so nothing in a
  request can be interpreted as shell syntax.
- Requests name a **registry key, never a path**. No request can start a binary
  that was not installed. This is the single most important rule in the
  companion (`companion/src/security.mjs`).
- Proven to speak UCI and to find a move before being registered at all.
- Stopped with `quit`, then `SIGKILL` 400 ms later if it ignores that; at most
  four engine processes run at once.

**It is not sandboxed.** A native engine is a program running with the same
operating-system permissions as anything else you launch: your files, your
network. Kingfisher verifies where it came from and that it is what it claims
to be. It does not confine it, and the UI does not say it does.

That is a deliberate choice, not an oversight. macOS (`sandbox-exec`, App
Sandbox), Linux (seccomp, namespaces, bubblewrap) and Windows (job objects,
AppContainer) all offer isolation, and none of them can be applied uniformly,
from a Node process, to an arbitrary downloaded binary, without either failing
on some platforms or degrading the engine — Stockfish wants large pages and
many threads; Lc0 wants a GPU. A badge reading "Sandboxed" that actually means
"we checked the SHA-256" is worse than no badge. If a portable, provable
confinement becomes practical, it is a change to this section first.

### 3. Custom native engine — your own program

An executable the user picked from their own disk.

- Confirmed to be a real executable file before anything is started.
- Proven to complete a UCI handshake before it is given a registry key.
- Started with an argument array, never through a shell.
- Stopped and cleaned up exactly like a managed engine.

What Kingfisher tells the user, in these words:

> Custom native engines are programs you choose to run and have the same
> operating-system permissions as other applications you launch.

No digest is checked, because there is nothing to check it against — the user
chose the file. Its licence is recorded as unknown rather than guessed.

### Process cleanup

`EngineHost.stop` writes `quit`, waits 400 ms, then `SIGKILL`s. `stopAll` runs
on companion shutdown. Uninstalling an engine stops any session running it
first. A session whose child exits emits `#exit <code>` to its subscribers, so
a crashed engine surfaces as a crashed engine rather than a stalled panel.

## Licence obligations

License metadata must match each pinned release. In particular,
[Viridithas 20](https://github.com/cosmobobak/viridithas/blob/v20.0.0/README.md)
declares AGPL-3.0-only and
[PlentyChess 8](https://github.com/Yoshie2000/PlentyChess/blob/b-v8.0.0/LICENSE)
carries GPL version 3. Do not describe either as MIT.

Kingfisher does not distribute them. They are downloaded from the upstream
project at the user's request, onto the user's machine, and are executed as
separate processes communicating over UCI. That is the arrangement every chess
GUI uses, and it does not make Kingfisher a derivative work: there is no
linking, and the protocol boundary is at arm's length.

If Kingfisher were ever to ship a binary in a bundle, that bundle would have to
carry the GPL and an offer of source for the engine. It does not, and the
installer exists partly so that it never has to.

## How the application talks to them

Everything goes through `UciTransport`, which is a line in and a line out.
Behind it:

- `UciWorkerClient` — `postMessage` to a Web Worker.
- `CompanionTransport` — `fetch` for commands, Server-Sent Events for output,
  through the local companion.

Above it, one `UciSession` drives every engine: it serialises searches so a new
request cleanly supersedes a running one, coalesces the `info` flood into
UI-rate snapshots, keeps MultiPV lines in rank order, and converts scores to
White's point of view. Adding an engine is a transport and a capability record,
not another copy of that logic.

**Capabilities are read from the engine, not tabulated.** Each engine's `option`
lines are parsed at handshake, so `MultiPV`, `Threads`, `Hash` and `SyzygyPath`
support is whatever that binary actually declares. This matters: Lc0 has no
`Hash` and no `Use NNUE`, its `Threads` default is 0, and it takes a
`WeightsFile` no alpha-beta engine has. A hand-written table would encode those
differences as folklore and go stale.

## Opening books

An opening book is **not** the opening explorer, and Kingfisher keeps them
apart on purpose. An explorer answers _what has been played here_, from a
population you can name and count. A book answers _what to play here_, from
somebody's weights — and the somebody matters, because two books disagree in
ways no number of games can settle. So a book move never appears in the
explorer's table: it has its own panel, its own numbers, and a line naming the
book it came from.

### The Kingfisher book

Derived rather than authored, from whichever reference sources are installed:
"how often was this move chosen, by players rated this highly". No download, no
separate file, and a weight whose population you can ask about and get an
answer — which is more than an anonymous `.bin` can offer. Moves under 2% of a
position's games are left out; that is a fact for the explorer, not advice.

### Polyglot `.bin`

The interchange format every engine and GUI supports. Settings → Engine →
Books takes a file, checks it, and stores it whole in IndexedDB. Lookups are a
binary search over the sorted key array, so a hundred-megabyte book costs two
or three reads per position rather than a parse.

Two parts of the format are easy to get subtly wrong and are handled in
`src/book/polyglot.ts` rather than left to callers:

- **The en-passant square is hashed only when the capture is really
  available.** A FEN records the square after any double pawn push; Polyglot
  hashes it only if an enemy pawn is standing beside the pushed one. Getting
  this wrong makes roughly one position in forty silently miss.
- **Castling is stored as king-takes-own-rook.** White's O-O is `e1h1`, which
  is not a move anyone can play, and is translated back.

All nine positions the specification publishes worked keys for are asserted in
`polyglot.test.ts`. There is no partial credit with a Zobrist key: either it is
the same number everybody else computes, or the book reads nothing.

### Engines never play from their own book

Kingfisher sends `setoption name OwnBook value false` to every engine that
declares the option, at session construction, before any configuration the
caller asks for.

This is not a preference. An engine answering from an internal book returns a
move instantly with no search behind it, and the analysis panel would report
that as an evaluation at depth 0 — a number the engine never computed. §30 of
the brief puts it exactly right: do not let an engine silently use a book while
the interface claims the move came from search. Kingfisher's answer is that the
engine does not use one at all, and the books it _does_ consult are named in
their own panel.

`BookPath` is deliberately not offered for the same reason.

## Running two at once

Two is a hard limit, and they split the thread budget. A third search would take
cores from the interface, and a board that stutters costs more than a third
opinion is worth. The comparison reports where the two agree, how far their
principal variations run together, and how far apart their evaluations are — and
refuses to subtract a mate score from an evaluation, for the same reason the
MultiPV gap does.
