/**
 * What a collection can say about one player, counted.
 *
 * Every number here is a count with a denominator beside it, and every one is
 * computed from stored games rather than from a model of anybody's chess. That
 * is the whole design rule for this file and the reason it is separate from the
 * workspace: a "player profile" is exactly where software is tempted to start
 * asserting personality, and the way not to is to have no code that could.
 *
 * The split against `tendencies.ts` is about cost. Everything here comes from
 * game *summaries*, which are cheap and can cover a whole archive; anything
 * needing the moves is over there, over a bounded sample that says how big it
 * was.
 */

import type { GameResult } from '@/database/types';
import type { GameSummary } from '@/persistence/types';
import { openingDisplay } from '@/theory/classify-games';

export type PlayerColor = 'w' | 'b';

/** A period the user asked about, resolved to a year range. */
export interface PlayerPeriod {
  readonly id: 'all' | 'last-5' | 'last-3' | 'last-12m' | 'custom';
  readonly label: string;
  readonly fromYear?: number;
  readonly toYear?: number;
}

export const PERIODS: readonly PlayerPeriod[] = [
  { id: 'all', label: 'All time' },
  { id: 'last-5', label: 'Last 5 years' },
  { id: 'last-3', label: 'Last 3 years' },
  { id: 'last-12m', label: 'Last 12 months' },
];

export function resolvePeriod(period: PlayerPeriod, now = new Date()): PlayerPeriod {
  const year = now.getFullYear();
  if (period.id === 'last-5') return { ...period, fromYear: year - 4 };
  if (period.id === 'last-3') return { ...period, fromYear: year - 2 };
  // Twelve months is approximated by the current and previous calendar year,
  // because a PGN date is often only a year. Stated rather than hidden: the
  // panel prints the resolved range next to the label.
  if (period.id === 'last-12m') return { ...period, fromYear: year - 1 };
  return period;
}

/** Which side the player had, or null when this game is not theirs. */
export function playerSide(game: GameSummary, keys: ReadonlySet<string>): PlayerColor | null {
  if (keys.has(game.whiteKey)) return 'w';
  if (keys.has(game.blackKey)) return 'b';
  return null;
}

/** Points for the player: a win is 1, a draw is a half, an unfinished game is 0. */
export function pointsFor(result: GameResult, side: PlayerColor): number {
  if (result === '1/2-1/2') return 0.5;
  if (result === '1-0') return side === 'w' ? 1 : 0;
  if (result === '0-1') return side === 'b' ? 1 : 0;
  return 0;
}

export interface ScoreLine {
  readonly games: number;
  readonly wins: number;
  readonly draws: number;
  readonly losses: number;
  /** Unfinished or unrecorded results, counted rather than folded into losses. */
  readonly unknown: number;
  readonly points: number;
}

const EMPTY_SCORE: ScoreLine = { games: 0, wins: 0, draws: 0, losses: 0, unknown: 0, points: 0 };

/** Percentage score, or null when there are no decided games to compute one from. */
export function scorePercent(line: ScoreLine): number | null {
  const decided = line.wins + line.draws + line.losses;
  return decided === 0 ? null : (line.points / decided) * 100;
}

export interface OpeningCount {
  readonly key: string;
  readonly eco: string;
  readonly label: string;
  readonly games: number;
  readonly points: number;
  /** Games within the recent window, for "still playing this" versus "used to". */
  readonly recentGames: number;
  /**
   * The most recent game in this group, and the ply its opening was recognised
   * at.
   *
   * Carried so "open this line on the board" is one action rather than a
   * filter the user has to rebuild by hand: the profile already knows a game
   * that reached the position and where in it that happened.
   */
  readonly exampleGameId: string;
  readonly examplePly: number;
  readonly exampleDate?: string;
}

export interface OpponentCount {
  readonly key: string;
  readonly name: string;
  readonly games: number;
  readonly points: number;
  readonly lastYear?: number;
}

export interface PlayerAggregate {
  /**
   * The name as the most recent game spells it.
   *
   * A profile is keyed on a normalized name, which is lower-cased and stripped
   * of stray whitespace so that two spellings of one string match. That key is
   * the wrong thing to put in a heading: "carlsen, magnus" is not how anybody
   * writes it. So the display form is read back from the games themselves,
   * preferring the newest, and only overridden by an identity the user stored.
   */
  readonly displayName: string | null;
  /** Games the aggregate is over, after the period filter. */
  readonly games: number;
  /** Games seen before filtering, so a narrow period is visibly narrow. */
  readonly totalGames: number;
  readonly overall: ScoreLine;
  readonly asWhite: ScoreLine;
  readonly asBlack: ScoreLine;
  readonly firstYear?: number;
  readonly lastYear?: number;
  readonly minRating?: number;
  readonly maxRating?: number;
  readonly averageRating?: number;
  /** Games carrying a rating for this player. The denominator for the above. */
  readonly ratedGames: number;
  readonly openingsAsWhite: readonly OpeningCount[];
  readonly openingsAsBlack: readonly OpeningCount[];
  readonly opponents: readonly OpponentCount[];
  readonly recent: readonly GameSummary[];
  /** Games with no classification and no ECO tag: unnamed, not "no opening". */
  readonly unclassified: number;
}

export interface AggregateOptions {
  /** Games at or after this year count as "recent" in the opening columns. */
  readonly recentFromYear?: number;
  readonly recentGamesShown?: number;
}

/**
 * Fold a set of the player's games into the profile's numbers.
 *
 * Written as a fold over summaries so it can be run incrementally over pages of
 * a large collection: the caller reads a page, calls this, and adds the
 * results. Nothing here needs the whole set in memory at once except the
 * opening and opponent tallies, which are bounded by how many distinct openings
 * and opponents exist rather than by how many games.
 */
export function aggregatePlayer(
  games: readonly GameSummary[],
  keys: ReadonlySet<string>,
  options: AggregateOptions = {},
): PlayerAggregate {
  const recentFromYear = options.recentFromYear ?? new Date().getFullYear() - 2;
  const overall = { ...EMPTY_SCORE };
  const white = { ...EMPTY_SCORE };
  const black = { ...EMPTY_SCORE };
  const openings = { w: new Map<string, OpeningCount>(), b: new Map<string, OpeningCount>() };
  const opponents = new Map<string, OpponentCount>();
  let firstYear: number | undefined;
  let lastYear: number | undefined;
  let ratingSum = 0;
  let ratedGames = 0;
  let minRating: number | undefined;
  let maxRating: number | undefined;
  let unclassified = 0;
  let matched = 0;

  for (const game of games) {
    const side = playerSide(game, keys);
    if (side === null) continue;
    matched += 1;

    const line = side === 'w' ? white : black;
    const points = pointsFor(game.result, side);
    for (const target of [overall, line]) {
      target.games += 1;
      target.points += points;
      if (game.result === '*') target.unknown += 1;
      else if (game.result === '1/2-1/2') target.draws += 1;
      else if (points === 1) target.wins += 1;
      else target.losses += 1;
    }

    if (game.year !== undefined) {
      firstYear = firstYear === undefined ? game.year : Math.min(firstYear, game.year);
      lastYear = lastYear === undefined ? game.year : Math.max(lastYear, game.year);
    }

    const rating = side === 'w' ? game.whiteRating : game.blackRating;
    if (rating !== undefined) {
      ratingSum += rating;
      ratedGames += 1;
      minRating = minRating === undefined ? rating : Math.min(minRating, rating);
      maxRating = maxRating === undefined ? rating : Math.max(maxRating, rating);
    }

    const display = openingDisplay(game);
    if (display.source === 'none') unclassified += 1;
    else {
      /*
        Keyed by ECO plus label rather than by name alone. "Sicilian Defense"
        covers a third of Black's practice and telling somebody that is not a
        fact they can use; the dataset's own variation naming is the level at
        which the row means something.
      */
      const key = `${display.eco ?? '?'}|${display.label ?? ''}`;
      const table = openings[side];
      const existing = table.get(key);
      // The newest game becomes the example, so "show me this line" opens the
      // most recent time they actually played it.
      const newer = !existing?.exampleDate || (game.date ?? '') >= existing.exampleDate;
      table.set(key, {
        key,
        eco: display.eco ?? '',
        label: display.label ?? display.eco ?? 'Unnamed',
        games: (existing?.games ?? 0) + 1,
        points: (existing?.points ?? 0) + points,
        recentGames: (existing?.recentGames ?? 0) + ((game.year ?? 0) >= recentFromYear ? 1 : 0),
        exampleGameId: newer ? game.id : (existing?.exampleGameId ?? game.id),
        examplePly: newer
          ? (game.classification?.ply ?? 0)
          : (existing?.examplePly ?? game.classification?.ply ?? 0),
        ...(newer
          ? game.date
            ? { exampleDate: game.date }
            : {}
          : existing?.exampleDate
            ? { exampleDate: existing.exampleDate }
            : {}),
      });
    }

    const opponentKey = side === 'w' ? game.blackKey : game.whiteKey;
    const opponentName = side === 'w' ? game.black : game.white;
    const opponent = opponents.get(opponentKey);
    opponents.set(opponentKey, {
      key: opponentKey,
      name: opponentName,
      games: (opponent?.games ?? 0) + 1,
      points: (opponent?.points ?? 0) + points,
      ...(game.year !== undefined
        ? { lastYear: Math.max(opponent?.lastYear ?? 0, game.year) }
        : opponent?.lastYear !== undefined
          ? { lastYear: opponent.lastYear }
          : {}),
    });
  }

  const byGames = <T extends { games: number }>(a: T, b: T) => b.games - a.games;

  let displayName: string | null = null;
  let displayDate = '';
  for (const game of games) {
    const side = playerSide(game, keys);
    if (side === null) continue;
    const date = game.date ?? '';
    if (displayName === null || date > displayDate) {
      displayName = side === 'w' ? game.white : game.black;
      displayDate = date;
    }
  }
  const recent = [...games]
    .filter((game) => playerSide(game, keys) !== null)
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    .slice(0, options.recentGamesShown ?? 10);

  return {
    displayName,
    games: matched,
    totalGames: games.length,
    overall,
    asWhite: white,
    asBlack: black,
    ...(firstYear !== undefined ? { firstYear } : {}),
    ...(lastYear !== undefined ? { lastYear } : {}),
    ...(minRating !== undefined ? { minRating } : {}),
    ...(maxRating !== undefined ? { maxRating } : {}),
    ...(ratedGames > 0 ? { averageRating: Math.round(ratingSum / ratedGames) } : {}),
    ratedGames,
    openingsAsWhite: [...openings.w.values()].sort(byGames),
    openingsAsBlack: [...openings.b.values()].sort(byGames),
    opponents: [...opponents.values()].sort(byGames),
    recent,
    unclassified,
  };
}

/** Average plies per game, when the caller has ply counts to give. */
export const averageLength = (plies: readonly number[]): number | null =>
  plies.length === 0 ? null : plies.reduce((sum, value) => sum + value, 0) / plies.length / 2;
