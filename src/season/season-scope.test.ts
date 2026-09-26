import { describe, expect, it } from 'vitest';

import type { GameRecord } from '@/persistence/types';

import { seasonScope } from './season';

const game = (white: string, black: string, year?: number) =>
  ({ white, black, ...(year !== undefined ? { year } : {}) }) as unknown as GameRecord;

describe('who a season is about', () => {
  it('tells an empty library, unknown names, unmatched names and a dated range apart', () => {
    expect(seasonScope({ games: [], aliases: ['Kurt, M'] })).toMatchObject({
      library: 0,
      yours: 0,
    });
    const games = [
      game('Kurt, M', 'A', 2019),
      game('B', 'kurt, m', 2024),
      game('Kurt, M', 'C'),
      game('D', 'E', 2025),
    ];
    expect(seasonScope({ games, aliases: [] })).toMatchObject({ library: 4, names: 0, yours: 0 });
    expect(seasonScope({ games, aliases: ['Nobody'] })).toMatchObject({ names: 1, yours: 0 });
    expect(seasonScope({ games, aliases: ['Kurt, M'] })).toEqual({
      library: 4,
      names: 1,
      yours: 3,
      undatedYours: 1,
      firstYear: 2019,
      lastYear: 2024,
    });
  });
});
