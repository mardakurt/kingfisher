# 0031. Local tablebases: capability from the files, probing delegated

Status: Accepted

## Context

Kingfisher answered tablebase questions from lichess.org, which works for
everyone and is honest about being a network call. A professional with 150 GB
of Syzygy files on the machine reasonably expects those to be used.

The obvious implementation is to read them. That is several thousand lines of
Huffman-coded table decoding, and its failure mode is a silently wrong endgame
assessment — in a product whose central claim about this feature is that a
tablebase result is _proof_ rather than opinion. A subtly incorrect DTZ is
worse than no local tablebase at all, because the user has no reason to
distrust it.

## Decision

**Capability is answered from the files; probing is delegated.** The split is
the design.

**The companion reads the directory.** Syzygy filenames encode their material —
`KQvK.rtbw`, `KRPvKR.rtbz` — so scanning gives the exact set of configurations
present and therefore the real piece limit. Someone with five-piece tables is
told five. Someone with WDL files but no DTZ files is told that too, because
the two are downloaded separately and a partial set is the state most users are
actually in. None of that is a setting or a guess.

**The probe goes to a local tablebase server.** The companion forwards to one
speaking the `lila-tablebase` API — the standard self-hosted option, and the
same shape as the public endpoint, so the client parses one format regardless
of origin. The answer comes from an implementation already trusted with it.

**A provider that cannot answer declines rather than fails.** Local is
preferred only when the position is within the derived piece limit _and_ a
probe server is configured. Either missing means the remote provider answers.
A companion with five-piece tables asked about a six-piece position is behaving
correctly.

**Provenance is always printed.** "Answered from local tables on this machine
(up to 6 pieces)", or "Local tables cover 5 pieces; this position has 7", or
"Local tables are configured but no local probe server is running". A user who
installed tables is entitled to know whether they are being used; a user who
did not is entitled to know a request left the machine.

## Consequences

The configuration users will most often arrive at — files downloaded, no server
running — produces a clear sentence rather than a silent fall back to the
network. That was the specific failure this design exists to prevent.

Kingfisher does not ship a Syzygy decoder, and the report says so rather than
implying local tablebases are a solved problem here. A user without a local
server gets the remote answer, which is what they had before.

Both halves are testable without gigabytes: the scan is exercised against
zero-byte files with real names, and the probe path is exercised against an
unreachable endpoint to prove it degrades into a fallback rather than an error.
