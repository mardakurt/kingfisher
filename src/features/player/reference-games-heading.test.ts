import { describe, expect, it } from 'vitest';

import { referenceGamesHeading, referenceHeadingSources } from './reference-games-heading';

describe('referenceGamesHeading', () => {
  it('keeps the population sentence when the list is every game the source counted', () => {
    expect(referenceGamesHeading(2, [{ name: 'Elite', listed: 2, played: 2 }])).toBe(
      '2 games in your reference sources',
    );
  });

  it('says the list is the newest slice when it is shorter than the catalog count', () => {
    expect(referenceGamesHeading(3, [{ name: 'Starter', listed: 3, played: 8 }])).toBe(
      '3 newest of 8',
    );
  });

  it('names each source when two capped lists are shown together, and does not add their counts', () => {
    const sources = referenceHeadingSources(
      [
        { sourceName: 'Elite' },
        { sourceName: 'Elite' },
        { sourceName: 'Elite' },
        { sourceName: 'Online' },
        { sourceName: 'Online' },
      ],
      {
        games: 10,
        sources: ['Elite', 'Online'],
        sourceGames: [
          { source: 'Elite', games: 8 },
          { source: 'Online', games: 9 },
        ],
      },
    );
    expect(sources.map((source) => source.played)).toEqual([8, 9]);
    expect(referenceGamesHeading(5, sources)).toBe(
      '3 newest of 8 in Elite; 2 newest of 9 in Online',
    );
  });

  it('keeps one sentence when each source listed every game it counted', () => {
    const sources = referenceHeadingSources(
      [{ sourceName: 'Elite' }, { sourceName: 'Elite' }, { sourceName: 'Online' }],
      {
        games: 10,
        sources: ['Elite', 'Online'],
        sourceGames: [
          { source: 'Elite', games: 2 },
          { source: 'Online', games: 1 },
        ],
      },
    );
    expect(referenceGamesHeading(3, sources)).toBe('3 games in your reference sources');
  });
});
