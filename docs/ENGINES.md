# Chess engines

Kingfisher offers six engines. Each is listed only because it has been started,
driven and stopped from the application — there is no aspirational entry and no
greyed-out placeholder, because a selector listing an engine that cannot run
wastes the user's time finding that out.

## What is supported

| Engine     | Version | Family                | Runs as            | Licence           | Needs the companion |
| ---------- | ------- | --------------------- | ------------------ | ----------------- | ------------------- |
| Stockfish  | 17.1    | alpha-beta + NNUE     | WebAssembly Worker | GPL-3.0-or-later  | **no**              |
| Stockfish  | 18      | alpha-beta + NNUE     | native process     | GPL-3.0-or-later  | yes (~115 MB)       |
| Stormphrax | 8.0.0   | alpha-beta + NNUE     | native process     | GPL-3.0-or-later  | yes (~57 MB)        |
| Viridithas | 20.0.0  | alpha-beta + NNUE     | native process     | AGPL-3.0-or-later | yes (~57 MB)        |
| Halogen    | 16.0.0  | alpha-beta + NNUE     | native process     | GPL-3.0-or-later  | yes (~20 MB)        |
| Lc0        | 0.32.1  | neural network + MCTS | native process     | GPL-3.0-or-later  | yes (see below)     |

Lc0 is there for a reason beyond variety: it disagrees with Stockfish
_systematically_ rather than randomly. MCTS is more optimistic in closed
positions and less certain about long forcing lines, so where the two part
company is a useful signal about the position. That is what the two-engine view
is for. Viridithas and Halogen are independent implementations with their own
evaluations, which is the same argument at lower cost.

### Engines considered and left out

| Engine    | Why not                                                                                                                                                                                                                                                                                            |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Berserk   | Release 14 (May 2026) publishes Windows executables only. An Install button that cannot work on the machine looking at it is worse than an absent row.                                                                                                                                             |
| Obsidian  | Release 16.0 publishes Windows executables only.                                                                                                                                                                                                                                                   |
| RubiChess | Most recent release August 2024, one Windows archive. Kingfisher offers actively released engines.                                                                                                                                                                                                 |
| Koivisto  | No release since 2023.                                                                                                                                                                                                                                                                             |
| Ethereal  | Its current distribution model was checked before it was considered: recent Ethereal is sold commercially rather than released as a free binary, and its networks are not freely redistributable. It is not an open-source engine Kingfisher can install, and presenting it as one would be false. |

That table lives in `scripts/engine-catalogue.mjs` as `NOT_INCLUDED` as well as
here, because "why is X not on the list" is a question with an answer and the
answers change: an engine that ships only a Windows binary today may ship more
tomorrow.

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

Five are **GPL-3.0-or-later**; **Viridithas is AGPL-3.0-or-later**, and the
difference is recorded rather than rounded off. It changes nothing for someone
running the binary — Kingfisher spawns it as a separate process and does not
link against it — but a project that writes licences down only when they are
convenient is not writing them down at all.

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
