/**
 * A position's history, from the games that reached it.
 *
 * The half of ChessBase's opening report Kingfisher did not have: who played
 * this first, who plays it, and how often it has been played year by year.
 * It is read from the stored games' own headers — the only games Kingfisher
 * holds with dates. The reference packs keep one aggregate per position and
 * no dates, so they cannot answer "when"; the page says so rather than
 * implying a history of the whole chess world.
 *
 * Facts only: counts with their denominators, the earliest and latest dated
 * game, and the players who reached the position most often. No trend label
 * ("fashionable", "declining") is derived, because a collection's years say
 * as much about what was imported as about what was played.
 */

import type { GameResult } from '@/database/types';

export interface HistoryGame {
  readonly id: string;
  readonly white: string;
  readonly black: string;
  readonly result: GameResult;
  readonly year?: number;
  readonly date?: string;
  readonly event?: string;
}

export interface YearCount {
  readonly year: number;
  readonly games: number;
  /** White's points from those games (1 a win, ½ a draw), for a score. */
  readonly whitePoints: number;
  /** Games with a result, the denominator of `whitePoints`. */
  readonly decided: number;
}

export interface PlayerCount {
  readonly name: string;
  readonly games: number;
  readonly asWhite: number;
  readonly asBlack: number;
}

export interface PositionHistory<G extends HistoryGame = HistoryGame> {
  /** Games read. */
  readonly games: number;
  /** Games with no usable year. */
  readonly undated: number;
  /** Every year between the first and the last, empty years included. */
  readonly byYear: readonly YearCount[];
  readonly first: G | null;
  readonly latest: G | null;
  /** The players who reached the position most often, most first. */
  readonly players: readonly PlayerCount[];
}

const PLAYER_LIMIT = 8;
const UNKNOWN = new Set(['', '?', '-', 'unknown', 'nn', 'n.n.']);

const key = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

/** The game's year, from its own field or the leading digits of its date. */
function yearOf(game: HistoryGame): number | null {
  if (typeof game.year === 'number' && game.year > 0) return game.year;
  const match = /^(\d{4})/.exec(game.date ?? '');
  const year = match ? Number(match[1]) : NaN;
  return Number.isFinite(year) && year > 0 ? year : null;
}

/** A sortable date: the year, then whatever month and day the header gives. */
function sortKey(game: HistoryGame): string {
  const date = (game.date ?? '').replace(/\?/g, '0');
  return /^\d{4}/.test(date) ? date : `${yearOf(game) ?? 0}`;
}

const whitePoints = (result: GameResult): number | null =>
  result === '1-0' ? 1 : result === '0-1' ? 0 : result === '1/2-1/2' ? 0.5 : null;

export function positionHistory<G extends HistoryGame>(games: readonly G[]): PositionHistory<G> {
  const years = new Map<number, { games: number; whitePoints: number; decided: number }>();
  const players = new Map<string, PlayerCount & { name: string }>();
  let undated = 0;
  let first: G | null = null;
  let latest: G | null = null;

  for (const game of games) {
    const year = yearOf(game);
    if (year === null) undated += 1;
    else {
      const entry = years.get(year) ?? { games: 0, whitePoints: 0, decided: 0 };
      entry.games += 1;
      const points = whitePoints(game.result);
      if (points !== null) {
        entry.whitePoints += points;
        entry.decided += 1;
      }
      years.set(year, entry);
      if (!first || sortKey(game) < sortKey(first)) first = game;
      if (!latest || sortKey(game) > sortKey(latest)) latest = game;
    }
    for (const [name, side] of [
      [game.white, 'w'],
      [game.black, 'b'],
    ] as const) {
      const id = key(name ?? '');
      if (UNKNOWN.has(id)) continue;
      const entry = players.get(id) ?? { name: name.trim(), games: 0, asWhite: 0, asBlack: 0 };
      players.set(id, {
        ...entry,
        games: entry.games + 1,
        asWhite: entry.asWhite + (side === 'w' ? 1 : 0),
        asBlack: entry.asBlack + (side === 'b' ? 1 : 0),
      });
    }
  }

  const byYear: YearCount[] = [];
  if (years.size) {
    const known = [...years.keys()];
    for (let year = Math.min(...known); year <= Math.max(...known); year += 1) {
      const entry = years.get(year);
      byYear.push({
        year,
        games: entry?.games ?? 0,
        whitePoints: entry?.whitePoints ?? 0,
        decided: entry?.decided ?? 0,
      });
    }
  }

  return {
    games: games.length,
    undated,
    byYear,
    first,
    latest,
    players: [...players.values()]
      .filter((player) => player.games > 1 || players.size <= PLAYER_LIMIT)
      .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name))
      .slice(0, PLAYER_LIMIT),
  };
}
