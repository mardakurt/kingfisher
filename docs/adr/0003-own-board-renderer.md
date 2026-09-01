# 0003 — Own board renderer behind an internal interface

**Status:** Accepted

## Context

Two mature options exist: `react-chessboard` (MIT) and `chessground`
(Lichess's, imperative, GPL-3.0). Both work. The risks are different for each:
`chessground` would push a GPL obligation onto the whole application, and both
would put a third-party component's API in the middle of the product's most
important surface — the place where arrows, highlights, promotion, drag
behaviour and theming all have to feel exactly right.

## Decision

Write the board, and define the interface it satisfies (`features/board/types.ts`).

The interface is the real decision. It takes a FEN, an orientation, a map of
legal destinations and a set of shapes, and reports move intents. It contains no
chess rules and no store access. Replacing the renderer means satisfying that
interface and changing nothing else.

## Consequences

- Full control over annotation, promotion, animation and theming, with no
  dependency's release cycle in the way.
- No licence entanglement.
- Piece identity tracking across positions had to be written (`layout.ts`); this
  is what makes moves animate rather than flicker.
- Cost: board interaction is subtle, and a bug here is very visible. Two
  specific hazards are handled explicitly and documented in the file — pointer
  bookkeeping must be synchronous (press and release can share a tick), and the
  board must recheck legality itself so it can never emit an illegal intent.
