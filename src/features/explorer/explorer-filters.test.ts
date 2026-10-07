import { describe, expect, it } from 'vitest';

import {
  applicableExplorerFilters,
  explorerPlayerField,
  explorerPlayerQuery,
  explorerRatingClasses,
  withRatingClass,
} from './explorer-filters';

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

describe('explorer player filter', () => {
  it('asks Lichess for the account and a side, never for both colours at once', () => {
    expect(explorerPlayerQuery('lichess-player', ' DrNykterstein ', 'either')).toEqual({
      player: 'DrNykterstein',
      playerColor: 'w',
    });
    expect(explorerPlayerQuery('lichess-player', 'DrNykterstein', 'b').playerColor).toBe('b');
    expect(explorerPlayerField('lichess-player').placeholder).toBe('Exact Lichess username');
  });

  it('folds a collection name to the stored key and can leave the side unset', () => {
    expect(explorerPlayerQuery('sqlite:games', '  Kasparov,  Garry ', 'either')).toEqual({
      player: 'kasparov, garry',
    });
    expect(explorerPlayerQuery('local-collection', 'Carlsen', 'b')).toEqual({
      player: 'carlsen',
      playerColor: 'b',
    });
    expect(explorerPlayerQuery('sqlite:games', '   ', 'w')).toBeNull();
    expect(explorerPlayerField('local-collection').label).toBe('Player');
    expect(explorerPlayerField('sqlite:games').placeholder).not.toMatch(/Lichess/);
  });
});

describe('rating classes', () => {
  it('uses disjoint exact local bounds and no upper limit on the final class', () => {
    const classes = explorerRatingClasses('local-collection');
    expect(classes[0]).toEqual({ min: 0, max: 1399.5, label: '<1400' });
    expect(classes.at(-1)).toEqual({ min: 2600, label: '2600+' });
    for (let i = 1; i < classes.length; i++)
      expect(classes[i]!.min).toBe(classes[i - 1]!.max! + 0.5);
  });
  it('uses Lichess native classes rather than mislabelling rounded ranges', () => {
    expect(explorerRatingClasses('lichess-games').slice(-2)).toEqual([
      { min: 2200, max: 2499, label: '2200–2499' },
      { min: 2500, label: '2500+' },
    ]);
  });
  it('replaces stale rating bounds, preserves other filters, and clears the upper bound for an open class', () => {
    const filters = { minRating: 2700, maxRating: 2800, sinceYear: 2020, player: 'Kurt' };
    expect(withRatingClass(filters, { min: 1600, max: 1799, label: '1600–1799' })).toEqual({
      minRating: 1600,
      maxRating: 1799,
      sinceYear: 2020,
      player: 'Kurt',
    });
    expect(withRatingClass(filters, { min: 2600, label: '2600+' })).toEqual({
      minRating: 2600,
      sinceYear: 2020,
      player: 'Kurt',
    });
    expect(withRatingClass(filters, undefined)).toBe(filters);
  });
});
