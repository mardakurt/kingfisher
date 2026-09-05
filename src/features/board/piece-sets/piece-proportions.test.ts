import { describe, expect, it } from 'vitest';

import { PIECE_INK_BASELINE } from './ink-baseline';
import { PIECE_INK_MAX_WIDTH, PIECE_INK_TARGET, PIECE_SETS } from './index';

/**
 * The pieces were too small, and each set was too small by a different amount.
 *
 * Before this calibration the board inset every piece by 6% and drew whatever
 * the artwork's own margin left: the default set's tallest piece covered 0.688
 * of its square, against 0.782 for the same Cburnett files as Lichess draws
 * them, while Celtic — which has almost no margin of its own — covered 0.823.
 * One global factor could not fix both, which is why the scale is per set.
 */
describe('piece proportions', () => {
  const vector = PIECE_SETS.filter((set) => set.kind === 'vector');

  it('measures every set it offers', () => {
    for (const set of vector) {
      expect(PIECE_INK_BASELINE[set.id], `no ink baseline for ${set.id}`).toBeDefined();
    }
  });

  it('brings every set to the same ink height, so no set looks small beside another', () => {
    for (const set of vector) {
      const baseline = PIECE_INK_BASELINE[set.id];
      if (!baseline) continue;
      const calibrated = baseline.tallest * set.visualScale;
      // 0.5pt of a square: below what anyone can see, above measurement noise.
      expect(
        Math.abs(calibrated - PIECE_INK_TARGET),
        `${set.id} lands at ${calibrated}`,
      ).toBeLessThan(0.005);
    }
  });

  it('never lets a piece reach the edge of its square', () => {
    for (const set of vector) {
      const baseline = PIECE_INK_BASELINE[set.id];
      if (!baseline) continue;
      const calibrated = baseline.widest * set.visualScale;
      expect(calibrated, `${set.id} is ${calibrated} wide`).toBeLessThanOrEqual(
        PIECE_INK_MAX_WIDTH,
      );
    }
  });

  it('draws the default set larger than the same artwork was drawn before', () => {
    /*
      The user-visible claim, pinned. 0.688 is what /analysis measured with the
      old 6% inset; 0.782 is what Lichess gets from these same files at full
      size. Kingfisher should be at least the latter.
    */
    const cburnett = vector.find((set) => set.id === 'cburnett');
    expect(cburnett).toBeDefined();
    const baseline = PIECE_INK_BASELINE.cburnett as { tallest: number };
    const calibrated = baseline.tallest * (cburnett?.visualScale ?? 1);
    expect(calibrated).toBeGreaterThan(0.688);
    expect(calibrated).toBeGreaterThanOrEqual(0.782);
  });

  it('gives every set a scale, including the fallbacks a stored preference may name', () => {
    for (const set of PIECE_SETS) {
      expect(set.visualScale, set.id).toBeGreaterThan(0.5);
      expect(set.visualScale, set.id).toBeLessThan(1.5);
    }
  });
});
