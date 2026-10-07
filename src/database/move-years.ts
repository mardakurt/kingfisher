/**
 * A move's share of the dated games at one position, year by year.
 *
 * The counts come from the source. This module only turns them into shares.
 * A year with too few games is left out of the line rather than drawn as a
 * spike: two games is not a fashion. The same floor as a reference pack's
 * year chart (`FASHION_MIN_YEAR_GAMES`).
 */

import type { YearGames } from './types';

/** A year with fewer games than this at the position is not drawn as a share. */
export const YEAR_SHARE_MIN_GAMES = 20;

export interface YearPoint {
  readonly year: number;
  readonly games: number;
  /** This move's share of the dated games at the position that year, 0–100, one decimal. */
  readonly share: number;
}

export function yearPoints(
  moveYears: readonly YearGames[] | undefined,
  totals: readonly YearGames[],
  minGames = YEAR_SHARE_MIN_GAMES,
): { readonly points: readonly YearPoint[]; readonly thinYears: number } {
  const byYear = new Map((moveYears ?? []).map((row) => [row.year, row.games]));
  const dated = totals.filter((row) => row.year > 0);
  const drawn = dated.filter((row) => row.games >= minGames).sort((a, b) => a.year - b.year);
  return {
    thinYears: dated.length - drawn.length,
    points: drawn.map((row) => {
      const games = byYear.get(row.year) ?? 0;
      return {
        year: row.year,
        games,
        share: row.games === 0 ? 0 : Math.round((games / row.games) * 1000) / 10,
      };
    }),
  };
}
