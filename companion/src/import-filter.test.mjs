import { expect, it } from 'vitest';
import { importFilter } from './import-filter.mjs';
it('requires both ratings, excludes explicit bots, and refuses non-standard games', () => {
  expect(importFilter({ WhiteElo: '2500', BlackElo: '2400' }, { minRating: 2400 })).toBe(true);
  expect(importFilter({ WhiteElo: '2500' }, { minRating: 2400 })).toBe(false);
  expect(importFilter({ WhiteTitle: 'BOT' }, { excludeBots: true })).toBe(false);
  expect(importFilter({ Variant: 'Chess960' })).toBe(false);
  expect(importFilter({})).toBe(true);
  expect(() => importFilter({}, { minRating: -1 })).toThrow();
});
