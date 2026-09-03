/**
 * What a titled player actually wants to know about tomorrow's opponent.
 *
 * The existing preparation module answers "what do they play" as a tree. This
 * answers the three questions that come before it and are harder to get from a
 * tree: what has changed recently, which move orders they favour, and how much
 * evidence any of that rests on.
 *
 * Two rules run through everything here.
 *
 * **Counts, never significance.** A shift from 31% to 12% over eleven games is
 * an observation about eleven games. Calling it a trend would be a statistical
 * claim this module has not earned and cannot make, so the vocabulary is
 * "observed change in selected games" and every figure carries its sample.
 *
 * **Move orders are read, never inferred.** A fingerprint says a move order
 * occurred in games that are in front of the user; it never says the opponent
 * "prefers" anything in a psychological sense, and there is deliberately no
 * code path that could produce such a sentence.
 */

import { mainlinePath } from '@/chess/tree/tree';
import type { NodeId } from '@/chess/tree/types';
import type { San } from '@/chess/types';
import type { GameRecord } from '@/persistence/types';
import { playerKey } from '@/persistence/schema/migrations';

/** Half of one opponent's practice: their games with one colour. */
export interface DossierSide {
  readonly color: 'w' | 'b';
  readonly games: number;
  readonly score: number;
  readonly firstMoves: readonly DossierChoice[];
  readonly openings: readonly DossierChoice[];
}

export interface DossierChoice {
  readonly label: string;
  readonly games: number;
  /** Share of the side's games, to one decimal. */
  readonly frequency: number;
  readonly recentGames: number;
  readonly recentFrequency: number;
  readonly score: number;
  readonly lastYear?: number;
}

export interface OpponentDossier {
  readonly name: string;
  readonly games: number;
  readonly ratingRange?: { readonly low: number; readonly high: number };
  readonly dateRange?: { readonly from: number; readonly to: number };
  readonly white: DossierSide;
  readonly black: DossierSide;
  /** The window "recent" refers to, so every recent figure can be read. */
  readonly recentFromYear: number;
}

export interface DossierOptions {
  /** Games from this year onwards count as recent. Default: last three years. */
  readonly recentFromYear?: number;
  /** Cap on how many choices each list reports. */
  readonly limit?: number;
}

/**
 * Build the dossier from games already on the machine.
 *
 * Deliberately takes the games rather than fetching them: the caller has
 * already applied the user's filters (dates, ratings, event), and a report
 * that quietly widened its own sample would be describing a different player
 * than the one on screen.
 */
export function buildDossier(
  name: string,
  games: readonly GameRecord[],
  options: DossierOptions = {},
): OpponentDossier {
  const key = playerKey(name);
  const recentFromYear = options.recentFromYear ?? new Date().getFullYear() - 2;
  const limit = options.limit ?? 8;

  const mine = games.filter((game) => game.whiteKey === key || game.blackKey === key);
  const ratings: number[] = [];
  const years: number[] = [];
  for (const game of mine) {
    const rating = game.whiteKey === key ? game.whiteRating : game.blackRating;
    if (rating !== undefined) ratings.push(rating);
    if (game.year !== undefined) years.push(game.year);
  }

  return {
    name,
    games: mine.length,
    ...(ratings.length
      ? { ratingRange: { low: Math.min(...ratings), high: Math.max(...ratings) } }
      : {}),
    ...(years.length ? { dateRange: { from: Math.min(...years), to: Math.max(...years) } } : {}),
    white: buildSide(mine, key, 'w', recentFromYear, limit),
    black: buildSide(mine, key, 'b', recentFromYear, limit),
    recentFromYear,
  };
}

function buildSide(
  games: readonly GameRecord[],
  key: string,
  color: 'w' | 'b',
  recentFromYear: number,
  limit: number,
): DossierSide {
  const side = games.filter((game) => (color === 'w' ? game.whiteKey : game.blackKey) === key);
  return {
    color,
    games: side.length,
    score: scoreOf(side, color),
    firstMoves: tally(
      side,
      color,
      recentFromYear,
      limit,
      (game) => firstMoveOf(game, color) ?? null,
    ),
    openings: tally(side, color, recentFromYear, limit, (game) => openingFamilyOf(game) ?? null),
  };
}

function tally(
  games: readonly GameRecord[],
  color: 'w' | 'b',
  recentFromYear: number,
  limit: number,
  label: (game: GameRecord) => string | null,
): readonly DossierChoice[] {
  const groups = new Map<string, GameRecord[]>();
  for (const game of games) {
    const name = label(game);
    if (name === null) continue;
    groups.set(name, [...(groups.get(name) ?? []), game]);
  }
  const total = [...groups.values()].reduce((sum, group) => sum + group.length, 0);
  const recentTotal = games.filter((game) => (game.year ?? 0) >= recentFromYear).length;

  return [...groups]
    .map(([name, group]) => {
      const recent = group.filter((game) => (game.year ?? 0) >= recentFromYear);
      const lastYear = group.reduce<number | undefined>(
        (latest, game) =>
          game.year === undefined ? latest : Math.max(latest ?? game.year, game.year),
        undefined,
      );
      return {
        label: name,
        games: group.length,
        frequency: percent(group.length, total),
        recentGames: recent.length,
        recentFrequency: percent(recent.length, recentTotal),
        score: scoreOf(group, color),
        ...(lastYear !== undefined ? { lastYear } : {}),
      };
    })
    .sort((a, b) => b.games - a.games || a.label.localeCompare(b.label))
    .slice(0, limit);
}

// --- Recent versus historical ----------------------------------------------

/**
 * The same choice measured over two windows, side by side.
 *
 * `change` is arithmetic on two percentages and nothing more. It is not a
 * trend, not a significance test, and the label the UI puts on it says so.
 */
export interface PeriodComparison {
  readonly label: string;
  readonly historicalGames: number;
  readonly historicalFrequency: number;
  readonly recentGames: number;
  readonly recentFrequency: number;
  /** Recent minus historical, in percentage points. */
  readonly change: number;
}

export interface PeriodComparisonResult {
  readonly historicalWindow: { readonly from?: number; readonly to: number };
  readonly recentWindow: { readonly from: number };
  readonly historicalTotal: number;
  readonly recentTotal: number;
  readonly rows: readonly PeriodComparison[];
  /**
   * Whether either window is too small to be worth reading.
   *
   * Not a significance test — a threshold, stated in the type so the UI cannot
   * quietly present five games as a repertoire change.
   */
  readonly thin: boolean;
}

export const THIN_SAMPLE = 10;

export function comparePeriods(
  games: readonly GameRecord[],
  name: string,
  color: 'w' | 'b',
  recentFromYear: number,
  label: (game: GameRecord) => string | null = openingFamilyOf,
): PeriodComparisonResult {
  const key = playerKey(name);
  const side = games.filter((game) => (color === 'w' ? game.whiteKey : game.blackKey) === key);
  const recent = side.filter((game) => (game.year ?? 0) >= recentFromYear);
  const historical = side.filter((game) => (game.year ?? 0) < recentFromYear);

  const labels = new Set<string>();
  const count = (group: readonly GameRecord[]) => {
    const counts = new Map<string, number>();
    for (const game of group) {
      const name_ = label(game);
      if (name_ === null) continue;
      labels.add(name_);
      counts.set(name_, (counts.get(name_) ?? 0) + 1);
    }
    return counts;
  };
  const historicalCounts = count(historical);
  const recentCounts = count(recent);

  const rows = [...labels]
    .map((name_) => {
      const historicalGames = historicalCounts.get(name_) ?? 0;
      const recentGames = recentCounts.get(name_) ?? 0;
      const historicalFrequency = percent(historicalGames, historical.length);
      const recentFrequency = percent(recentGames, recent.length);
      return {
        label: name_,
        historicalGames,
        historicalFrequency,
        recentGames,
        recentFrequency,
        change: round1(recentFrequency - historicalFrequency),
      };
    })
    // Largest movement first in either direction: a line they have abandoned
    // is as much preparation as one they have taken up.
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change) || b.recentGames - a.recentGames);

  return {
    historicalWindow: { to: recentFromYear - 1 },
    recentWindow: { from: recentFromYear },
    historicalTotal: historical.length,
    recentTotal: recent.length,
    rows,
    thin: recent.length < THIN_SAMPLE || historical.length < THIN_SAMPLE,
  };
}

// --- Move-order fingerprints -----------------------------------------------

/**
 * A move order that actually occurred, with the games that contain it.
 *
 * The `pattern` is a description of a *sequence property* — "1.Nf3 played
 * before d4", "h3 within the first ten moves" — rather than a position. That
 * is the thing preparation cares about and the thing a position-keyed tree
 * cannot express: two players can reach identical positions while being
 * completely different to prepare against, because one of them will let you
 * transpose and the other will not.
 */
export interface MoveOrderFingerprint {
  readonly id: string;
  readonly label: string;
  readonly games: number;
  readonly frequency: number;
  readonly recentGames: number;
  readonly lastYear?: number;
  /** The ids of the games it was seen in, so the claim can be opened. */
  readonly gameIds: readonly string[];
}

/** How many plies of a game a fingerprint is allowed to look at. */
const FINGERPRINT_PLIES = 24;

interface FingerprintRule {
  readonly id: string;
  readonly label: string;
  readonly color: 'w' | 'b' | 'any';
  matches(moves: readonly San[]): boolean;
}

/**
 * The rules, written out rather than mined.
 *
 * A learned rule would produce patterns nobody asked about and nobody can
 * check. These are the properties strong players discuss out loud, each one a
 * plain predicate over the opening moves, each one falsifiable by opening the
 * games behind it.
 */
export const FINGERPRINT_RULES: readonly FingerprintRule[] = [
  {
    id: 'nf3-before-d4',
    label: '1.Nf3 before d4',
    color: 'w',
    matches: (moves) => {
      const nf3 = indexOfWhite(moves, 'Nf3');
      const d4 = indexOfWhite(moves, 'd4');
      return nf3 >= 0 && (d4 < 0 || nf3 < d4);
    },
  },
  {
    id: 'c4-before-d4',
    label: '1.c4 before d4',
    color: 'w',
    matches: (moves) => {
      const c4 = indexOfWhite(moves, 'c4');
      const d4 = indexOfWhite(moves, 'd4');
      return c4 >= 0 && (d4 < 0 || c4 < d4);
    },
  },
  {
    id: 'early-h3',
    label: 'Early h3',
    color: 'w',
    matches: (moves) => within(indexOfWhite(moves, 'h3'), 20),
  },
  {
    id: 'early-h6',
    label: 'Early h6',
    color: 'b',
    matches: (moves) => within(indexOfBlack(moves, 'h6'), 20),
  },
  {
    id: 'early-a3',
    label: 'Early a3',
    color: 'w',
    matches: (moves) => within(indexOfWhite(moves, 'a3'), 20),
  },
  {
    id: 'delayed-castling',
    label: 'Castled after move 10, or not at all',
    color: 'any',
    matches: (moves) => {
      const castle = moves.findIndex((san) => san.startsWith('O-O'));
      return castle < 0 || castle >= 20;
    },
  },
  {
    id: 'anti-sicilian-bb5',
    label: 'Anti-Sicilian with Bb5',
    color: 'w',
    matches: (moves) =>
      indexOfWhite(moves, 'e4') === 0 &&
      moves.some((san) => san === 'Bb5' || san === 'Bb5+') &&
      indexOfWhite(moves, 'd4') < 0,
  },
  {
    id: 'open-sicilian',
    label: 'Open Sicilian (2.Nf3 and 3.d4)',
    color: 'w',
    matches: (moves) =>
      indexOfWhite(moves, 'e4') === 0 && moves[1] === 'c5' && within(indexOfWhite(moves, 'd4'), 8),
  },
  {
    id: 'exchange-early',
    label: 'Early queen trade',
    color: 'any',
    matches: (moves) =>
      within(
        moves.findIndex((san) => /^Qx/.test(san)),
        20,
      ),
  },
];

export function moveOrderFingerprints(
  games: readonly GameRecord[],
  name: string,
  color: 'w' | 'b',
  recentFromYear: number,
): readonly MoveOrderFingerprint[] {
  const key = playerKey(name);
  const side = games.filter((game) => (color === 'w' ? game.whiteKey : game.blackKey) === key);
  if (side.length === 0) return [];

  const openings = new Map<string, readonly San[]>();
  for (const game of side) openings.set(game.id, openingMoves(game));

  return FINGERPRINT_RULES.filter((rule) => rule.color === 'any' || rule.color === color)
    .map((rule) => {
      const hits = side.filter((game) => rule.matches(openings.get(game.id) ?? []));
      const lastYear = hits.reduce<number | undefined>(
        (latest, game) =>
          game.year === undefined ? latest : Math.max(latest ?? game.year, game.year),
        undefined,
      );
      return {
        id: rule.id,
        label: rule.label,
        games: hits.length,
        frequency: percent(hits.length, side.length),
        recentGames: hits.filter((game) => (game.year ?? 0) >= recentFromYear).length,
        ...(lastYear !== undefined ? { lastYear } : {}),
        gameIds: hits.map((game) => game.id),
      };
    })
    .filter((fingerprint) => fingerprint.games > 0)
    .sort((a, b) => b.frequency - a.frequency || a.label.localeCompare(b.label));
}

// --- Shared helpers --------------------------------------------------------

/** The opening moves of a game in SAN, capped, for fingerprint matching. */
export function openingMoves(game: GameRecord, plies = FINGERPRINT_PLIES): readonly San[] {
  const path = mainlinePath(game.tree);
  const moves: San[] = [];
  for (let index = 1; index < path.length && moves.length < plies; index += 1) {
    const move = game.tree.nodes[path[index] as NodeId]?.move;
    if (move) moves.push(move.san);
  }
  return moves;
}

/**
 * The opening's family name, from the header rather than from the moves.
 *
 * A PGN's `Opening` tag is what the source said, and quoting it keeps the
 * provenance honest. Kingfisher does not run its own opening classifier, and
 * inventing one here would make two parts of the product disagree about what a
 * game is.
 */
export function openingFamilyOf(game: GameRecord): string | null {
  const opening = game.opening?.trim();
  if (opening) return opening.split(':')[0]!.trim();
  const eco = game.eco?.trim();
  return eco ? eco.slice(0, 3) : null;
}

export function firstMoveOf(game: GameRecord, color: 'w' | 'b'): string | null {
  const moves = openingMoves(game, 2);
  const san = color === 'w' ? moves[0] : moves[1];
  return san ?? null;
}

const indexOfWhite = (moves: readonly San[], san: string): number => {
  for (let index = 0; index < moves.length; index += 2) if (moves[index] === san) return index;
  return -1;
};

const indexOfBlack = (moves: readonly San[], san: string): number => {
  for (let index = 1; index < moves.length; index += 2) if (moves[index] === san) return index;
  return -1;
};

const within = (index: number, plies: number): boolean => index >= 0 && index < plies;

/** Points for one side, where a draw is half. */
function scoreOf(games: readonly GameRecord[], color: 'w' | 'b'): number {
  if (games.length === 0) return 0;
  let points = 0;
  for (const game of games) {
    if (game.result === '1/2-1/2') points += 0.5;
    else if (game.result === (color === 'w' ? '1-0' : '0-1')) points += 1;
  }
  return round1((points / games.length) * 100);
}

const percent = (part: number, whole: number): number => (whole ? round1((part / whole) * 100) : 0);
const round1 = (value: number): number => Math.round(value * 10) / 10;
