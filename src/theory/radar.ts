/**
 * What has changed here recently?
 *
 * The radar compares how often each move was played at a position over three
 * windows — all time, the last three years, the last twelve months — and names
 * the moves whose share moved. That is a question a database can answer
 * exactly, and it is most of what a player means when they ask what is new in
 * a line.
 *
 * What it must never do is claim a novelty. "Theoretical novelty" is a
 * statement about the whole of chess literature; Kingfisher knows about one
 * collection, and the only honest form of the claim is the one that names the
 * collection: *new in this database*, *not seen before 2025*, *first appears
 * in the games you have*. Every label this module produces carries that
 * qualification in its own text, so a screenshot of it cannot be read as
 * something stronger than it is.
 *
 * The other rule is that dates are never inferred. A game with no year
 * contributes to the all-time counts and to nothing else — it cannot be
 * "recent" and it cannot be "first seen", because the evidence for either is
 * absent rather than zero.
 */

import type { DatabaseMove, ExplorerResult } from '@/database/types';

export interface RadarRow {
  readonly uci: string;
  readonly san: string;
  readonly allTime: RadarFigure;
  readonly threeYear: RadarFigure;
  readonly twelveMonth: RadarFigure;
  /**
   * Twelve-month share minus all-time share, in percentage points.
   *
   * The single number the list is ordered by, and deliberately the crudest
   * possible one: two subtractions a reader can redo from the columns beside
   * it. Anything smoothed or weighted would be a number nobody could check.
   */
  readonly shift: number;
  readonly labels: readonly RadarLabel[];
  readonly firstSeenYear?: number;
  readonly lastSeenYear?: number;
}

export interface RadarFigure {
  readonly games: number;
  readonly frequency: number;
}

/**
 * A claim the evidence supports, phrased so it cannot be over-read.
 *
 * There is no `novelty` member and there is not going to be one. The strongest
 * available claim is `new-in-database`, whose text names the database.
 */
export type RadarLabelKind =
  | 'new-in-database'
  | 'first-seen-since'
  | 'rare-before'
  | 'recently-popular'
  | 'falling-out-of-use';

export interface RadarLabel {
  readonly kind: RadarLabelKind;
  /** Complete, self-qualifying sentence. Never shortened by the caller. */
  readonly text: string;
}

export interface RadarOptions {
  /** "Now", so a test is not at the mercy of the calendar. */
  readonly currentYear?: number;
  /** Percentage points of movement before a move is worth reporting. */
  readonly minimumShift?: number;
  /** Games a window needs before its frequencies are reported at all. */
  readonly minimumSample?: number;
  readonly limit?: number;
}

export const DEFAULT_MINIMUM_SHIFT = 2;
export const DEFAULT_MINIMUM_SAMPLE = 20;

export interface RadarResult {
  readonly rows: readonly RadarRow[];
  /** True when a window is too small for its percentages to mean much. */
  readonly thin: boolean;
  readonly windows: {
    readonly allTime: number;
    readonly threeYear: number;
    readonly twelveMonth: number;
  };
  readonly currentYear: number;
}

/**
 * Compare three windows of the same position.
 *
 * Takes explorer results the caller has already fetched with the appropriate
 * date filters, rather than fetching them: the caller knows which source is
 * selected, and a radar that silently queried a different database than the
 * one on screen would be comparing two collections and calling it a trend.
 */
export function buildRadar(
  allTime: ExplorerResult,
  threeYear: ExplorerResult,
  twelveMonth: ExplorerResult,
  options: RadarOptions = {},
): RadarResult {
  const currentYear = options.currentYear ?? new Date().getFullYear();
  const minimumShift = options.minimumShift ?? DEFAULT_MINIMUM_SHIFT;
  const minimumSample = options.minimumSample ?? DEFAULT_MINIMUM_SAMPLE;

  const byUci = (result: ExplorerResult) =>
    new Map(result.moves.map((move) => [String(move.uci), move]));
  const all = byUci(allTime);
  const three = byUci(threeYear);
  const twelve = byUci(twelveMonth);

  const uciKeys = new Set([...all.keys(), ...three.keys(), ...twelve.keys()]);
  const rows: RadarRow[] = [];

  for (const uci of uciKeys) {
    const move = all.get(uci) ?? three.get(uci) ?? twelve.get(uci);
    if (!move) continue;
    const allFigure = figure(all.get(uci), allTime.totalGames);
    const threeFigure = figure(three.get(uci), threeYear.totalGames);
    const twelveFigure = figure(twelve.get(uci), twelveMonth.totalGames);
    const shift = round1(twelveFigure.frequency - allFigure.frequency);

    rows.push({
      uci,
      san: String(move.san),
      allTime: allFigure,
      threeYear: threeFigure,
      twelveMonth: twelveFigure,
      shift,
      labels: labelsFor({
        allFigure,
        threeFigure,
        twelveFigure,
        shift,
        minimumShift,
        currentYear,
      }),
      ...yearsOf(all.get(uci)),
    });
  }

  const ordered = rows
    .filter((row) => Math.abs(row.shift) >= minimumShift || row.labels.length > 0)
    .sort(
      (a, b) => Math.abs(b.shift) - Math.abs(a.shift) || b.twelveMonth.games - a.twelveMonth.games,
    )
    .slice(0, options.limit ?? 12);

  return {
    rows: ordered,
    thin: twelveMonth.totalGames < minimumSample || allTime.totalGames < minimumSample,
    windows: {
      allTime: allTime.totalGames,
      threeYear: threeYear.totalGames,
      twelveMonth: twelveMonth.totalGames,
    },
    currentYear,
  };
}

function labelsFor(context: {
  allFigure: RadarFigure;
  threeFigure: RadarFigure;
  twelveFigure: RadarFigure;
  shift: number;
  minimumShift: number;
  currentYear: number;
}): readonly RadarLabel[] {
  const labels: RadarLabel[] = [];
  const { allFigure, threeFigure, twelveFigure, shift, minimumShift, currentYear } = context;

  /*
    "New in this database" means exactly what it says: every game in the
    collection that reached this position and played this move is inside the
    recent window. It is not a novelty claim and the sentence never omits the
    words that make that clear.
  */
  if (twelveFigure.games > 0 && twelveFigure.games === allFigure.games) {
    labels.push({
      kind: 'new-in-database',
      text: 'Every game with this move in the selected database is from the last twelve months.',
    });
  } else if (threeFigure.games > 0 && threeFigure.games === allFigure.games) {
    labels.push({
      kind: 'first-seen-since',
      text: `No game with this move in the selected database is older than ${currentYear - 2}.`,
    });
  } else if (allFigure.games > 0 && threeFigure.games / allFigure.games > 0.8) {
    labels.push({
      kind: 'rare-before',
      text: `Rare in the selected database before ${currentYear - 2}: ${
        allFigure.games - threeFigure.games
      } of ${allFigure.games} games are older.`,
    });
  }

  if (shift >= minimumShift) {
    labels.push({
      kind: 'recently-popular',
      text: `Share in the selected database rose from ${allFigure.frequency}% all time to ${twelveFigure.frequency}% in the last twelve months.`,
    });
  } else if (shift <= -minimumShift) {
    labels.push({
      kind: 'falling-out-of-use',
      text: `Share in the selected database fell from ${allFigure.frequency}% all time to ${twelveFigure.frequency}% in the last twelve months.`,
    });
  }

  return labels;
}

const figure = (move: DatabaseMove | undefined, total: number): RadarFigure => ({
  games: move?.games ?? 0,
  frequency: total ? round1(((move?.games ?? 0) / total) * 100) : 0,
});

const yearsOf = (
  move: DatabaseMove | undefined,
): { firstSeenYear?: number; lastSeenYear?: number } =>
  move?.lastPlayedYear === undefined ? {} : { lastSeenYear: move.lastPlayedYear };

const round1 = (value: number): number => Math.round(value * 10) / 10;
