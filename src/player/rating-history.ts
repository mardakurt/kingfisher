/**
 * A player's rating over time, as their games recorded it.
 *
 * ChessBase's player dossier draws an Elo graph from its own rating lists.
 * Kingfisher has no rating list; it has the `WhiteElo`/`BlackElo` a game was
 * stored with, which is the rating the organiser printed for that event. So
 * this is that: per calendar month, the median rating recorded for the player
 * in the games of that month, with the count of games behind each point. A
 * game without a full month in its date, or without the player's rating, is
 * not plotted and is counted as such.
 *
 * Beside it, per year, the result against rated opponents and the FIDE
 * performance (table 8.1.1) — the same rule the tournament table uses.
 */

import type { GameSummary } from '@/persistence/types';
import { fidePerformance } from '@/tournament/crosstable';

import { playerSide, pointsFor } from './aggregate';

export interface RatingPoint {
  /** `YYYY-MM`. */
  readonly month: string;
  readonly rating: number;
  readonly games: number;
  readonly low: number;
  readonly high: number;
}

export interface YearPerformance {
  readonly year: number;
  readonly games: number;
  readonly score: number;
  readonly averageOpponent: number;
  readonly performance: number;
}

export interface RatingHistory {
  readonly points: readonly RatingPoint[];
  readonly years: readonly YearPerformance[];
  /** Games of the player's not plotted: no month in the date, or no rating recorded. */
  readonly unplotted: number;
}

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
};

export function ratingHistory(
  games: readonly GameSummary[],
  keys: ReadonlySet<string>,
): RatingHistory {
  const byMonth = new Map<string, number[]>();
  const byYear = new Map<number, { games: number; points: number; opponents: number }>();
  let unplotted = 0;
  for (const game of games) {
    const side = playerSide(game, keys);
    if (side === null) continue;
    const own = side === 'w' ? game.whiteRating : game.blackRating;
    const opponent = side === 'w' ? game.blackRating : game.whiteRating;
    const month = /^(\d{4})[.-](\d{2})/.exec(game.date ?? '');
    if (own && month && month[2] !== '??' && Number(month[2]) >= 1 && Number(month[2]) <= 12) {
      const key = `${month[1]}-${month[2]}`;
      const list = byMonth.get(key);
      if (list) list.push(own);
      else byMonth.set(key, [own]);
    } else unplotted += 1;
    const year = game.year ?? (month ? Number(month[1]) : undefined);
    if (year && opponent && game.result !== '*') {
      const entry = byYear.get(year) ?? { games: 0, points: 0, opponents: 0 };
      entry.games += 1;
      entry.points += pointsFor(game.result, side);
      entry.opponents += opponent;
      byYear.set(year, entry);
    }
  }
  const points = [...byMonth]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, ratings]) => ({
      month,
      rating: median(ratings),
      games: ratings.length,
      low: Math.min(...ratings),
      high: Math.max(...ratings),
    }));
  const years = [...byYear]
    .sort(([a], [b]) => a - b)
    .map(([year, entry]) => ({
      year,
      games: entry.games,
      score: entry.points / entry.games,
      averageOpponent: Math.round(entry.opponents / entry.games),
      performance: fidePerformance(entry.points, entry.games, entry.opponents / entry.games),
    }));
  return { points, years, unplotted };
}
