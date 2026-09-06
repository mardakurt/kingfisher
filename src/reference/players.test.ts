import { describe, expect, it } from 'vitest';

import { LEGENDS, LEGEND_GROUPS, legendYears } from './legends';
import {
  foldName,
  matchKey,
  PLAYER_NICKNAMES,
  PRIMARY_PLAYER_FILTERS,
  searchPlayers,
  type CatalogPlayer,
} from './players';

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
    const withGames = [...catalog, player({ name: 'Kramnik, Vladimir', games: 20, legend: TAL })];
    const results = searchPlayers(withGames, { query: '', filter: 'world-champion' });
    expect(results.map((entry) => entry.name)).toEqual(['Kramnik, Vladimir']);
  });

  it('finds nothing rather than guessing when a name is not in either population', () => {
    expect(searchPlayers(catalog, { query: 'zzzz', filter: 'all' })).toEqual([]);
  });
});

/**
 * The product rule from Phase 17: a player Kingfisher *offers* you must lead
 * somewhere.
 *
 * The roster names 106 people and the installed packs begin in 2020, so
 * browsing world champions used to open with Steinitz, Lasker and Capablanca —
 * three profiles with nothing behind them. A famous name that delivers nothing
 * teaches a user that the player library is unreliable, which is a worse
 * outcome than not listing them.
 *
 * Searching is the deliberate exception, and the reason the rule is stated in
 * terms of browsing. Somebody who types "Morphy" is naming a person, and the
 * honest answer is the roster entry saying there are no games here — silence
 * would read as "Kingfisher has never heard of him".
 */
describe('the browse sets lead somewhere', () => {
  const morphy = player({
    name: 'Morphy, Paul',
    games: 0,
    legend: LEGENDS.find((legend) => legend.name.startsWith('Morphy')),
  });
  const catalog = [
    morphy,
    player({
      name: 'Carlsen, Magnus',
      games: 452,
      peakRating: 2882,
      lastRating: 2830,
      legend: LEGENDS.find((l) => l.name.startsWith('Carlsen')),
    }),
    player({ name: 'Nobody, A', games: 3 }),
  ];

  it('offers no player with nothing behind them, in any primary set', () => {
    for (const filter of PRIMARY_PLAYER_FILTERS) {
      const results = searchPlayers(catalog, { query: '', filter });
      const dead = results.filter((entry) => entry.games === 0).map((entry) => entry.name);
      expect(dead, `${filter} offers a player with no games`).toEqual([]);
    }
  });

  it('keeps the people it cannot show games for in an index of their own', () => {
    const index = searchPlayers(catalog, { query: '', filter: 'historical-index' });
    expect(index.map((entry) => entry.name)).toContain('Morphy, Paul');
    // And nobody who does have games, because that is not what the index is.
    expect(index.every((entry) => entry.games === 0)).toBe(true);
  });

  it('still finds a historical player by name, and says they have no games', () => {
    const results = searchPlayers(catalog, { query: 'morphy', filter: 'all' });
    expect(results.map((entry) => entry.name)).toContain('Morphy, Paul');
    expect(results.find((entry) => entry.name === 'Morphy, Paul')?.games).toBe(0);
  });

  it('does not let the historical index leak into a rating list', () => {
    for (const filter of ['top-100', 'top-500'] as const) {
      const results = searchPlayers(catalog, { query: '', filter });
      expect(results.map((entry) => entry.name)).not.toContain('Morphy, Paul');
    }
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

/**
 * Search has to work for the spelling a person actually types.
 *
 * Both cases here were found by typing real names into the real box: "Polgár"
 * — the correct spelling — returned nothing while "Polgar" returned both
 * sisters, and "MVL" returned nothing at all.
 */
describe('finding a player by the name people use', () => {
  const catalog = [
    player({ name: 'Polgár, Judit', games: 40 }),
    player({ name: 'Vachier-Lagrave, Maxime', games: 553 }),
    player({ name: 'Nepomniachtchi, Ian', games: 401 }),
    player({ name: 'Carlsen, Magnus', games: 452 }),
  ];
  const names = (query: string) =>
    searchPlayers(catalog, { query, filter: 'all' }).map((entry) => entry.name);

  it('finds a name whether or not the accents are typed', () => {
    expect(names('Polgár')).toContain('Polgár, Judit');
    expect(names('Polgar')).toContain('Polgár, Judit');
    expect(names('polgar')).toContain('Polgár, Judit');
  });

  it('keeps the accents in what it displays', () => {
    // Folding is for matching only; the stored spelling is the correct one.
    expect(names('polgar')[0]).toBe('Polgár, Judit');
  });

  it('finds a hyphenated surname with or without the hyphen', () => {
    expect(names('Vachier-Lagrave')).toContain('Vachier-Lagrave, Maxime');
    expect(names('vachier lagrave')).toContain('Vachier-Lagrave, Maxime');
  });

  it('knows the nicknames players are actually called', () => {
    expect(names('MVL')).toContain('Vachier-Lagrave, Maxime');
    expect(names('mvl')).toContain('Vachier-Lagrave, Maxime');
    expect(names('Nepo')).toContain('Nepomniachtchi, Ian');
  });

  it('does not invent a nickname it was not told about', () => {
    /*
      Deriving nicknames from initials would turn every three-letter query into
      a confident wrong answer. The list is written down, once, by a person.
    */
    expect(PLAYER_NICKNAMES.mc).toBeUndefined();
    expect(names('zzz')).toEqual([]);
  });

  it('is case-insensitive in both directions', () => {
    expect(names('CARLSEN')).toContain('Carlsen, Magnus');
    expect(names('carlsen, magnus')).toContain('Carlsen, Magnus');
  });
});

describe('foldName', () => {
  it('removes diacritics without removing the letters under them', () => {
    expect(foldName('Polgár')).toBe('polgar');
    expect(foldName('Réti')).toBe('reti');
    expect(foldName('Grünfeld')).toBe('grunfeld');
    expect(foldName('Nepomniachtchi')).toBe('nepomniachtchi');
  });

  it('leaves a hyphen and an apostrophe alone, because display keeps them', () => {
    expect(foldName("O'Kelly")).toBe("o'kelly");
    expect(foldName('Vachier-Lagrave')).toBe('vachier-lagrave');
  });
});

describe('matchKey', () => {
  it('flattens the separators a user and a database disagree about', () => {
    expect(matchKey('Vachier-Lagrave, Maxime')).toBe('vachier lagrave maxime');
    expect(matchKey("O'Kelly de Galway, Alberic")).toBe('o kelly de galway alberic');
    expect(matchKey('Polgár, Judit')).toBe('polgar judit');
  });
});
