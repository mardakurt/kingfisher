import { describe, expect, it } from 'vitest';

import {
  MAX_TAGS,
  formatTags,
  matchesTags,
  normalizeTag,
  normalizeTags,
  parseTagInput,
  tagCounts,
} from './tags';

describe('normalizeTag', () => {
  it.each([
    ['Najdorf', 'najdorf'],
    ['  najdorf  ', 'najdorf'],
    ['NAJDORF', 'najdorf'],
    ['English Attack', 'english-attack'],
    ['english   attack', 'english-attack'],
    ['-tidy-', 'tidy'],
    ['', ''],
  ])('%s → %s', (raw, expected) => {
    expect(normalizeTag(raw)).toBe(expected);
  });

  it('caps a tag at a length somebody can read', () => {
    expect(normalizeTag('x'.repeat(80))).toHaveLength(32);
  });
});

describe('normalizeTags', () => {
  it('keeps the order first written, drops duplicates and empties', () => {
    expect(normalizeTags(['Najdorf', 'opponent', 'najdorf ', '', '  '])).toEqual([
      'najdorf',
      'opponent',
    ]);
  });

  it('caps the list and treats absent as empty', () => {
    expect(normalizeTags(Array.from({ length: 30 }, (_v, i) => `t${i}`))).toHaveLength(MAX_TAGS);
    expect(normalizeTags(undefined)).toEqual([]);
  });
});

describe('parseTagInput and formatTags', () => {
  it('round-trips what a person types', () => {
    expect(parseTagInput('Najdorf, English Attack\nto-review')).toEqual([
      'najdorf',
      'english-attack',
      'to-review',
    ]);
    expect(formatTags(['najdorf', 'to-review'])).toBe('najdorf, to-review');
    expect(parseTagInput(formatTags(['najdorf', 'to-review']))).toEqual(['najdorf', 'to-review']);
  });
});

describe('tagCounts', () => {
  it('counts each tag and orders by most recently used', () => {
    expect(
      tagCounts([
        { tags: ['najdorf', 'old'], updatedAt: 10 },
        { tags: ['najdorf'], updatedAt: 50 },
        { tags: ['fresh'], updatedAt: 40 },
        { tags: undefined, updatedAt: 99 },
      ]),
    ).toEqual([
      { tag: 'najdorf', count: 2, lastUsed: 50 },
      { tag: 'fresh', count: 1, lastUsed: 40 },
      { tag: 'old', count: 1, lastUsed: 10 },
    ]);
  });
});

describe('matchesTags', () => {
  it('narrows as tags are added, and matches everything when none are selected', () => {
    const study = { tags: ['najdorf', 'opponent', 'to-review'] };
    expect(matchesTags(study, [])).toBe(true);
    expect(matchesTags(study, ['najdorf'])).toBe(true);
    expect(matchesTags(study, ['najdorf', 'opponent'])).toBe(true);
    expect(matchesTags(study, ['najdorf', 'endgame'])).toBe(false);
    expect(matchesTags({ tags: undefined }, ['najdorf'])).toBe(false);
  });
});
