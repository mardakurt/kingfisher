/**
 * Rating classes and years, for the moves at one position, from a pack's
 * position histories.
 *
 * ChessBase for Mac's headline reference feature is "which move scores best
 * at your rating": switch the rating class and watch the order of the moves
 * change. A reference pack keeps one aggregate per move, with no ratings, so
 * it cannot filter its move counts by rating (`provider.ts` declares as
 * much). What it does keep, since Phase 85, is each *position's* games by
 * rating band and by year. The games of a band that reached the position
 * after a move are therefore an honest answer to a slightly different
 * question — "of the games in this band that reached the position after Nf6,
 * by any move order, how did they go?" — and that is the question this
 * module answers, and the label the panel prints.
 *
 * The difference matters only where a position is reached by more than one
 * move order, and it is stated rather than hidden. Nothing here adds one
 * band to another or one pack to another.
 *
 * Pure. `src/reference/rating-classes.test.ts`.
 */

import type { PackPositionHistory, PackTally } from './pack';

/** "<2000", "2000–2199", …, "2600+": the bands a pack's manifest declares. */
export function bandLabel(bands: readonly number[], lower: number): string {
  const sorted = [...bands].sort((a, b) => a - b);
  const index = sorted.indexOf(lower);
  const next = sorted[index + 1];
  if (lower <= 0) return next === undefined ? 'All rated' : `<${next}`;
  return next === undefined ? `${lower}+` : `${lower}–${next - 1}`;
}

/** White's points per game in a tally, as a percentage to one decimal; null with no games. */
export function whiteScore(tally: PackTally): number | null {
  if (tally.games <= 0) return null;
  return Math.round(((tally.white + tally.draws / 2) / tally.games) * 1000) / 10;
}

export interface ChildHistory {
  readonly uci: string;
  readonly san: string;
  /** The history of the position after the move; null when the pack carries none. */
  readonly history: PackPositionHistory | null;
}

export interface BandMoveRow extends PackTally {
  readonly uci: string;
  readonly san: string;
  /** White's score in the band, or null with no games. */
  readonly score: number | null;
  /** This row's share of the band's games across the listed moves, 0–100. */
  readonly share: number;
}

export interface BandMoves {
  readonly band: number;
  readonly rows: readonly BandMoveRow[];
  /** Games in the band across the rows. */
  readonly games: number;
  /** Moves whose resulting position the pack carries no history for. */
  readonly withoutHistory: readonly string[];
}

/**
 * The moves at a position, re-read for one rating band, most-played first.
 * A move with no games in the band is kept at the bottom with zero, because
 * "nobody rated 2600+ plays this" is the point of switching class.
 */
export function movesInBand(children: readonly ChildHistory[], band: number): BandMoves {
  const withoutHistory: string[] = [];
  const rows: Omit<BandMoveRow, 'share'>[] = [];
  for (const child of children) {
    if (!child.history) {
      withoutHistory.push(child.san);
      continue;
    }
    const tally = child.history.byBand.get(band) ?? { games: 0, white: 0, draws: 0, black: 0 };
    rows.push({ uci: child.uci, san: child.san, ...tally, score: whiteScore(tally) });
  }
  const games = rows.reduce((sum, row) => sum + row.games, 0);
  return {
    band,
    games,
    withoutHistory,
    rows: rows
      .map((row) => ({ ...row, share: games ? Math.round((row.games / games) * 1000) / 10 : 0 }))
      .sort((a, b) => b.games - a.games || a.san.localeCompare(b.san)),
  };
}

export interface BandRow extends PackTally {
  readonly band: number;
  readonly label: string;
  readonly score: number | null;
}

/** The position itself, one row per band the manifest declares, lowest first. */
export function positionByBand(
  history: PackPositionHistory,
  bands: readonly number[],
): readonly BandRow[] {
  return [...bands]
    .sort((a, b) => a - b)
    .map((band) => {
      const tally = history.byBand.get(band) ?? { games: 0, white: 0, draws: 0, black: 0 };
      return { band, label: bandLabel(bands, band), ...tally, score: whiteScore(tally) };
    });
}

/** A year with fewer games than this across the listed moves is not drawn as a share. */
export const FASHION_MIN_YEAR_GAMES = 20;

export interface FashionSeries {
  readonly uci: string;
  readonly san: string;
  /** One point per drawn year: the move's share of that year's games, 0–100, and its count. */
  readonly points: readonly {
    readonly year: number;
    readonly share: number;
    readonly games: number;
  }[];
}

export interface Fashion {
  /** Years drawn, ascending; a year under `FASHION_MIN_YEAR_GAMES` is left out and counted. */
  readonly years: readonly number[];
  readonly series: readonly FashionSeries[];
  readonly thinYears: number;
}

/**
 * Each move's share of the games that reached one of the listed positions,
 * year by year: how the choice at this position has shifted. Shares are of
 * the listed moves' games in that year, so they add up to 100 across all of
 * the moves (and less across the `limit` drawn). Unsmoothed, and a year too
 * thin to say anything is not drawn rather than drawn as a spike.
 */
export function fashionOf(children: readonly ChildHistory[], limit = 4): Fashion {
  const totals = new Map<number, number>();
  for (const child of children) {
    for (const [year, tally] of child.history?.byYear ?? []) {
      totals.set(year, (totals.get(year) ?? 0) + tally.games);
    }
  }
  const all = [...totals.keys()].sort((a, b) => a - b);
  const years = all.filter((year) => (totals.get(year) ?? 0) >= FASHION_MIN_YEAR_GAMES);
  const ranked = children
    .filter((child) => child.history)
    .map((child) => ({
      child,
      games: years.reduce((sum, year) => sum + (child.history?.byYear.get(year)?.games ?? 0), 0),
    }))
    .filter((entry) => entry.games > 0)
    .sort((a, b) => b.games - a.games)
    .slice(0, limit);
  return {
    years,
    thinYears: all.length - years.length,
    series: ranked.map(({ child }) => ({
      uci: child.uci,
      san: child.san,
      points: years.map((year) => {
        const games = child.history?.byYear.get(year)?.games ?? 0;
        const total = totals.get(year) ?? 0;
        return { year, games, share: total ? Math.round((games / total) * 1000) / 10 : 0 };
      }),
    })),
  };
}
