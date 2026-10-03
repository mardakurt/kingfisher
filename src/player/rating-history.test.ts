import { describe, expect, it } from 'vitest';

import type { GameSummary } from '@/persistence/types';

import { ratingHistory } from './rating-history';

let id = 0;
const g = (fields: Partial<GameSummary>): GameSummary =>
  ({
    id: `g${(id += 1)}`,
    white: 'Kurt, M',
    black: 'Other',
    result: '1-0',
    whiteKey: 'kurt, m',
    blackKey: 'other',
    playerKeys: ['kurt, m', 'other'],
    fingerprint: `f${id}`,
    importedAt: 0,
    ...fields,
  }) as GameSummary;

const keys = new Set(['kurt, m']);

describe('rating history', () => {
  it('plots the median recorded rating per month, from the player’s side of each game', () => {
    const history = ratingHistory(
      [
        g({ date: '2024.03.02', whiteRating: 2000, blackRating: 2100, year: 2024 }),
        g({ date: '2024.03.20', whiteRating: 2010, blackRating: 2100, year: 2024 }),
        g({ date: '2024.03.25', whiteRating: 2030, blackRating: 2100, year: 2024 }),
        // The player had Black here: their rating is BlackElo.
        g({
          date: '2024.05.01',
          white: 'Other',
          black: 'Kurt, M',
          whiteKey: 'other',
          blackKey: 'kurt, m',
          whiteRating: 2300,
          blackRating: 2050,
          result: '0-1',
          year: 2024,
        }),
      ],
      keys,
    );
    expect(history.points).toEqual([
      { month: '2024-03', rating: 2010, games: 3, low: 2000, high: 2030 },
      { month: '2024-05', rating: 2050, games: 1, low: 2050, high: 2050 },
    ]);
    expect(history.unplotted).toBe(0);
  });

  it('counts games it cannot plot instead of guessing a month or a rating', () => {
    const history = ratingHistory(
      [g({ date: '2024.??.??', whiteRating: 2000, year: 2024 }), g({ date: '2024.04.01' })],
      keys,
    );
    expect(history.points).toEqual([]);
    expect(history.unplotted).toBe(2);
  });

  it('gives a FIDE performance per year over rated, finished games', () => {
    const history = ratingHistory(
      [
        g({ year: 2023, date: '2023.01.01', blackRating: 2400, result: '1-0' }),
        g({ year: 2023, date: '2023.02.01', blackRating: 2400, result: '1/2-1/2' }),
        g({ year: 2023, date: '2023.03.01', blackRating: 2400, result: '*' }),
      ],
      keys,
    );
    // 1.5 / 2 = .75 → dp 193 over 2400.
    expect(history.years).toEqual([
      { year: 2023, games: 2, score: 0.75, averageOpponent: 2400, performance: 2593 },
    ]);
  });
});
