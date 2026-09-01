# Chess engines

Kingfisher runs three engines. Each is listed only because it has been started,
driven and stopped from the application — there is no aspirational entry and no
greyed-out placeholder, because a selector listing an engine that cannot run
wastes the user's time finding that out.

## What is supported

| Engine             | Version | Family                | Runs as            | Licence          | Needs the companion     |
| ------------------ | ------- | --------------------- | ------------------ | ---------------- | ----------------------- |
| Stockfish          | 17.1    | alpha-beta + NNUE     | WebAssembly Worker | GPL-3.0-or-later | no                      |
| Lc0                | 0.32.1  | neural network + MCTS | native process     | GPL-3.0-or-later | yes                     |
| Stormphrax         | 8.0.0   | alpha-beta + NNUE     | native process     | GPL-3.0-or-later | yes                     |
| Stockfish (native) | 18      | alpha-beta + NNUE     | native process     | GPL-3.0-or-later | yes (optional, ~115 MB) |

Lc0 is there for a reason beyond variety: it disagrees with Stockfish
_systematically_ rather than randomly. MCTS is more optimistic in closed
positions and less certain about long forcing lines, so where the two part
company is a useful signal about the position. That is what the two-engine view
is for.

## Installing them

```bash
npm run engines:install            # the defaults for this platform
npm run engines:install -- --all   # including native Stockfish
npm run engines:install -- --list  # what is available, without downloading
```

The installer only fetches from each project's own release page, checksums what
it downloads, and then **proves the binary works** by sending it `uci` and
reading back its name. An engine that downloads but does not answer is not
registered. What it installed is written to `public/engine/manifest.json`,
which is the only list the companion will start anything from.

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

## Licence obligations

All four are **GPL** — GPL-3.0-or-later in every case here.

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

## Running two at once

Two is a hard limit, and they split the thread budget. A third search would take
cores from the interface, and a board that stutters costs more than a third
opinion is worth. The comparison reports where the two agree, how far their
principal variations run together, and how far apart their evaluations are — and
refuses to subtract a mate score from an evaluation, for the same reason the
MultiPV gap does.
