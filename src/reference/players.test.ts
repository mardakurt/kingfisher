import { describe, expect, it } from 'vitest';

import { LEGENDS, LEGEND_GROUPS, legendYears } from './legends';
import { searchPlayers, type CatalogPlayer } from './players';

/**
 * The player catalog mixes two populations that must not be confused: rows
 * that are counts of games in an installed source, and roster rows that are
 * people. These tests pin the ranking (which decides whether typing "tal"
 * finds Mikhail Tal or Talukdar) and the honesty rule (a roster row with no
 * games says zero rather than being hidden or padded).
 */

const player = (over: Partial<CatalogPlayer> & { name: string }): CatalogPlayer => ({
  key: over.name.toLowerCase(),
  title: 'GM',
  fideId: '',
  games: 0,
  firstYear: 0,
  lastYear: 0,
  peakRating: 0,
  lastRating: 0,
  sources: [],
  ...over,
});

const TAL = LEGENDS.find((legend) => legend.name === 'Tal, Mikhail');

describe('searching the player catalog', () => {
  const catalog = [
    player({ name: 'Talibov, Shiroghlan', games: 178, peakRating: 2482 }),
    player({ name: 'Talgatov, Nazar', games: 41 }),
    player({ name: 'Talukdar, Rohan', games: 27 }),
    player({ name: 'Tal, Mikhail', games: 0, legend: TAL }),
    player({ name: 'Carlsen, Magnus', games: 544, peakRating: 2900 }),
  ];

  it('puts a whole-word match above every prefix match, however many games they have', () => {
    const results = searchPlayers(catalog, { query: 'tal', filter: 'all' });
    expect(results[0]?.name).toBe('Tal, Mikhail');
  });

  it('still ranks the prefix matches by how much evidence there is', () => {
    const results = searchPlayers(catalog, { query: 'tal', filter: 'all' });
    expect(results.slice(1).map((entry) => entry.name)).toEqual([
      'Talibov, Shiroghlan',
      'Talgatov, Nazar',
      'Talukdar, Rohan',
    ]);
  });

  it('reports a roster player with no games as zero rather than hiding them', () => {
    const results = searchPlayers(catalog, { query: 'tal', filter: 'all' });
    expect(results[0]?.games).toBe(0);
    expect(results[0]?.legend?.reign).toBe('1960–1961');
  });

  it('cuts a top list by rating, over the whole catalog', () => {
    const many = Array.from({ length: 150 }, (_, index) =>
      player({ name: `Player ${index}`, lastRating: 2900 - index, games: 10 }),
    );
    const top = searchPlayers(many, { query: '', filter: 'top-100' });
    expect(top).toHaveLength(100);
    expect(top[0]?.name).toBe('Player 0');
    expect(top.at(-1)?.name).toBe('Player 99');
    expect(top.map((entry) => entry.name)).not.toContain('Player 120');
  });

  it('leaves unrated players out of a rating list, however many games they have', () => {
    const mixed = [
      player({ name: 'Rated', lastRating: 2500, games: 1 }),
      player({ name: 'Unrated', games: 4000 }),
    ];
    expect(
      searchPlayers(mixed, { query: '', filter: 'top-100' }).map((entry) => entry.name),
    ).toEqual(['Rated']);
  });

  it('still narrows a top list by name when one is typed', () => {
    const many = Array.from({ length: 150 }, (_, index) =>
      player({ name: `Player ${index}`, lastRating: 2900 - index, games: 10 }),
    );
    // In the top hundred and matching, so it comes back; ranked out, so it does not.
    expect(searchPlayers(many, { query: 'Player 5', filter: 'top-100' }).length).toBeGreaterThan(0);
    expect(searchPlayers(many, { query: 'Player 149', filter: 'top-100' })).toEqual([]);
  });

  it('ranks by the latest rating, not the highest ever recorded', () => {
    // A player whose *peak* in this source is high but who is no longer rated
    // that highly is not currently top-100, and a list that said otherwise
    // would be a list of who was ever strong.
    const ranked = [
      player({ name: 'Now strong', lastRating: 2800, peakRating: 2800 }),
      player({ name: 'Once strong', lastRating: 2400, peakRating: 2900 }),
    ];
    const top = searchPlayers(ranked, { query: '', filter: 'top-100' });
    expect(top[0]?.name).toBe('Now strong');
  });

  it('filters to only the players an installed source actually has games for', () => {
    const results = searchPlayers(catalog, { query: '', filter: 'has-games' });
    expect(results.map((entry) => entry.name)).not.toContain('Tal, Mikhail');
    expect(results.map((entry) => entry.name)).toContain('Carlsen, Magnus');
  });

  it('filters to world champions using the roster, not a rating threshold', () => {
    const results = searchPlayers(catalog, { query: '', filter: 'world-champion' });
    expect(results.map((entry) => entry.name)).toEqual(['Tal, Mikhail']);
  });

  it('finds nothing rather than guessing when a name is not in either population', () => {
    expect(searchPlayers(catalog, { query: 'zzzz', filter: 'all' })).toEqual([]);
  });
});

describe('the historical roster', () => {
  it('covers the whole championship lineage without duplicating a name', () => {
    const champions = LEGENDS.filter((legend) => legend.roles.includes('world-champion'));
    expect(champions.length).toBeGreaterThanOrEqual(18);
    for (const name of [
      'Steinitz, Wilhelm',
      'Lasker, Emanuel',
      'Capablanca, Jose Raul',
      'Alekhine, Alexander',
      'Botvinnik, Mikhail',
      'Tal, Mikhail',
      'Fischer, Robert James',
      'Kasparov, Garry',
      'Carlsen, Magnus',
      'Gukesh D',
    ]) {
      expect(
        champions.some((legend) => legend.name === name),
        name,
      ).toBe(true);
    }
    const names = LEGENDS.map((legend) => legend.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('covers the women’s championship lineage', () => {
    const champions = LEGENDS.filter((legend) => legend.roles.includes('women-champion'));
    expect(champions.length).toBeGreaterThanOrEqual(17);
    expect(champions.some((legend) => legend.name === 'Menchik, Vera')).toBe(true);
    expect(champions.some((legend) => legend.name === 'Ju, Wenjun')).toBe(true);
  });

  it('covers the era before FIDE, which no open archive reaches', () => {
    const early = LEGENDS.filter((legend) => legend.roles.includes('pre-fide'));
    expect(early.length).toBeGreaterThanOrEqual(20);
    expect(early.some((legend) => legend.name === 'Morphy, Paul')).toBe(true);
  });

  it('states dates it knows and does not invent the ones it does not', () => {
    for (const legend of LEGENDS) {
      expect(legend.born).toBeGreaterThan(1500);
      expect(legend.born).toBeLessThan(2020);
      if (legend.died !== undefined) expect(legend.died).toBeGreaterThan(legend.born);
      expect(legendYears(legend)).toBe(
        legend.died ? `${legend.born}–${legend.died}` : `b. ${legend.born}`,
      );
    }
  });

  it('never lists a name twice across its aliases, which would merge two people', () => {
    const seen = new Map<string, string>();
    for (const legend of LEGENDS) {
      for (const alias of [legend.name, ...legend.aliases]) {
        const key = alias.toLowerCase();
        expect(seen.has(key), `${alias} is claimed by ${seen.get(key)} and ${legend.name}`).toBe(
          false,
        );
        seen.set(key, legend.name);
      }
    }
  });

  it('has a group for every browsable role', () => {
    for (const group of LEGEND_GROUPS) {
      expect(
        LEGENDS.some((legend) => legend.roles.includes(group.role)),
        group.id,
      ).toBe(true);
    }
  });
});
