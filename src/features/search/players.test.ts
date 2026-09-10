import { describe, expect, it } from 'vitest';

import { searchLegends, __resetPlayerIndex } from './players';

describe('searchLegends', () => {
  it('finds Carlsen by full name', () => {
    const hits = searchLegends('Magnus Carlsen');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.name).toBe('Carlsen, Magnus');
  });

  it('matches by alias', () => {
    const hits = searchLegends('Bobby');
    expect(hits.some((hit) => hit.name === 'Fischer, Robert James')).toBe(true);
  });

  it('finds Tal by first name', () => {
    const hits = searchLegends('Tal');
    expect(hits.some((hit) => hit.name === 'Tal, Mikhail')).toBe(true);
  });

  it('returns an empty list for too-short queries', () => {
    expect(searchLegends('a')).toEqual([]);
  });

  it('rebuilds the index when the cache is reset', () => {
    __resetPlayerIndex();
    const hits = searchLegends('Polgar');
    expect(hits.some((hit) => hit.name.includes('Polg'))).toBe(true);
  });
});
