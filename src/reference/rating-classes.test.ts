import { describe, expect, it } from 'vitest';

import type { PackPositionHistory, PackTally } from './pack';
import {
  bandLabel,
  fashionOf,
  movesInBand,
  positionByBand,
  whiteScore,
  type ChildHistory,
} from './rating-classes';

const BANDS = [0, 2000, 2200, 2400, 2600];

const tally = (white: number, draws: number, black: number): PackTally => ({
  games: white + draws + black,
  white,
  draws,
  black,
});

const history = (
  byBand: Record<number, PackTally>,
  byYear: Record<number, PackTally> = {},
): PackPositionHistory => ({
  key: 'k',
  byBand: new Map(Object.entries(byBand).map(([band, value]) => [Number(band), value])),
  byYear: new Map(Object.entries(byYear).map(([year, value]) => [Number(year), value])),
  first: [],
});

describe('bandLabel', () => {
  it('names each band by its own bounds', () => {
    expect(BANDS.map((band) => bandLabel(BANDS, band))).toEqual([
      '<2000',
      '2000–2199',
      '2200–2399',
      '2400–2599',
      '2600+',
    ]);
  });
});

describe('whiteScore', () => {
  it('counts a draw as half and refuses a score of no games', () => {
    expect(whiteScore(tally(1, 2, 1))).toBe(50);
    expect(whiteScore(tally(3, 0, 1))).toBe(75);
    expect(whiteScore(tally(0, 0, 0))).toBeNull();
  });
});

describe('movesInBand', () => {
  /*
    The case the feature exists for: the order of the moves changes with the
    rating class. Below 2000 e5 is the most played reply; at 2600+ it is c5.
  */
  const children: ChildHistory[] = [
    { uci: 'e7e5', san: 'e5', history: history({ 0: tally(50, 10, 40), 2600: tally(2, 6, 2) }) },
    { uci: 'c7c5', san: 'c5', history: history({ 0: tally(20, 5, 15), 2600: tally(10, 20, 10) }) },
    { uci: 'g7g5', san: 'g5', history: null },
    { uci: 'a7a6', san: 'a6', history: history({ 0: tally(1, 0, 0) }) },
  ];

  it('reorders the moves by games in the chosen band', () => {
    expect(movesInBand(children, 0).rows.map((row) => row.san)).toEqual(['e5', 'c5', 'a6']);
    expect(movesInBand(children, 2600).rows.map((row) => row.san)).toEqual(['c5', 'e5', 'a6']);
  });

  it('keeps a move nobody in the band played, at zero, and names those with no history', () => {
    const top = movesInBand(children, 2600);
    expect(top.rows.at(-1)).toMatchObject({ san: 'a6', games: 0, score: null, share: 0 });
    expect(top.withoutHistory).toEqual(['g5']);
    expect(top.games).toBe(50);
    expect(top.rows[0]).toMatchObject({ san: 'c5', games: 40, score: 50, share: 80 });
  });
});

describe('positionByBand', () => {
  it('lists every declared band, lowest first, empty ones as zero', () => {
    const rows = positionByBand(
      history({ 2600: tally(3, 1, 0), 0: tally(1, 0, 1) }),
      [2600, 0, 2000],
    );
    expect(rows.map((row) => [row.label, row.games, row.score])).toEqual([
      ['<2000', 2, 50],
      ['2000–2599', 0, null],
      ['2600+', 4, 87.5],
    ]);
  });
});

describe('fashionOf', () => {
  it('draws each move’s share of a year’s games, and leaves thin years out', () => {
    const children: ChildHistory[] = [
      {
        uci: 'g1f3',
        san: 'Nf3',
        history: history(
          {},
          { 2022: tally(30, 0, 0), 2023: tally(10, 0, 0), 2024: tally(1, 0, 0) },
        ),
      },
      {
        uci: 'c2c4',
        san: 'c4',
        history: history(
          {},
          { 2022: tally(10, 0, 0), 2023: tally(30, 0, 0), 2024: tally(1, 0, 0) },
        ),
      },
    ];
    const fashion = fashionOf(children);
    expect(fashion.years).toEqual([2022, 2023]);
    expect(fashion.thinYears).toBe(1);
    expect(fashion.series.map((series) => [series.san, series.points.map((p) => p.share)])).toEqual(
      [
        ['Nf3', [75, 25]],
        ['c4', [25, 75]],
      ],
    );
  });
});
