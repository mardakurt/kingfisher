# 0002 — Own game tree and PGN implementation

**Status:** Accepted

## Context

`chess.js` is the obvious choice for chess rules, and it is used here for
exactly that. It also offers `loadPgn()` and `pgn()`. But `chess.js` models a
game as a _line_: importing a PGN discards its variations.

Variations are not a detail of this product. Repertoires, studies, opening
preparation and analysis are all operations on a tree. A game model that cannot
hold one would have to be replaced before the second milestone.

## Decision

Own both the tree and the PGN layer.

- `chess/tree/` — `GameTree` as a flat `Record<NodeId, MoveNode>` with ordered
  children, and pure operations over it. It knows no chess rules; callers hand
  it validated moves. Rule-dependent helpers live in `chess/game.ts`.
- `chess/pgn/` — a real tokenizer and recursive-descent parser, plus a
  serializer, plus handling for the `[%cal]` / `[%csl]` / `[%eval]` / `[%clk]`
  commands that annotation tools hide inside comments.

`chess.js` is confined to `chess/position.ts`, which is the only module allowed
to import it.

## Consequences

- Nested variations, comments, glyphs, arrows and evaluations survive an import
  and an export. This is tested against a full annotated master game.
- Parsing is recovery-oriented: an illegal move truncates its variation and is
  reported, rather than failing the file. Real PGN archives contain broken
  games.
- More code to own, including a parser. Mitigated by that code being pure and
  heavily tested, and by it being the part of the codebase least likely to need
  to change.
- The rules implementation stays swappable: one file.
