/**
 * Selective import: keep only the games of a file that answer a question.
 *
 * "Both players 2200 and above", "Carlsen's games", "2015 to 2024" — the
 * questions a person importing a month of online games or a large download
 * asks, so the collection holds the games they meant rather than all of
 * them. Decided on a game's headers alone, which is all a filter on players,
 * ratings and dates needs, and the same rule the reference-pack builder uses
 * to reject games before their movetext is worth anything.
 *
 * Unknown is not a match. A game with no rating does not pass "2200 and
 * above", and one with no date does not pass a year range: the person asked
 * for games that meet a condition, and a game that cannot be shown to meet it
 * is not one of them. The summary says how many were left out.
 */

import { playerKey } from './schema/migrations';

export interface ImportFilter {
  /** Lowest rating to keep; a game without the rating does not pass. */
  readonly minRating?: number;
  /** Whether `minRating` applies to both players or to at least one. */
  readonly ratingOf?: 'both' | 'either';
  /** One person, by whole name, on either side. */
  readonly player?: string;
  readonly fromYear?: number;
  readonly toYear?: number;
}

/** What the filter reads of a game: the fields `normalizeGame` derives from the headers. */
export interface FilterableGame {
  readonly whiteKey: string;
  readonly blackKey: string;
  readonly whiteRating?: number;
  readonly blackRating?: number;
  readonly year?: number;
}

const positive = (value: number | undefined): value is number =>
  value !== undefined && Number.isFinite(value) && value > 0;

/** True when the filter asks anything at all. */
export function isActiveFilter(filter: ImportFilter | undefined): filter is ImportFilter {
  if (!filter) return false;
  return (
    positive(filter.minRating) ||
    Boolean(filter.player?.trim()) ||
    positive(filter.fromYear) ||
    positive(filter.toYear)
  );
}

/**
 * The keys a typed name can be stored under: as typed, and for a name in
 * natural order the comma forms a database writes ("Magnus Carlsen" →
 * "Carlsen, Magnus"; "Hou Yifan" → "Hou, Yifan" too). Whole names only, as
 * everywhere else a player is named: a surname alone would merge people.
 */
export function playerFilterKeys(name: string): ReadonlySet<string> {
  const trimmed = name.trim();
  const keys = new Set([playerKey(trimmed)]);
  if (!trimmed.includes(',')) {
    const words = trimmed.split(/\s+/);
    if (words.length >= 2) {
      keys.add(playerKey(`${words[words.length - 1]}, ${words.slice(0, -1).join(' ')}`));
      keys.add(playerKey(`${words[0]}, ${words.slice(1).join(' ')}`));
    }
  }
  keys.delete('');
  return keys;
}

/** A filter prepared once for a whole file. */
export function compileImportFilter(
  filter: ImportFilter | undefined,
): (game: FilterableGame) => boolean {
  if (!isActiveFilter(filter)) return () => true;
  const min = positive(filter.minRating) ? filter.minRating : null;
  const both = filter.ratingOf !== 'either';
  const keys = filter.player?.trim() ? playerFilterKeys(filter.player) : null;
  const from = positive(filter.fromYear) ? filter.fromYear : null;
  const to = positive(filter.toYear) ? filter.toYear : null;

  return (game) => {
    if (min !== null) {
      const white = positive(game.whiteRating) && game.whiteRating >= min;
      const black = positive(game.blackRating) && game.blackRating >= min;
      if (both ? !(white && black) : !(white || black)) return false;
    }
    if (keys && !keys.has(game.whiteKey) && !keys.has(game.blackKey)) return false;
    if (from !== null || to !== null) {
      if (!positive(game.year)) return false;
      if (from !== null && game.year < from) return false;
      if (to !== null && game.year > to) return false;
    }
    return true;
  };
}

/** "both players 2200+ · Carlsen, Magnus · 2015–2024", for a summary line. */
export function describeImportFilter(filter: ImportFilter | undefined): string {
  if (!isActiveFilter(filter)) return '';
  const parts: string[] = [];
  if (positive(filter.minRating)) {
    parts.push(
      `${filter.ratingOf === 'either' ? 'either player' : 'both players'} ${filter.minRating}+`,
    );
  }
  if (filter.player?.trim()) parts.push(filter.player.trim());
  const from = positive(filter.fromYear) ? filter.fromYear : null;
  const to = positive(filter.toYear) ? filter.toYear : null;
  if (from !== null && to !== null) parts.push(from === to ? `${from}` : `${from}–${to}`);
  else if (from !== null) parts.push(`${from} onwards`);
  else if (to !== null) parts.push(`up to ${to}`);
  return parts.join(' · ');
}
