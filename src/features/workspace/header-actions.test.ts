import { describe, expect, it } from 'vitest';

import { ACTION_WIDTH_ESTIMATE, fitHeaderActions } from './header-actions';

const widths = {
  add: { full: 160, short: 80 },
  review: { full: 140, short: 70 },
  export: { full: 120, short: 60 },
  create: { full: 140, short: 55 },
};
const widthOf = (id: string) => widths[id as keyof typeof widths];
const ids = ['add', 'review', 'export', 'create'];

describe('fitHeaderActions', () => {
  it('draws everything with full labels while it all fits', () => {
    // 560 of widths + 4 gaps of 6 = 584.
    expect(fitHeaderActions({ ids, widthOf, available: 584, moreWidth: 36 })).toEqual({
      shown: ids,
      folded: [],
      compact: false,
    });
  });

  it('shortens every label before it folds anything', () => {
    // Full labels need 584; short ones need 265 + 24 = 289.
    const fit = fitHeaderActions({ ids, widthOf, available: 400, moreWidth: 36 });
    expect(fit).toEqual({ shown: ids, folded: [], compact: true });
  });

  it('folds from the end, keeping the first actions and reserving the ⋯ button', () => {
    // Short labels + gaps: add 86, review 76, export 66, create 61. The ⋯
    // button costs 42, so a 240 px row keeps 198 for actions: add and
    // review (162) fit, export (228) does not.
    const fit = fitHeaderActions({ ids, widthOf, available: 240, moreWidth: 36 });
    expect(fit).toEqual({ shown: ['add', 'review'], folded: ['export', 'create'], compact: true });
  });

  it('folds everything when not even the first action fits beside ⋯', () => {
    const fit = fitHeaderActions({ ids, widthOf, available: 60, moreWidth: 36 });
    expect(fit).toEqual({ shown: [], folded: ids, compact: true });
  });

  it('draws everything before the first measurement', () => {
    expect(fitHeaderActions({ ids, widthOf, available: -1, moreWidth: 36 })).toEqual({
      shown: ids,
      folded: [],
      compact: false,
    });
  });

  it('assumes a width for an action that has not been drawn yet', () => {
    const fit = fitHeaderActions({
      ids: ['a', 'b'],
      widthOf: () => undefined,
      // One estimate short of both fitting: the second folds behind ⋯.
      available: 2 * (ACTION_WIDTH_ESTIMATE + 6) - 1,
      moreWidth: 36,
    });
    expect(fit).toEqual({ shown: ['a'], folded: ['b'], compact: true });
  });

  it('is a no-op for a route with no actions', () => {
    expect(fitHeaderActions({ ids: [], widthOf, available: 10, moreWidth: 36 })).toEqual({
      shown: [],
      folded: [],
      compact: false,
    });
  });
});
