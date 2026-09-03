# 0036. A custom engine earns its key by completing a handshake

Status: Accepted

## Context

The companion's single most important rule is that requests carry resource
_keys_, never filesystem paths (ADR 0015). It is what separates "start the
engine the user installed" from "execute any file on this disk", and every
route in the companion obeys it.

Supporting an arbitrary UCI engine appears to require breaking that rule, and
in one narrow sense it does: there is no way to name a binary this application
never installed except by naming it. The question is not whether a path can
arrive — it must — but what has to be true before that path is allowed to
become a key.

The engine layer itself needed nothing. Capabilities have been read from an
engine's own `option` lines since Phase 6 rather than from a per-engine table,
so an unknown engine is already driven by exactly the same session code as
Stockfish. The gap was entirely one of trust.

## Decision

**Registration is the only route that accepts a path, and a path that fails
either check never becomes a key.**

The first check is that the file is a real, executable file — not a directory,
not a missing path, not a text file. The second is a full UCI handshake:
start, `uci`, wait for `uciok`, `isready`, wait for `readyok`, quit. Only then
is a key minted and the registration persisted.

The handshake is the check that matters. A file being executable says nothing
about whether it speaks UCI; `/bin/ls` is executable. Without it, a mistyped
path would be accepted cheerfully and fail later, during analysis, with an
error pointing at the engine rather than at the registration that should never
have succeeded.

**Failure is isolated by construction.** The handshake has its own timeout,
handles `error` and `exit` on the child, and always cleans up — `quit`, then
SIGKILL after a grace period, exactly as `EngineHost` does. A binary that
crashes, hangs, or prints nothing produces a specific rejection, not a
destabilised companion. A test runs a second handshake immediately after a
failed one to prove nothing was left behind.

**The key is derived from the path**, so re-registering the same binary
resumes rather than accumulating duplicate entries, and a stale registration
whose file has since been removed is dropped at load rather than left to fail
at first use.

**Nothing is inferred about the engine beyond what it says.** Its search
family is recorded as `unknown` rather than guessed. The family is shown to
explain _why_ two engines disagree, and a wrong guess there would misrepresent
exactly the thing it exists to explain.

## Consequences

Once registered, a custom engine is indistinguishable from a catalogue one to
every other part of the application: same provider class, same session code,
same capability detection, same selector. Adding support for a new engine
requires no code.

The executable-bit check is weaker on Windows, where the concept differs. This
costs little, because the handshake — not the permission bit — is what
actually establishes that a binary is an engine.
