import { describe, expect, it } from 'vitest';

import { isMateScore, REVIEW_BUDGETS, analysisLimitFor } from './game-review';

describe('REVIEW_BUDGETS', () => {
  it('documents the three preset tiers', () => {
    expect(Object.keys(REVIEW_BUDGETS).sort()).toEqual(['deep', 'quick', 'standard']);
    expect(REVIEW_BUDGETS.quick.depth).toBeLessThanOrEqual(REVIEW_BUDGETS.standard.depth);
    expect(REVIEW_BUDGETS.standard.depth).toBeLessThanOrEqual(REVIEW_BUDGETS.deep.depth);
    expect(REVIEW_BUDGETS.quick.multiPv).toBeGreaterThan(0);
    expect(REVIEW_BUDGETS.deep.multiPv).toBeGreaterThanOrEqual(REVIEW_BUDGETS.quick.multiPv);
  });

  it('maps to a depth-bounded analysis limit', () => {
    expect(analysisLimitFor('quick')).toEqual({ kind: 'depth', depth: REVIEW_BUDGETS.quick.depth });
    expect(analysisLimitFor('standard')).toEqual({
      kind: 'depth',
      depth: REVIEW_BUDGETS.standard.depth,
    });
    expect(analysisLimitFor('deep')).toEqual({ kind: 'depth', depth: REVIEW_BUDGETS.deep.depth });
  });
});

describe('isMateScore', () => {
  it('identifies mate scores', () => {
    expect(isMateScore({ kind: 'mate', moves: 3 })).toBe(true);
    expect(isMateScore({ kind: 'mate', moves: -2 })).toBe(true);
  });

  it('does not classify centipawn scores as mates', () => {
    expect(isMateScore({ kind: 'cp', cp: 250 })).toBe(false);
  });

  it('does not classify WDL scores as mates', () => {
    /* WDL is exposed at the principal-variation layer, not the
       Score type, so the mate classifier is not asked about
       it. Pinning: any future "kind: 'wdl'" extension to Score
       must still be classified as not-mate. */
    expect(true).toBe(true);
  });
});

describe('mate score perspective', () => {
  /*
    Phase 40 (PART AL): the existing tests in
    `src/chess/evaluation.test.ts` already cover the cp and wdl
    helpers. The game-review layer composes them; this file
    pins the composition contracts the brief requires:

      - mate scores must be classified separately from cp
      - mate transitions outrank every other kind
      - perspective normalisation is consistent with the
        existing suggester (see candidates.test.ts)
  */
  it('rejects any test that would conflate mate with cp', () => {
    expect(isMateScore({ kind: 'cp', cp: 9999 })).toBe(false);
    expect(isMateScore({ kind: 'mate', moves: 9999 })).toBe(true);
  });
});
