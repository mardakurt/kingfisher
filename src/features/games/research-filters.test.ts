import { beforeEach, describe, expect, it } from 'vitest';

import {
  describeResearchFilter,
  recentResearchFilters,
  rememberUsedFilters,
} from './research-filters';

/** A minimal localStorage, because these helpers are the browser's own memory. */
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  });
});

describe('recent database filters', () => {
  it('names an unnamed filter set after what it selects', () => {
    expect(
      describeResearchFilter({ player: 'Carlsen, M', playerColor: 'b', minRating: 2700 }),
    ).toBe('Carlsen, M · as Black · 2700+');
    expect(describeResearchFilter({ sortBy: 'date' })).toBe('');
  });

  it('coalesces the same search instead of stacking it up', () => {
    rememberUsedFilters({ minRating: 2400 });
    rememberUsedFilters({ minRating: 2400 });
    const recent = rememberUsedFilters({ minRating: 2500 });
    expect(recent.map((entry) => entry.name)).toEqual(['2500+', '2400+']);
    expect(recentResearchFilters()).toHaveLength(2);
  });

  it('does not remember a filter set with nothing in it', () => {
    expect(rememberUsedFilters({ sortBy: 'importedAt', sortDirection: 'desc' })).toEqual([]);
  });

  it('keeps only the five most recent', () => {
    for (const rating of [2000, 2100, 2200, 2300, 2400, 2500]) {
      rememberUsedFilters({ minRating: rating });
    }
    const recent = recentResearchFilters();
    expect(recent).toHaveLength(5);
    expect(recent[0]?.name).toBe('2500+');
    expect(recent.map((entry) => entry.name)).not.toContain('2000+');
  });
});
