# 0041. Three engine trust levels, and the sandbox Kingfisher does not claim

Status: Accepted

## Context

Kingfisher now downloads native binaries and runs them. That is the most
consequential thing this application does to a user's machine, and the
temptation is to reassure: verify the download, check a digest, and put
"Sandboxed" on the row.

It would be false. A native engine is a process with the user's own
operating-system permissions: their files, their network. Checking its SHA-256
says something about where it came from and nothing about what it can do.

## Decision

Three levels, named separately, with the word _sandboxed_ reserved for the one
place it is true.

**Browser.** Stockfish WebAssembly in a dedicated Worker. No `document`, no
DOM, no page state, no filesystem, no network beyond the page's own. This is a
real sandbox, enforced by the browser, and it is the only one here.

**Managed native.** Downloaded from the URL in the catalogue — the project's
own release page — digest-checked against a file committed to this repository,
spawned with an argument array and never through a shell, addressed by a
registry key and never by a path, proven to speak UCI and to find a move before
being registered, and killed on `quit` with a `SIGKILL` 400 ms later. And it
runs with the user's permissions, which the UI says in those words.

**Custom native.** An executable the user chose. Confirmed executable, proven
to complete a handshake, otherwise identical — and no digest, because there is
nothing to check one against.

`src/engine/trust.ts` holds this text, the UI renders it beside the engine it
describes, and `trust.test.ts` fails if the word "sandboxed" ever appears
against a native level.

## Consequences

A user can find out what running an engine means without reading the source,
and what they find out is true.

**Why not actually sandbox it.** macOS (`sandbox-exec`, App Sandbox), Linux
(seccomp, namespaces, bubblewrap) and Windows (job objects, AppContainer) all
offer isolation. None can be applied uniformly, from a Node process, to an
arbitrary downloaded binary, without either failing on some platforms or
degrading the engine — Stockfish wants large pages and many threads, Lc0 wants
a GPU. Shipping a badge that means "we checked the SHA-256" would be worse than
shipping no badge. If a portable, provable confinement becomes practical, it is
a change to this ADR first.

**What a digest actually proves**, stated in the UI as well as here: the file
downloaded now is byte-identical to the one this project downloaded when the
digest was recorded. It is not a signature, and no upstream chess engine
project publishes signed digests today. It does mean a release asset silently
replaced after the fact, or a download corrupted or intercepted, fails the
install rather than being run.

**Capabilities are measured, not tabulated.** The installer runs nine checks
against the binary. This is not thoroughness for its own sake: Halogen 16
answers `go … searchmoves` with "unable to handle command", and Viridithas 20
publishes no `MultiPV` option at all. A hand-written table would have claimed
both, and the analysis panel would have quietly shown one line where the user
asked for three.
