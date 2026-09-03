# 0028. The rules-engine replacement experiment, and why chess.js stays

Status: Accepted (experiment concluded; no replacement)

## Context

Phase 7's PGN profiling attributed roughly 95% of parsing time to rules-engine
work — legal move generation and SAN resolution inside chess.js — rather than
to Kingfisher's own grammar. That makes the rules engine the single largest
lever on import speed, and it makes replacing it the obvious next idea.

It is also the highest-risk change available. Kingfisher's `Position` boundary
exists precisely so the rules engine _can_ be swapped, but a chess correctness
regression is the worst class of bug this product can ship: it is silent, it
corrupts stored games, and the user has no reason to distrust the result.

So this was scoped as a controlled feasibility experiment with a stated
threshold, not as a migration.

## Decision

**Test the fastest plausible alternative, not a hypothetical one.** The
experiment measures asking chess.js to load each game's main line directly —
bypassing Kingfisher's tree parser entirely — against the existing pipeline on
a 20,000-game deterministic corpus. It also runs the rules fixtures any
replacement would have to satisfy: legal move generation, SAN parsing, SAN
generation, castling, en passant, promotion, check and mate, FEN round-trip,
and the recorded standard-start assumption (Kingfisher does not contract for
Chess960 castling).

**Set the bar before measuring.** Accept only if the practical PGN workload
improves by at least 2x _and_ full equivalence holds — rules fixtures and
Kingfisher's semantic PGN contract both.

**Measured result:**

    Kingfisher tree parser       7,300.5 ms
    direct chess.js main lines   2,729.1 ms
    practical speed ratio             2.68x
    20,000 games resolved in both paths

    PASS  legal move generation
    PASS  SAN parsing and generation
    PASS  castling
    PASS  en passant
    PASS  promotion
    PASS  check and mate
    PASS  FEN round trip
    PASS  standard-start assumption recorded
    FAIL  PGN variations, comments, NAGs and recovery provenance

**Rejected.** The speed bar was cleared and every rules fixture passed. The
semantic contract did not: the direct path is a main-line loader. It does not
preserve variations, comments, NAGs or the provenance Kingfisher records when
recovering from a malformed game — which is most of what its PGN contract is
for. The 2.68x is being bought by discarding the tree, so it is not a 2.68x on
the same work at all.

chess.js stays. Nothing about the `Position` boundary changes.

## Consequences

The conclusion is a measurement rather than an opinion, and it will go stale.
So the experiment ships as `npm run bench:rules` inside the benchmark group,
with the threshold encoded in it: a future engine that genuinely preserves
variations and comments will print ACCEPT rather than requiring anyone to
remember this decision.

Import speed therefore remains where Phase 7 left it. The real lever on a large
import is not the rules engine but the fact that parsing already runs in a
Worker behind acknowledged batches (ADR 0021), so a 100,000-game import is
backgroundable and cancellable rather than fast.

A genuine replacement remains possible — a rules engine that exposes move
generation and SAN without owning PGN would sit behind the existing boundary
cleanly. This experiment rejects one specific shortcut, not the idea.
