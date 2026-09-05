/**
 * How much ink each vendored set puts on a square when drawn at full size.
 *
 * Measured by `npm run pieces:measure`: every piece rasterised at 400x400 as
 * the board draws it, with the alpha channel's bounding box taken at a
 * threshold of 24/255 so antialiasing and soft drop shadows are counted the
 * way the eye counts them.
 *
 * This is a *fixture*, not a derivation. Its whole value is that it was
 * measured from the artwork on disk, so a set whose files are replaced by a
 * differently proportioned drawing makes `piece-proportions.test.ts` fail
 * instead of silently shipping a board whose pieces no longer match each
 * other. Re-measure and update it deliberately, in the same commit as the
 * artwork.
 *
 * Recorded 2026-09-05 against the ten sets in `PIECE_SETS`.
 */
export interface PieceInkBaseline {
  /** Tallest piece's ink height, as a fraction of the square. */
  readonly tallest: number;
  /** Widest piece's ink width, as a fraction of the square. */
  readonly widest: number;
}

export const PIECE_INK_BASELINE: Readonly<Record<string, PieceInkBaseline>> = {
  cburnett: { tallest: 0.802, widest: 0.855 },
  merida: { tallest: 0.853, widest: 0.922 },
  chessnut: { tallest: 0.79, widest: 0.82 },
  fantasy: { tallest: 0.9, widest: 0.912 },
  spatial: { tallest: 0.932, widest: 0.87 },
  celtic: { tallest: 0.935, widest: 0.885 },
  rhosgfx: { tallest: 0.875, widest: 0.785 },
  'kiwen-suwi': { tallest: 0.85, widest: 0.838 },
  firi: { tallest: 0.815, widest: 0.83 },
  mpchess: { tallest: 0.807, widest: 0.83 },
};
