import { describe, expect, it } from 'vitest';

import {
  compileImportFilter,
  describeImportFilter,
  isActiveFilter,
  playerFilterKeys,
  type FilterableGame,
} from './import-filter';

const game = (overrides: Partial<FilterableGame> = {}): FilterableGame => ({
  whiteKey: 'carlsen, magnus',
  blackKey: 'nakamura, hikaru',
  whiteRating: 2830,
  blackRating: 2780,
  year: 2024,
  ...overrides,
});

describe('compileImportFilter', () => {
  it('keeps everything when the filter asks nothing', () => {
    expect(isActiveFilter({})).toBe(false);
    expect(isActiveFilter({ player: '  ' })).toBe(false);
    expect(compileImportFilter(undefined)(game())).toBe(true);
    expect(compileImportFilter({ minRating: 0 })(game({ whiteRating: undefined }))).toBe(true);
  });

  it('holds both players to the rating, or one of them', () => {
    const both = compileImportFilter({ minRating: 2800 });
    expect(both(game())).toBe(false);
    expect(both(game({ blackRating: 2800 }))).toBe(true);
    const either = compileImportFilter({ minRating: 2800, ratingOf: 'either' });
    expect(either(game())).toBe(true);
    expect(either(game({ whiteRating: 2700 }))).toBe(false);
  });

  it('does not count an unknown rating or year as a match', () => {
    expect(compileImportFilter({ minRating: 1000 })(game({ blackRating: undefined }))).toBe(false);
    expect(
      compileImportFilter({ minRating: 1000, ratingOf: 'either' })(
        game({ whiteRating: undefined, blackRating: undefined }),
      ),
    ).toBe(false);
    expect(compileImportFilter({ fromYear: 2000 })(game({ year: undefined }))).toBe(false);
  });

  it('finds a player by whole name, in either order, on either side', () => {
    for (const name of [
      'Carlsen, Magnus',
      'Magnus Carlsen',
      'magnus  carlsen',
      'Hikaru Nakamura',
    ]) {
      expect(compileImportFilter({ player: name })(game())).toBe(true);
    }
    // A surname alone would merge people; it names nobody.
    expect(compileImportFilter({ player: 'Carlsen' })(game())).toBe(false);
    expect(compileImportFilter({ player: 'Firouzja, Alireza' })(game())).toBe(false);
    expect([...playerFilterKeys('Hou Yifan')].sort()).toEqual(
      ['hou yifan', 'hou, yifan', 'yifan, hou'].sort(),
    );
  });

  it('keeps a year range inclusive at both ends', () => {
    const range = compileImportFilter({ fromYear: 2020, toYear: 2024 });
    expect(range(game({ year: 2020 }))).toBe(true);
    expect(range(game({ year: 2024 }))).toBe(true);
    expect(range(game({ year: 2019 }))).toBe(false);
    expect(range(game({ year: 2025 }))).toBe(false);
    expect(compileImportFilter({ toYear: 1990 })(game({ year: 1985 }))).toBe(true);
  });

  it('combines every condition it is given', () => {
    const filter = compileImportFilter({
      minRating: 2700,
      player: 'Magnus Carlsen',
      fromYear: 2024,
    });
    expect(filter(game())).toBe(true);
    expect(filter(game({ year: 2023 }))).toBe(false);
    expect(filter(game({ blackRating: 2650 }))).toBe(false);
  });
});

describe('describeImportFilter', () => {
  it('says what was asked, in the order a person reads it', () => {
    expect(
      describeImportFilter({
        minRating: 2200,
        player: 'Carlsen, Magnus',
        fromYear: 2015,
        toYear: 2024,
      }),
    ).toBe('both players 2200+ · Carlsen, Magnus · 2015–2024');
    expect(describeImportFilter({ minRating: 2500, ratingOf: 'either' })).toBe(
      'either player 2500+',
    );
    expect(describeImportFilter({ fromYear: 2020 })).toBe('2020 onwards');
    expect(describeImportFilter({ toYear: 1972 })).toBe('up to 1972');
    expect(describeImportFilter({})).toBe('');
  });
});
