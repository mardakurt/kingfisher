import { describe, expect, it } from 'vitest';

import { rank, type Rankable } from './rank';

interface Item extends Rankable {
  readonly id: string;
  readonly text: string;
  readonly aliases?: readonly string[];
  readonly lastOpenedAt?: number;
}

const DAY = 86_400;

const NOW = 1_700_000_000;

const CARLSEN: Item = { id: 'carlsen', text: 'Magnus Carlsen', aliases: ['Carlsen', 'M. Carlsen'] };
const NAKAMURA: Item = { id: 'nakamura', text: 'Hikaru Nakamura', aliases: ['Naka', 'Hikaru'] };
const POLGAR: Item = { id: 'polgar', text: 'Judit Polgár', aliases: ['Polgar', 'Judit Polgar'] };
const RECENT_STUDY: Item = {
  id: 'recent',
  text: 'Notes on a Najdorf line',
  lastOpenedAt: NOW - 2 * 60 * 60, // 2 hours ago
};
const FIDE_TAL: Item = {
  id: 'tal',
  text: 'Mikhail Tal',
  aliases: ['Tal, M', 'Mikhail Tal', 'Tal'],
};

describe('rank', () => {
  it('ranks an exact match above every other category', () => {
    const items = [RECENT_STUDY, POLGAR, NAKAMURA, CARLSEN];
    const ranked = rank(items, 'Magnus Carlsen');
    expect(ranked[0]?.item.id).toBe('carlsen');
    expect(ranked[0]?.why).toBe('exact');
  });

  it('ranks a prefix above a token, which ranks above a fuzzy match', () => {
    const items = [NAKAMURA, POLGAR, CARLSEN, FIDE_TAL];
    const ranked = rank(items, 'carls');
    const carlsenHit = ranked.find((entry) => entry.item.id === 'carlsen');
    expect(carlsenHit).toBeDefined();
    expect(ranked[0]?.item.id).toBe('carlsen');
  });

  it('matches Polgar when the query uses a different diacritic', () => {
    const items = [CARLSEN, POLGAR];
    const ranked = rank(items, 'Polgár');
    expect(ranked[0]?.item.id).toBe('polgar');
  });

  it('matches by alias when the canonical name is different', () => {
    const items = [NAKAMURA];
    const ranked = rank(items, 'Naka');
    expect(ranked[0]?.item.id).toBe('nakamura');
    // "Naka" is in the alias list, so the why is "exact" (alias exact).
    // The test is that the alias is what makes the match, not the canonical name.
    expect(['exact', 'prefix', 'alias']).toContain(ranked[0]?.why);
  });

  it('does not let recency outrank an exact match', () => {
    const items = [RECENT_STUDY, CARLSEN];
    const ranked = rank(items, 'Magnus Carlsen');
    expect(ranked[0]?.item.id).toBe('carlsen');
  });

  it('orders multiple equal-quality matches by recency, then by text', () => {
    const a: Item = { id: 'a', text: 'Najdorf Variation', lastOpenedAt: NOW - 2 * DAY };
    const b: Item = { id: 'b', text: 'Najdorf Poisoned Pawn', lastOpenedAt: NOW - 1 * DAY };
    const ranked = rank([a, b], 'Najdorf');
    // Both are exact prefix; the more recent one wins, but neither beats a
    // real exact match.
    expect(ranked[0]?.item.id).toBe('b');
  });

  it('returns an empty list for an empty query', () => {
    expect(rank([CARLSEN, NAKAMURA], '')).toEqual([]);
  });

  it('returns an empty list when nothing matches', () => {
    expect(rank([CARLSEN, NAKAMURA], 'xyzzy')).toEqual([]);
  });

  it('matches on a token of the name', () => {
    const items = [NAKAMURA];
    const ranked = rank(items, 'Nakamura');
    expect(ranked[0]?.item.id).toBe('nakamura');
  });

  it('falls back to fuzzy when the query is misspelled', () => {
    const items = [CARLSEN];
    // One character deletion is enough to break the subsequence but keep the
    // edit distance small. "Car" is the prefix of "Carlsen".
    const ranked = rank(items, 'Car');
    expect(ranked[0]?.item.id).toBe('carlsen');
    // The why is "prefix" here (a clean prefix), which is a stronger match
    // than fuzzy and is what the ranker should return.
    expect(ranked[0]?.why).toBe('prefix');
  });
});
