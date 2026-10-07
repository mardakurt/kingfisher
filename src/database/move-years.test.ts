import { describe, expect, it } from 'vitest';

import { YEAR_SHARE_MIN_GAMES, yearPoints } from './move-years';

describe('yearPoints', () => {
  const totals = [
    { year: 2018, games: 100 },
    { year: 2019, games: 10 },
    { year: 2020, games: 40 },
  ];

  it('states each drawn year’s share of every dated game, and leaves a thin year out', () => {
    const series = yearPoints(
      [
        { year: 2018, games: 60 },
        { year: 2020, games: 10 },
      ],
      totals,
    );
    expect(series.thinYears).toBe(1);
    expect(series.points).toEqual([
      { year: 2018, games: 60, share: 60 },
      { year: 2020, games: 10, share: 25 },
    ]);
  });

  it('counts a move that was not played in a drawn year as zero, not as missing', () => {
    const series = yearPoints([{ year: 2018, games: 60 }], totals);
    expect(series.points[1]).toEqual({ year: 2020, games: 0, share: 0 });
  });

  it('draws nothing from a year under the floor, including a year of one game', () => {
    const series = yearPoints([{ year: 2019, games: 1 }], [{ year: 2019, games: 1 }], 20);
    expect(YEAR_SHARE_MIN_GAMES).toBe(20);
    expect(series.points).toEqual([]);
    expect(series.thinYears).toBe(1);
  });
});
