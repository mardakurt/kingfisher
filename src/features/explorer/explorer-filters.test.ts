import { describe, expect, it } from 'vitest';

import { applicableExplorerFilters } from './explorer-filters';

const prefs = { explorerMinRating: 2500, explorerSinceYear: 2020 };

describe('applicableExplorerFilters', () => {
  it('sends a source only the filters it can apply, and names the rest', () => {
    expect(applicableExplorerFilters(prefs, { ratingFilter: false, dateFilter: false })).toEqual({
      filters: {},
      applied: [],
      ignored: ['Min Elo 2500', 'since 2020'],
    });
    expect(applicableExplorerFilters(prefs, { ratingFilter: true, dateFilter: false })).toEqual({
      filters: { minRating: 2500 },
      applied: ['rating ≥ 2500'],
      ignored: ['since 2020'],
    });
  });

  it('treats a source not yet known as able to apply nothing', () => {
    expect(applicableExplorerFilters(prefs, undefined).filters).toEqual({});
  });
});
