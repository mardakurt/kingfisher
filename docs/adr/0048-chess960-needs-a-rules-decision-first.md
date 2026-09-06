# 0048 — Chess960 needs a licensing decision before it needs code

Status: **Open — awaiting an owner decision.** Nothing has been adopted.

## Context

Phase 18 asked for full Chess960, and was explicit about two things: do not ship
partial support, and "do not hand-roll Chess960 castling unless absolutely
necessary." It also named the criterion for the alternative — "audit a proven
**permissively licensed** library capable of correct Chess960 rules if chess.js
cannot provide them."

Chess960 changes exactly one rule. Every piece moves as it always did; what
differs is castling, because the king and rooks start on arbitrary files. The
king still finishes on g1 or c1 and the rook on f1 or d1, so the destinations
are unchanged and the difference is entirely in where the pieces set off from
and which squares must be empty and unattacked along the way.

That one rule sits behind `src/chess/position.ts`, the only module allowed to
import chess.js. So the question is what that module can be built on.

## What was audited

Every JavaScript or TypeScript chess library with a plausible claim to Chess960,
checked against its registry metadata and its own documentation on
6 September 2026.

| Library             | Version | Licence              | Chess960                                   | Last published | Verdict                   |
| ------------------- | ------- | -------------------- | ------------------------------------------ | -------------- | ------------------------- |
| `chess.js` (in use) | 1.4.0   | BSD-2-Clause         | **no** — no reference in the shipped build | current        | cannot provide it         |
| `chessops`          | 0.15.1  | **GPL-3.0-or-later** | **yes**, complete; drives lichess.org      | current        | capable; licence conflict |
| `chess960.js`       | 0.2.0   | **none declared**    | claims yes                                 | June 2022      | rejected                  |
| `chess.ts`          | 0.16.2  | BSD-2-Clause         | no                                         | April 2022     | cannot provide it         |
| `@rumenx/chess`     | 1.0.2   | MIT                  | no                                         | February 2026  | cannot provide it         |

**There is no maintained, permissively licensed JavaScript library with
Chess960 support.** The brief's preferred route does not exist.

Two of those rows need their reasoning stated rather than assumed.

`chessops` is the right library on every technical measure. It stores castling
rights as a set of squares rather than as `KQkq` flags, which is precisely what
Chess960 requires and precisely the model ADR 0047 argued Kingfisher should
have. It is written by the author of python-chess and shakmaty, whose move
ordering this repository already reproduces in
`src/database/encroissant/shakmaty-order.ts`. It is what Lichess runs. Its only
problem is its licence.

`chess960.js` is rejected on this repository's own standard. It declares no
licence, and `docs/data/historical-games-audit.md` rejected a data source for
exactly that reason: silence is not permission. It has also not been published
since 2022 and its repository field points at chess.js, which is a stale fork
rather than a maintained project.

## Why the licence is not a detail

Kingfisher's six runtime dependencies are all permissive. That is not an
accident — `README.md` explains that the Stockfish WebAssembly builds are
deliberately **not** an npm dependency "because Stockfish is GPL-3.0 licensed
and large", and fetches them at setup instead. The engines Kingfisher runs are
GPL and are separate processes, which is a different thing from linking.

Adding `chessops` would put GPL-3.0-or-later code into the bundle that is served
to every visitor, and the application distributed with it would be
GPL-3.0-or-later. That may be entirely fine — it is a reasonable licence for
this project — but it reverses a documented decision, and it is the owner's
decision and not an implementation detail an agent should make while
implementing something else.

## The three options

**A — adopt `chessops`.** Correct rules, maintained, proven at Lichess scale.
Kingfisher becomes GPL-3.0-or-later; the README paragraph explaining why
Stockfish is kept out of the bundle stops being the project's position.
`position.ts` gains a second rules adapter and the chess.js boundary becomes a
variant-dispatched boundary.

**B — implement Chess960 castling inside `position.ts`.** The rule is bounded
and completely specified: the squares between the king's origin and g1/c1 and
between the rook's origin and f1/d1 must be empty except for those two pieces,
and the king may not start in, pass through, or land on an attacked square. It
is testable exhaustively — all 960 starting positions, and castling from every
king/rook arrangement each admits. The brief warns against it, and the warning
is right: this is the rule that is easy to get subtly wrong, and ADR 0047
records that a subtly wrong castling claim already produced an illegal move
offered as legal once in this codebase.

**C — do not ship Chess960.** Kingfisher continues to refuse the positions it
cannot play, which is what it does today and what ADR 0047 defends.

## Decision

None taken. This is recorded so that the question is answered deliberately.

## What was built anyway

`src/chess/chess960.ts` is needed under all three options and is complete: the
960 arrangements, Scharnagl's numbering with the ordinary position at 518, the
starting FEN with Shredder castling rights, and the king-and-rook squares
castling is defined from. It has no move generation and makes no legality
claim. All 960 positions are asserted, not a sample, and the set is
cross-checked against an independent enumeration.

Building it turned up the first concrete thing full support would need, and it
is not where anyone would look for it: **Kingfisher's own FEN parser rejects
959 of the 960 starting positions**, and is right to. `KQkq` on a board with
the king on g1 and rooks on f1 and h1 is a false claim about where two pieces
stand, and ADR 0047 made the parser check exactly that after an unchecked claim
produced an illegal move. So there is no shortcut in which Chess960 positions
are written the standard way: the castling field has to name the rooks, and the
parser has to learn to read that. `chess960.test.ts` asserts the current
rejection so the gap cannot be lost.

## Consequences

- Chess960 is **not supported**, and `docs/ENGINES.md` and `AGENTS.md` continue
  to say so. No interface claims otherwise.
- `UCI_Chess960` remains recorded per engine as a fact about the engine, which
  is what it has always been.
- The numbering module ships and is inert: nothing in the application calls it
  yet, and it cannot make a claim about legality because it contains no rules.
- If option A or B is chosen, the FEN castling field is the first work, before
  any move generation.
