# 0038. A managed probe helper, not a decoder of our own

Status: Accepted. Supersedes the "probing goes to a server the user runs" half
of [ADR 0031](0031-local-tablebases-split.md); its capability-from-the-files
half stands unchanged.

## Context

ADR 0031 refused to write a Syzygy decoder, for a reason that has not changed:
several thousand lines of Huffman-coded table decoding whose failure mode is a
silently wrong endgame assessment, inside a feature whose whole claim is that a
tablebase result is proof rather than opinion.

The consequence it accepted was that local probing required the user to start a
`lila-tablebase`-shaped server themselves. A year of use makes the cost of that
clear: it is a reasonable thing to ask of a developer and an unreasonable thing
to ask of a chess player. It was the largest remaining "go and do something
outside Kingfisher" in the application, and it meant the most common
configuration — files downloaded, nothing running — got a polite sentence
instead of an answer.

The two options were not "write a decoder" or "ask the user to run a server".

## Decision

**Kingfisher still writes no decoder, and the companion now manages one.**

The decoder is [Fathom](https://github.com/jdart1/Fathom) (MIT), the
implementation most engines use for Syzygy probing, pinned to a commit and
fetched by `npm run tablebase:install`. What Kingfisher contributes is
`companion/native/kingfisher-tbprobe.c`: a FEN parser, a request loop and a
JSON writer, compiled against Fathom. Not one byte of table format handling is
ours.

**The process is long-lived, and the companion owns it.** `tb_init` opens and
memory-maps the files; paying that per move would make walking an endgame
unusable. So the helper starts when a directory is configured, is restarted if
it dies, and is stopped on companion shutdown. The user selects a folder and
that is the entire procedure.

**Requests are serialised.** One FEN per line, one answer per line, queued.
Two overlapping probes on one stdout stream could each read the other's answer,
and a tablebase result attributed to the wrong position is the worst bug this
feature could have. Every request also carries a deadline, because a helper
that has wedged rather than exited accepts a line and never answers.

**The helper computes no chess beyond reading the position.** It returns UCI
moves with raw WDL and DTZ codes; SAN, legality, zeroing, checkmate and the
perspective inversion are added in the browser, where the rules already live.
A move the browser's rules reject is dropped rather than shown, because a
disagreement between the two is a bug and not a move anybody can play.

**Both halves of "can I probe locally" are reported separately**, because they
fail separately: what is on disk, and whether anything can read it. Someone with
six-piece tables and no C compiler is told the second thing rather than shown a
piece limit that is not real. The four ways local probing can be unavailable —
no helper built, a helper that will not start, an unreadable directory, a
directory with no tables — each produce their own sentence, because each has a
different fix.

**The external server is still supported.** A user who already runs one keeps
working, and the provenance line names which of the two answered. "Local" is not
allowed to cover two different implementations.

## Consequences

Local probing now needs a C compiler at install time. That is a real
limitation, most visibly on Windows: `npm run tablebase:install` says so, exits
without failing the install, and the remote provider keeps working. Shipping a
prebuilt unsigned binary instead would have traded a stated limitation for an
unstated trust problem.

Correctness is checked against known results rather than asserted. The unit
tests convert fixtures recorded from the real helper against real tables, and a
live suite runs the actual binary when `KINGFISHER_TEST_SYZYGY` points at a
directory of Syzygy files — three-piece tables, about 25 kB, are enough to
assert that a rook against a bare king is won, that a knight against one is not,
that the rook cannot be dropped where it stalemates, and that the opposition
decides king and pawn against king. Settings' "Test" button probes the same
rook ending, because a green tick that only proves a connection opened is worth
less than an answer the user can check.

Syzygy contains no distance to mate, so `dtm` is always null from this source.
Deriving one from DTZ would be a fabricated proof, which is the one thing this
whole design exists to avoid.
