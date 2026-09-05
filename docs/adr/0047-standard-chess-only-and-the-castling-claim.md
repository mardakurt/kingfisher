# 0047. Standard chess only — and a castling right is a claim to be checked

Status: Accepted

## Context

Phase 16 was asked to treat Chess960 as a high-value completion item, and to
either deliver it end to end or prove why not — explicitly, rather than
shipping half of it. Auditing that turned up a defect in standard chess, so
this ADR records both.

### What the audit found first

A castling right in a FEN is a claim about where two pieces are standing. `K`
means the white king has never moved and is on e1, and the h1 rook has never
moved and is on h1. Nothing in Kingfisher was checking the claim.

The rules engine's answer to an unchecked claim is worse than an error.
Given `4k3/8/8/8/8/8/8/R4K1R w KQ - 0 1` — a white king on **f1**, rooks on a1
and h1, both rights set — chess.js 1.4.0 offers `O-O-O`, and playing it slides
the king from f1 to d1 and **leaves both rooks where they were**:

    before  4k3/8/8/8/8/8/8/R4K1R w KQ - 0 1
    after   4k3/8/8/8/8/8/8/R2K3R b - - 1 1

That is not castling. It is an illegal move presented to the user as a legal
one, in a position they can then store in a study and analyse.

It was reachable through a PGN `[FEN]` tag or a pasted FEN. Notably it was
_not_ reachable through the position setup dialog, which had checked the
invariant since it was written — the check existed in exactly one place, and
that place was not the one every position flows through.

### What Chess960 would actually cost

- **The rules engine cannot do it.** chess.js 1.4.0 hard-codes the rooks at
  a1/h1/a8/h8 and the kings at e1/e8, and rejects Shredder-FEN castling fields
  (`HFhf`) outright. There is no option to turn on.
- **A replacement exists and was verified.** `chessops` parses Shredder FEN,
  generates `O-O` from a king on g1 with the rook on h1, emits the UCI
  king-takes-rook form `g1h1`, and lands the rook on f1 correctly. So the
  problem is not that the ecosystem cannot do this.
- **The boundary is genuinely clean.** `src/chess/position.ts` is 304 lines and
  is the only file in the repository that imports `chess.js`. Swapping the
  engine behind it is exactly what ADR 0007 and the `Position` boundary were
  built for, and — unlike the shortcut ADR 0028 rejected — it would leave the
  PGN tree parser, with its variations, comments and NAGs, untouched above it.
- **But the rules engine is the smallest part.** Chess960 also needs
  Shredder/X-FEN castling in `fen.ts`, castling-by-clicking-the-rook in the
  board, a `Variant` tag through PGN import and export, a non-standard start
  position through the tree, persistence and the revision model, `UCI_Chess960`
  negotiated on every engine session, and the position setup dialog.
- **And every reference surface would be empty.** The opening index, the three
  reference packs, model games, preparation and the theory radar are standard
  chess. That is not a gap to be filled later; Chess960 openings are a
  different game, and there is no open corpus of them to index.

## Decision

**Kingfisher plays standard chess, and now enforces it in its own parser.**
`parseFen` rejects a castling right whose king or rook is not on its home
square, naming the square it expected. The check is in Kingfisher's code rather
than in whatever the rules engine tolerates this year, and it runs on every
path — paste, import, setup, restore — because everything goes through the
parser.

**Chess960 is not implemented, and is not partially implemented.** The
alternative was to swap the rules engine inside a phase that is also auditing
persistence, engines, packs and performance. ADR 0028 already recorded why that
is the wrong trade: "a chess correctness regression is the worst class of bug
this product can ship: it is silent, it corrupts stored games, and the user has
no reason to distrust the result." A hurried engine swap is how one ships.

## Consequences

- A PGN whose `[FEN]` tag claims impossible castling rights no longer imports
  as an illegal position. It falls back to the standard start and records why,
  through the recovery path that already existed for a malformed FEN.
- `src/chess/variant-contract.test.ts` holds the contract, including the exact
  defect above, and the Ruy Lopez that proves declining all of it cost nothing.
  Reverting the parser change fails three of its tests.
- The full suite passed unchanged with the new validation in place, so no
  position Kingfisher itself produces has ever violated the invariant — as
  expected, since rights are only ever removed as a game is played.
- Chess960 remains possible and is now cheaper to cost. The engine is
  identified, the boundary is measured at one file, and the work that is _not_
  the engine is listed above. It is a phase, not an afternoon.
- Each engine's `UCI_Chess960` support is still measured and stored, so the
  question stays "does Kingfisher do this" rather than "which binaries could".
