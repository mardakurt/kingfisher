import { describe, expect, it } from 'vitest';

import { searchOpenings } from './openings';

describe('searchOpenings', () => {
  it('finds the Najdorf family by name', async () => {
    const hits = await searchOpenings('Najdorf');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((hit) => hit.name === 'Sicilian Defense')).toBe(true);
    expect(hits[0]?.label.toLowerCase()).toContain('najdorf');
  });

  it('matches by ECO code', async () => {
    const hits = await searchOpenings('B90');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.eco).toBe('B90');
  });

  it('returns an empty list for too-short queries', async () => {
    expect(await searchOpenings('a')).toEqual([]);
  });

  it('returns an empty list when nothing matches', async () => {
    expect(await searchOpenings('zzzzzzzz')).toEqual([]);
  });

  it('respects the limit argument', async () => {
    const hits = await searchOpenings('Sicilian', 3);
    expect(hits.length).toBeLessThanOrEqual(3);
  });
});
