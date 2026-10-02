import { describe, expect, it } from 'vitest';

import type { GameResult } from '@/database/types';

import {
  buildCrosstable,
  crosstableCaveat,
  crosstableText,
  fideDp,
  fidePerformance,
  formatPoints,
  gridCell,
  type CrosstableGame,
} from './crosstable';

let next = 0;
const g = (
  white: string,
  black: string,
  result: GameResult,
  round?: string,
  ratings: [number?, number?] = [],
): CrosstableGame => ({
  id: `g${(next += 1)}`,
  white,
  black,
  result,
  ...(round ? { round } : {}),
  ...(ratings[0] ? { whiteRating: ratings[0] } : {}),
  ...(ratings[1] ? { blackRating: ratings[1] } : {}),
});

/*
 * A four-player single round robin, scored by hand:
 *   A: beat B, drew C, beat D          = 2.5
 *   B: lost A, beat C, drew D          = 1.5
 *   C: drew A, lost B, beat D          = 1.5
 *   D: lost A, drew B, lost C          = 0.5
 * Sonneborn-Berger, by hand:
 *   A: 1·1.5 (B) + ½·1.5 (C) + 1·0.5 (D) = 2.75
 *   B: 1·1.5 (C) + ½·0.5 (D)             = 1.75
 *   C: ½·2.5 (A) + 1·0.5 (D)             = 1.75
 *   D: ½·1.5 (B)                         = 0.75
 * B and C tie on points and SB; both have one win; B had Black once (vs A),
 * C had Black twice (vs A? no: A–C was C's White) — see the colours below.
 */
const roundRobin = [
  g('A', 'B', '1-0', '1', [2600, 2500]),
  g('C', 'D', '1-0', '1', [2550, 2400]),
  g('C', 'A', '1/2-1/2', '2', [2550, 2600]),
  g('B', 'D', '1/2-1/2', '2', [2500, 2400]),
  g('A', 'D', '1-0', '3', [2600, 2400]),
  g('B', 'C', '1-0', '3', [2500, 2550]),
];

describe('FIDE performance', () => {
  it('reads table 8.1.1 at its anchors and symmetric points', () => {
    expect(fideDp(1)).toBe(800);
    expect(fideDp(0)).toBe(-800);
    expect(fideDp(0.5)).toBe(0);
    expect(fideDp(0.75)).toBe(193);
    expect(fideDp(0.25)).toBe(-193);
    expect(fideDp(0.99)).toBe(677);
    expect(fideDp(0.01)).toBe(-677);
    // p is rounded to two decimals before the lookup: 2/3 → .67.
    expect(fideDp(2 / 3)).toBe(125);
    expect(fideDp(1 / 3)).toBe(-125);
  });

  it('adds dp to the average opponent rating', () => {
    expect(fidePerformance(6, 9, 2700)).toBe(2825);
    expect(fidePerformance(4.5, 9, 2712.4)).toBe(2712);
  });
});

describe('a round robin', () => {
  const table = buildCrosstable(roundRobin);

  it('is recognised as complete, single, with hand-computed scores and Sonneborn-Berger', () => {
    expect(table.format).toBe('round-robin');
    expect(table.cycles).toBe(1);
    expect(table.complete).toBe(true);
    const byName = Object.fromEntries(table.players.map((p) => [p.name, p]));
    expect(byName.A).toMatchObject({ score: 2.5, sonnebornBerger: 2.75, wins: 2, draws: 1 });
    expect(byName.B).toMatchObject({ score: 1.5, sonnebornBerger: 1.75 });
    expect(byName.C).toMatchObject({ score: 1.5, sonnebornBerger: 1.75 });
    expect(byName.D).toMatchObject({ score: 0.5, sonnebornBerger: 0.75, losses: 2 });
    expect(table.players[0]!.name).toBe('A');
    expect(table.players.at(-1)!.name).toBe('D');
  });

  it('breaks a points-and-SB tie by wins, then by games with Black', () => {
    // B: Black vs A only → 1 Black game. C: Black vs B → 1 Black game (C was
    // White against A and D). Equal on every criterion, so they share second.
    const [, second, third] = table.players;
    expect([second!.name, third!.name].sort()).toEqual(['B', 'C']);
    expect(second!.rank).toBe(2);
    expect(third!.rank).toBe(2);
  });

  it('draws the grid from the row player', () => {
    const a = table.players.find((p) => p.name === 'A')!.index;
    const d = table.players.find((p) => p.name === 'D')!.index;
    expect(gridCell(table, a, d)).toBe('1');
    expect(gridCell(table, d, a)).toBe('0');
  });

  it('computes performance over rated opponents only', () => {
    const a = table.players.find((p) => p.name === 'A')!;
    // 2.5 / 3 → p .83 → dp 273, average of 2500, 2550, 2400 = 2483.3
    expect(a.performance).toEqual({ rating: Math.round(2483.333 + 273), ratedGames: 3 });
    expect(table.averageRating).toBe(Math.round((2600 + 2500 + 2550 + 2400) / 4));
    expect(table.rounds).toEqual(['1', '2', '3']);
  });

  it('prints a fixed-width text table and its caveat', () => {
    const text = crosstableText(table, 'Test RR');
    expect(text.split('\n')[0]).toBe('Test RR');
    expect(text).toContain('2½');
    expect(text).toContain('a complete round robin');
  });
});

describe('what the table refuses to claim', () => {
  it('scores an unfinished game for nobody and says the round robin is provisional', () => {
    const table = buildCrosstable([...roundRobin.slice(0, 5), g('B', 'C', '*', '3')]);
    const b = table.players.find((p) => p.name === 'B')!;
    const c = table.players.find((p) => p.name === 'C')!;
    expect(b.score).toBe(0.5);
    expect(c.score).toBe(1.5);
    expect(b.played).toBe(2);
    expect(table.unfinished).toBe(1);
    expect(table.complete).toBe(false);
    expect(crosstableCaveat(table)).toContain('1 without a recorded result (scored for nobody)');
  });

  it('counts a second copy of one game once', () => {
    const table = buildCrosstable([...roundRobin, g('A', 'B', '1-0', '1')]);
    expect(table.duplicates).toBe(1);
    expect(table.players.find((p) => p.name === 'A')!.score).toBe(2.5);
  });

  it('matches names by the index key, so case and spacing do not split a player', () => {
    const table = buildCrosstable([
      g('Carlsen,  Magnus', 'X', '1-0'),
      g('Y', 'carlsen, magnus', '0-1'),
    ]);
    expect(table.players.filter((p) => p.name.toLowerCase().includes('carlsen'))).toHaveLength(1);
  });

  it('calls a partial round robin provisional rather than complete', () => {
    const table = buildCrosstable(roundRobin.slice(0, 5));
    expect(table.format).toBe('round-robin');
    expect(table.complete).toBe(false);
    expect(crosstableCaveat(table)).toContain('provisional');
  });

  it('treats a large field with few pairings as a swiss, ordered by Buchholz', () => {
    const players = Array.from({ length: 12 }, (_, i) => `P${i + 1}`);
    const games: CrosstableGame[] = [];
    for (let round = 1; round <= 3; round += 1) {
      for (let i = 0; i < 6; i += 1) {
        const white = players[(i + round * 2) % 12]!;
        const black = players[(i + 6 + round) % 12]!;
        if (white !== black)
          games.push(g(white, black, i % 3 === 0 ? '1/2-1/2' : '1-0', String(round)));
      }
    }
    const table = buildCrosstable(games);
    expect(table.format).toBe('swiss');
    expect(table.tieBreaks[0]).toBe('Buchholz');
    expect(table.complete).toBe(false);
    for (let i = 1; i < table.players.length; i += 1) {
      expect(table.players[i - 1]!.score).toBeGreaterThanOrEqual(table.players[i]!.score);
    }
  });

  it('writes halves the way a scoresheet does', () => {
    expect(formatPoints(0)).toBe('0');
    expect(formatPoints(0.5)).toBe('½');
    expect(formatPoints(6.5)).toBe('6½');
    expect(formatPoints(7)).toBe('7');
  });
});
