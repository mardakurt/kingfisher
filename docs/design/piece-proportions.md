# Piece proportions

A player reported that Kingfisher's pieces looked slightly too small for their
squares. They were, and each set was too small by a different amount.

## What was wrong

Two things compounded.

**The board inset every piece by 6%.** `PieceLayer` drew the artwork with
`p-[6%]`, so the largest box a piece could occupy was 88% of its square before
the artwork's own transparent margin was taken into account.

**Every set has a different margin of its own.** An SVG's `viewBox` is not the
drawing; it is the drawing plus whatever padding the author chose, and the ten
vendored sets disagree completely. Measured at full size, the tallest piece in
each set covered anywhere from **0.802** (Cburnett) to **0.935** (Celtic) of its
square. A single global scale cannot fix both — it would make one set right and
push the other over the edge of its square.

The result on the default set: Cburnett's tallest piece covered **0.688** of its
square.

## The reference

The brief for this work mentioned a Chess.com board image as a proportional
reference. **That image was not supplied in the session this was done in**, so
it was not measured and nothing here is calibrated against it.

What was used instead is directly verifiable: **Lichess renders these same
Cburnett files at 100% of the square, with no inset.** That produces a tallest
piece of **0.782** — the artwork's own bounding box, measured from the files in
`public/piece/cburnett/`. It is the same drawing rendered by a professional
board, which makes it a real reference rather than an impression.

## The calibration

Each set carries a `visualScale` in the piece-set registry, chosen so that its
tallest piece covers `PIECE_INK_TARGET` (**0.86**) of its square. The scale is
clamped so that no piece exceeds `PIECE_INK_MAX_WIDTH` (**0.94**) — a piece that
reaches the edge touches its neighbour on a crowded board.

The scale is applied by `PieceIcon` as a CSS transform, not by resizing the
element. The element's box is the piece's tile and the drag target; only the
artwork changes size.

## Measured

`npm run pieces:measure` rasterises every piece at 400×400 exactly as the board
draws it and takes the alpha channel's bounding box, at a threshold of 24/255 so
that antialiasing and the soft drop shadows some sets carry are counted the way
the eye counts them.

| Set                  | Before (with 6% inset) | Scale | After | Widest after |
| -------------------- | ---------------------: | ----: | ----: | -----------: |
| Cburnett _(default)_ |                  0.705 | 1.072 | 0.858 |        0.917 |
| Merida               |                  0.752 | 1.009 | 0.863 |        0.930 |
| Chessnut             |                  0.695 | 1.089 | 0.860 |        0.892 |
| Fantasy              |                  0.792 | 0.956 | 0.860 |        0.870 |
| Spatial              |                  0.823 | 0.922 | 0.860 |        0.802 |
| Celtic               |                  0.823 | 0.920 | 0.860 |        0.815 |
| RhosGFX              |                  0.770 | 0.983 | 0.863 |        0.772 |
| Kiwen Suwi           |                  0.748 | 1.012 | 0.858 |        0.848 |
| Firi                 |                  0.718 | 1.055 | 0.860 |        0.875 |
| MPChess              |                  0.713 | 1.065 | 0.860 |        0.882 |

Figures are the tallest piece's ink height as a fraction of the square, across
all twelve pieces of both colours.

**The comparison asked for, stated plainly:**

|                              |              Tallest piece / square |
| ---------------------------- | ----------------------------------: |
| Kingfisher, before           | **0.705** (default set: king 0.688) |
| Lichess, same Cburnett files |                           **0.782** |
| Kingfisher, after            | **0.858** (default set: king 0.838) |
| Chess.com reference image    |      **not supplied; not measured** |

Every set now lands within 0.003 of the target, and the widest piece anywhere on
a board is 0.930 — a gap of 3.5% of a square on each side, so nothing touches.

## What holds it

Three tests, each of which was confirmed to fail against the old behaviour.

- `src/features/board/piece-sets/piece-proportions.test.ts` — the arithmetic.
  Every offered set has a measured baseline, applying its scale lands on the
  target, and nothing exceeds the width guard. Fails if a `visualScale` is
  wrong.
- `e2e/piece-proportions.spec.ts`, _"the board draws pieces at the calibrated
  scale"_ — the rendering. Fails if the inset comes back or the scale stops
  being applied. Also asserts the piece **tile** is still exactly one square, so
  the drag target has not moved.
- `e2e/piece-proportions.spec.ts`, _"the ink baseline still describes the
  artwork on disk"_ — the fixture. The calibration is arithmetic on a committed
  measurement, so replacing a set's files with a differently proportioned
  drawing has to fail rather than silently produce a wrong board.

## Re-measuring

After changing any artwork:

```bash
npm run dev
npm run pieces:measure
```

Update `src/features/board/piece-sets/ink-baseline.ts` with the measured
figures and recompute the affected `visualScale` as
`PIECE_INK_TARGET / tallest`, clamped so `widest × scale ≤ PIECE_INK_MAX_WIDTH`.
Then regenerate the visual baselines.

## A note on the visual gate

The visual snapshots compare with `maxDiffPixelRatio: 0.02`. This change —
every piece on the board 7% larger — exceeded that budget on only 3 of the 22
shots; the other 19 absorbed it. The gate is doing its job for layout, which is
what it was built for, but it should not be relied on to catch a change to the
artwork. That is what the tests above are for.
