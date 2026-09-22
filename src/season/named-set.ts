/**
 * The named set the player has picked.
 *
 * A named set is one of four kinds. Each is a fact on a game the player
 * can reach by name — never a free-form label they typed and never a
 * tag the player cannot reach by name.
 *
 * - `last`: a window of days, the player's own games only.
 * - `event`: an exact `Event` header on a game.
 * - `site`: an exact `Site` header on a game (Lichess / Chess.com / OTB
 *   convention).
 * - `opening`: an exact `ECO` header, the same string the picker reads
 *   from the games index.
 *
 * The picker refuses to mix sources without an explicit `allowMixed`
 * flag, because OTB and Lichess games in the same bucket has been the
 * complaint behind every §3 complaint in the research.
 */

import type { GameRecord, GameSummary } from '@/persistence/types';
import { nameKey } from '@/round/identity';

export type SeasonKind = 'last' | 'event' | 'site' | 'opening';

export interface SeasonNamedSet {
  readonly kind: SeasonKind;
  /**
   * The set's identity, kind-dependent:
   *
   * - `last`: the number of days (30, 90, 180, 365).
   * - `event`: the exact `Event` header string.
   * - `site`: the exact `Site` header string.
   * - `opening`: the exact `ECO` header string.
   */
  readonly value: string;
  /**
   * Allow a set to include games from more than one source (OTB + Lichess
   * + Chess.com). Off by default — the picker surfaces a separate "All
   * sources" row that requires the player to opt in.
   */
  readonly allowMixed?: boolean;
}

export const SEASON_LAST_DAYS = [30, 90, 180, 365] as const;
export type SeasonLastDays = (typeof SEASON_LAST_DAYS)[number];

const isSeasonLastDays = (value: string): value is `${SeasonLastDays}` =>
  SEASON_LAST_DAYS.some((days) => `${days}` === value);

const present = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed && trimmed !== '?' && trimmed !== '????.??.??' ? trimmed : undefined;
};

/** Parse the picker URL parameter into a named-set predicate, or null. */
export function parseNamedSet(params: {
  readonly set?: string | readonly string[];
  readonly event?: string | readonly string[];
  readonly site?: string | readonly string[];
  readonly opening?: string | readonly string[];
  readonly mixed?: string | readonly string[];
}): SeasonNamedSet | null {
  const first = (value: string | readonly string[] | undefined): string | undefined =>
    typeof value === 'string' ? value : value?.[0];
  const set = first(params.set);
  const event = first(params.event);
  const site = first(params.site);
  const opening = first(params.opening);
  const allowMixed = first(params.mixed) === '1';
  const mixed = allowMixed ? { allowMixed: true as const } : {};
  if (set && isSeasonLastDays(set)) return { kind: 'last', value: set, ...mixed };
  if (event) return { kind: 'event', value: event, ...mixed };
  if (site) return { kind: 'site', value: site, ...mixed };
  if (opening) return { kind: 'opening', value: opening, ...mixed };
  return null;
}

export type SeasonSource = 'otb' | 'lichess' | 'chesscom' | 'other';

const siteSource = (site: string | undefined): SeasonSource => {
  const trimmed = (site ?? '').trim().toLowerCase();
  if (!trimmed) return 'other';
  if (trimmed.startsWith('https://lichess.org') || trimmed === 'lichess') return 'lichess';
  if (trimmed.startsWith('https://www.chess.com') || trimmed === 'chess.com') return 'chesscom';
  if (trimmed === 'otb' || trimmed === 'over the board' || trimmed === 'over-the-board')
    return 'otb';
  return 'other';
};

const sourcesOf = (games: readonly GameRecord[]): ReadonlySet<SeasonSource> =>
  new Set(games.map((game) => siteSource(game.site)));

/**
 * Filter `games` to those the player played (one of the player's aliases is
 * a White or Black header). The matches-search index already does this with
 * `playerKey` (case + whitespace); the reader does not trust that the index
 * has indexed every game, so the check is repeated here on the full record.
 */
export function gamesForPlayer(
  games: readonly GameRecord[],
  aliases: readonly string[],
): readonly GameRecord[] {
  if (aliases.length === 0) return [];
  const keys = new Set(aliases.map(nameKey).filter(Boolean));
  if (keys.size === 0) return [];
  return games.filter((game) => keys.has(nameKey(game.white)) || keys.has(nameKey(game.black)));
}

export interface SeasonSourceBucket {
  readonly predicate: SeasonNamedSet;
  readonly source: SeasonSource;
  readonly sourceLabel: string;
  readonly games: readonly GameRecord[];
}

/**
 * Apply a named-set predicate to a list of games that has already been
 * filtered to the player's games.
 *
 * The function refuses to return a set spanning OTB, Lichess and Chess.com
 * sources unless the predicate says `allowMixed`. Opting in compares the
 * sources as separate buckets with separate denominators; it never combines
 * their populations into one figure.
 */
export function applyNamedSet(
  games: readonly GameRecord[],
  predicate: SeasonNamedSet,
  now: number,
): { readonly sets: readonly SeasonSourceBucket[] } | { readonly error: string } {
  const matching = games.filter((game) => matchesNamedSet(game, predicate, now));
  if (matching.length === 0) {
    return { error: `No games match "${describeNamedSet(predicate)}".` };
  }
  if (!predicate.allowMixed) {
    const sources = sourcesOf(matching);
    if (sources.size > 1) {
      const listed = [...sources].sort().join(', ');
      return {
        error: `“${describeNamedSet(predicate)}” spans ${sources.size} sources (${listed}). Pick a single source, or enable “All sources” in the picker.`,
      };
    }
  }
  const sources = sourcesOf(matching);
  const buckets = [...sources].sort().map((source) =>
    bucketize(
      matching.filter((game) => siteSource(game.site) === source),
      predicate,
      source,
    ),
  );
  return { sets: buckets };
}

const SOURCE_LABEL: Record<SeasonSource, string> = {
  otb: 'OTB',
  lichess: 'Lichess',
  chesscom: 'Chess.com',
  other: 'Other',
};

const bucketize = (
  games: readonly GameRecord[],
  predicate: SeasonNamedSet,
  source: SeasonSource,
): SeasonSourceBucket => ({
  predicate,
  source,
  sourceLabel: SOURCE_LABEL[source] ?? 'Other',
  games,
});

const matchesNamedSet = (game: GameRecord, predicate: SeasonNamedSet, now: number): boolean => {
  switch (predicate.kind) {
    case 'last': {
      const days = Number(predicate.value);
      if (!Number.isFinite(days) || days <= 0) return false;
      const cutoff = now - days * 86_400_000;
      const ts = parseDate(game.date) ?? game.importedAt;
      return ts >= cutoff;
    }
    case 'event':
      return present(game.event) === predicate.value;
    case 'site':
      return present(game.site) === predicate.value;
    case 'opening':
      return present(game.eco) === predicate.value;
    default:
      return false;
  }
};

const parseDate = (date: string | undefined): number | null => {
  if (!date) return null;
  const cleaned = date.replace(/\?/g, '0');
  const parsed = Date.parse(cleaned);
  return Number.isNaN(parsed) ? null : parsed;
};

/** Human-readable description of the named set, for the picker and the empty state. */
export function describeNamedSet(predicate: SeasonNamedSet): string {
  switch (predicate.kind) {
    case 'last':
      return `Last ${predicate.value} days`;
    case 'event':
      return predicate.value;
    case 'site':
      return predicate.value;
    case 'opening':
      return `${predicate.value}`;
  }
}

/**
 * Build the URL for a named-set predicate — the canonical form the picker
 * uses and the season log records. Stable on reload and browser Back.
 */
export function namedSetUrl(predicate: SeasonNamedSet): string {
  const allowMixed = predicate.allowMixed ? '&mixed=1' : '';
  switch (predicate.kind) {
    case 'last':
      return `/season?set=${predicate.value}${allowMixed}`;
    case 'event':
      return `/season?event=${encodeURIComponent(predicate.value)}${allowMixed}`;
    case 'site':
      return `/season?site=${encodeURIComponent(predicate.value)}${allowMixed}`;
    case 'opening':
      return `/season?opening=${encodeURIComponent(predicate.value)}${allowMixed}`;
  }
}

/** A fact the picker reads from the games index: a unique event string. */
export const eventOptions = (games: readonly GameSummary[]): readonly string[] =>
  uniqueSorted(
    games.map((game) => present(game.event)).filter((value): value is string => Boolean(value)),
  );

/** A fact the picker reads from the games index: a unique site string. */
export const siteOptions = (games: readonly GameSummary[]): readonly string[] =>
  uniqueSorted(
    games.map((game) => present(game.site)).filter((value): value is string => Boolean(value)),
  );

/** A fact the picker reads from the games index: a unique ECO opening. */
export const openingOptions = (games: readonly GameSummary[]): readonly string[] =>
  uniqueSorted(
    games.map((game) => present(game.eco)).filter((value): value is string => Boolean(value)),
  );

const uniqueSorted = (values: readonly string[]): readonly string[] =>
  [...new Set(values)].sort((a, b) => a.localeCompare(b));
