/**
 * What a header filter means, stated once (Phase 86).
 *
 * The local repository filters "My games" with these, and the query model
 * (`src/database/query/`) evaluates header predicates with them: a query the
 * planner pushes down to the repository and the same query evaluated in full
 * therefore cannot disagree about a game, which is what lets the executor be
 * checked against an exhaustive oracle at all.
 */

import { classifyTimeControl } from '@/search/time-control';

import { playerKey } from './schema/migrations';
import type { GameSearchQuery, GameSummary } from './types';

export function matchesGameSearch(game: GameSummary, query: GameSearchQuery): boolean {
  const text = query.text?.trim().toLowerCase();
  if (text) {
    const haystack = [
      game.white,
      game.black,
      game.event,
      game.site,
      game.opening,
      game.variation,
      game.eco,
      // What Kingfisher computed, as well as what the file declared. A
      // collection is normally a mix of tagged and untagged imports, and a
      // free-text search that saw only the tags would miss half of it.
      game.classification?.name,
      game.classification?.variation,
      game.classification?.eco,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(text)) return false;
  }
  const player = playerKey(query.player);
  if (player) {
    // Whole-name equality, never a substring: `text` searches names loosely,
    // `player` names one person. Merging two people who share a surname is a
    // worse failure than showing nothing for a half-typed name.
    const white = game.whiteKey === player;
    const black = game.blackKey === player;
    if (
      query.playerColor === 'w' ? !white : query.playerColor === 'b' ? !black : !white && !black
    ) {
      return false;
    }
  }
  if (query.result && game.result !== query.result) return false;
  if (query.fromYear && (!game.year || game.year < query.fromYear)) return false;
  if (query.toYear && (!game.year || game.year > query.toYear)) return false;
  if (!matchesRating(game, query)) return false;
  const event = query.event?.trim().toLowerCase();
  if (event && !(game.event ?? '').toLowerCase().includes(event)) return false;
  const site = query.site?.trim().toLowerCase();
  if (site && !(game.site ?? '').toLowerCase().includes(site)) return false;
  if ((query.fromDate || query.toDate) && !matchesDateRange(game, query)) return false;
  if (query.timeClass && classifyTimeControl(game.timeControl) !== query.timeClass) return false;
  if (query.opening) {
    const needle = query.opening.toLowerCase();
    const names = [game.opening, game.classification?.name, game.classification?.variation].filter(
      (value): value is string => Boolean(value),
    );
    if (!names.some((name) => name.toLowerCase().includes(needle))) return false;
  }
  if (query.eco) {
    const needle = query.eco.toLowerCase();
    const codes = [game.eco, game.classification?.eco].filter((value): value is string =>
      Boolean(value),
    );
    if (!codes.some((code) => code.toLowerCase().startsWith(needle))) return false;
  }
  return true;
}

/**
 * The rating band. `either` is what `minRating` has always meant — at least
 * one player's known rating is inside the band — so a query from before the
 * band existed answers exactly as it did. `both` needs both ratings known.
 */
export function matchesRating(game: GameSummary, query: GameSearchQuery): boolean {
  if (!query.minRating && !query.maxRating) return true;
  const min = query.minRating ?? 0;
  const max = query.maxRating ?? Number.POSITIVE_INFINITY;
  const inside = (rating: number | undefined) =>
    rating !== undefined && rating >= min && rating <= max;
  if (query.ratingScope === 'both') return inside(game.whiteRating) && inside(game.blackRating);
  return inside(game.whiteRating) || inside(game.blackRating);
}

/**
 * A full date is compared as a date. A PGN date with unknown month or day
 * (`2024.??.??`) — or a game that has only a year — is compared by its year,
 * which counts when it falls between the range's years. A game with no date
 * at all is never assumed to be inside a range.
 */
export function matchesDateRange(game: GameSummary, query: GameSearchQuery): boolean {
  const full = /^(\d{4})[.-](\d{2})[.-](\d{2})$/.exec(game.date ?? '');
  if (full) {
    const iso = `${full[1]}-${full[2]}-${full[3]}`;
    if (query.fromDate && iso < query.fromDate) return false;
    if (query.toDate && iso > query.toDate) return false;
    return true;
  }
  const year = game.year ?? Number(/^(\d{4})/.exec(game.date ?? '')?.[1] ?? NaN);
  if (!Number.isFinite(year)) return false;
  if (query.fromDate && year < Number(query.fromDate.slice(0, 4))) return false;
  if (query.toDate && year > Number(query.toDate.slice(0, 4))) return false;
  return true;
}
