# 0009 — A position is placement, side, castling and usable en passant

**Status:** Accepted

## Context

The local explorer answers one question: _what has been played from this
position, in my games?_ Answering it requires deciding when two positions are
the same position, and the obvious answer — compare the FEN — is wrong in a way
that quietly destroys the feature.

A FEN carries six fields. Two of them describe the history of the game rather
than the position:

- the **halfmove clock**, which counts moves since the last capture or pawn move;
- the **fullmove number**, which counts moves from the start.

Neither changes what may legally be played, and both differ constantly between
transpositions. `1.Nf3 d5 2.d4` and `1.d4 d5 2.Nf3` reach an identical board
with halfmove clocks of 0 and 1. Keying on the full FEN puts those two games in
separate buckets, and the explorer reports two positions with one game each
instead of one position with two — silently, and exactly in the case a
repertoire player most wants merged.

The remaining fields all matter:

- **placement** and **side to move** are the position;
- **castling rights** change the legal moves, so a position where White may
  still castle is not the position where White may not.

**En passant is the subtle one.** The naive reading — strip it, it is transient —
is wrong, because when an en passant capture is available it is a legal move
that exists in one position and not the other. The naive opposite — always keep
it — is also wrong, and is what breaks the transposition above: after `2.d4`
a pawn has just made a double push, so a literal reading records a target
square even though no pawn can capture it.

## Decision

The canonical position key is the first four FEN fields:

```
<placement> <side to move> <castling> <en passant>
```

with the en passant field carrying a square **only when a capture there is
actually available**. Move counters are excluded.

This works because the rules layer already normalises en passant that way: the
underlying position implementation emits `-` for a double push with no enemy
pawn beside it, following the current FIDE/X-FEN convention. The key inherits
that normalisation rather than reimplementing it, so there is one definition of
"is this en passant real" in the codebase.

`positionKey(fen)` in `src/chess/fen.ts` is the only implementation. The game
repository indexes on it and looks up by it; the explorer never sees a FEN.

## Consequences

- Transpositions merge, which is the whole point. `src/persistence/import-game.test.ts`
  imports the same position by two move orders and asserts one merged bucket —
  a regression test, because this is the kind of thing that breaks invisibly.
- The invariant is asserted directly as well: counters ignored, castling rights
  distinguished, en passant kept when usable and absent when not.
- Threefold repetition uses the same key, which is correct: repetition is
  defined over positions in exactly this sense.
- The key is a string, so it indexes in IndexedDB without a custom comparator.
  It is longer than a hash would be; hashing can be added underneath the same
  function if the index ever needs the space, without touching a caller.
- Position identity is history-free by construction, so the index cannot answer
  "how did the game get here?". That belongs to the game record, which the
  explorer already joins against for results and ratings.
