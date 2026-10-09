/**
 * The explorer's rating and year filters, as a source can apply them.
 *
 * A filter reaches a source only when the source declares it can apply it;
 * the rest are named, so every surface that prints a count can say which
 * filters it is *not* under. A reference pack keeps one count per move and
 * applies neither, and until 1.4.3 both the Explorer and the readiness panel
 * sent the filters anyway and printed the unfiltered counts as filtered.
 */

import type { DatabaseCapabilities, ExplorerFilters } from '@/database/types';
import { playerKey } from '@/persistence/schema/migrations';

export type ExplorerPlayerColor = 'w' | 'b' | 'either';

/**
 * The player box, as the source can apply it.
 *
 * Lichess by player wants the account name and a side; its explorer has no
 * "either". A collection matches the name the games spell, folded to the
 * same key the companion stores, and a side is optional. My games then
 * accepts that key as part of a name; a companion collection needs the
 * whole name.
 */
export function explorerPlayerQuery(
  sourceId: string | undefined,
  name: string,
  color: ExplorerPlayerColor,
): Pick<ExplorerFilters, 'player' | 'playerColor'> | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (sourceId === 'lichess-player') {
    return { player: trimmed, playerColor: color === 'b' ? 'b' : 'w' };
  }
  const key = playerKey(trimmed);
  if (!key) return null;
  return color === 'either' ? { player: key } : { player: key, playerColor: color };
}

export function explorerPlayerField(sourceId: string | undefined): {
  readonly label: string;
  readonly placeholder: string;
  readonly hint: string;
  readonly either: boolean;
} {
  if (sourceId === 'lichess-player') {
    return {
      label: 'Lichess player',
      placeholder: 'Exact Lichess username',
      hint: 'That account’s games, on the side chosen. Lichess has no combined colour.',
      either: false,
    };
  }
  if (sourceId === 'local-collection') {
    return {
      label: 'Player',
      placeholder: 'Part of a name',
      hint: 'Games whose name on the chosen side contains this. Case is ignored.',
      either: true,
    };
  }
  return {
    label: 'Player',
    placeholder: 'Full name, as in the games',
    hint: 'The name as the games spell it. Case is ignored; a surname alone does not match.',
    either: true,
  };
}

export interface ExplorerFilterPreferences {
  readonly explorerMinRating: number | null;
  readonly explorerSinceYear: number | null;
}

export interface ExplorerRatingClass {
  readonly min: number;
  readonly max?: number;
  readonly label: string;
}

/** Lichess classes are its native buckets; local sources accept exact bounds. */
export function explorerRatingClasses(sourceId: string): readonly ExplorerRatingClass[] {
  const bounds =
    sourceId === 'lichess-games'
      ? [400, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500]
      : [0, 1400, 1600, 1800, 2000, 2200, 2400, 2600];
  return bounds.map((min, index) => {
    const next = bounds[index + 1];
    return {
      min,
      ...(next === undefined ? {} : { max: next - (sourceId === 'local-collection' ? 0.5 : 1) }),
      label:
        next === undefined
          ? `${min}+`
          : min === 0
            ? `<${next}`
            : sourceId === 'local-collection'
              ? `${min}–<${next}`
              : `${min}–${next - 1}`,
    };
  });
}

/** A class replaces Min Elo for this source, without changing a saved preference. */
export function withRatingClass(
  filters: ExplorerFilters,
  ratingClass: ExplorerRatingClass | undefined,
): ExplorerFilters {
  if (!ratingClass) return filters;
  const { minRating: _min, maxRating: _max, ...rest } = filters;
  return {
    ...rest,
    minRating: ratingClass.min,
    ...(ratingClass.max === undefined ? {} : { maxRating: ratingClass.max }),
  };
}

export function ratingClassRule(sourceId: string): string {
  if (sourceId === 'lichess-games')
    return 'Lichess rating buckets; keep a separate speed population.';
  if (sourceId === 'local-collection')
    return 'Mean of the recorded player ratings; unrated games are excluded.';
  return 'Higher recorded player rating; unrated games are excluded.';
}

export function applicableExplorerFilters(
  prefs: ExplorerFilterPreferences,
  capabilities: Pick<DatabaseCapabilities, 'ratingFilter' | 'dateFilter'> | undefined,
): { readonly filters: ExplorerFilters; readonly applied: string[]; readonly ignored: string[] } {
  const rating = capabilities?.ratingFilter ?? false;
  const date = capabilities?.dateFilter ?? false;
  const applied: string[] = [];
  const ignored: string[] = [];
  if (prefs.explorerMinRating) {
    (rating ? applied : ignored).push(
      rating ? `rating ≥ ${prefs.explorerMinRating}` : `Min Elo ${prefs.explorerMinRating}`,
    );
  }
  if (prefs.explorerSinceYear) {
    (date ? applied : ignored).push(`since ${prefs.explorerSinceYear}`);
  }
  return {
    filters: {
      ...(rating && prefs.explorerMinRating ? { minRating: prefs.explorerMinRating } : {}),
      ...(date && prefs.explorerSinceYear ? { sinceYear: prefs.explorerSinceYear } : {}),
    },
    applied,
    ignored,
  };
}

/**
 * The filters one comparison column may be asked.
 *
 * The explorer's active source has already dropped what *it* cannot apply.
 * The column beside it is a different source. A 2200+ Lichess filter sent to
 * a starter pack comes back as the unfiltered aggregate, and the column must
 * say so rather than looking like the same cut of a different population.
 */
export function explorerFiltersForSource(
  filters: ExplorerFilters,
  capabilities:
    | Pick<DatabaseCapabilities, 'ratingFilter' | 'dateFilter' | 'playerFilter' | 'speedFilter'>
    | undefined,
): { readonly filters: ExplorerFilters; readonly ignored: readonly string[] } {
  const rating = capabilities?.ratingFilter ?? false;
  const date = capabilities?.dateFilter ?? false;
  const player = capabilities?.playerFilter ?? false;
  const speed = capabilities?.speedFilter ?? false;
  const ignored: string[] = [];
  const next: {
    minRating?: number;
    maxRating?: number;
    sinceYear?: number;
    untilYear?: number;
    player?: string;
    playerColor?: 'w' | 'b';
    speeds?: readonly string[];
  } = {};

  if (filters.minRating != null || filters.maxRating != null) {
    if (rating) {
      if (filters.minRating != null) next.minRating = filters.minRating;
      if (filters.maxRating != null) next.maxRating = filters.maxRating;
    } else {
      ignored.push(ratingPhrase(filters));
    }
  }
  if (filters.sinceYear != null || filters.untilYear != null) {
    if (date) {
      if (filters.sinceYear != null) next.sinceYear = filters.sinceYear;
      if (filters.untilYear != null) next.untilYear = filters.untilYear;
    } else {
      const parts: string[] = [];
      if (filters.sinceYear != null) parts.push(`since ${filters.sinceYear}`);
      if (filters.untilYear != null) parts.push(`until ${filters.untilYear}`);
      ignored.push(parts.join(' '));
    }
  }
  if (filters.player) {
    if (player) {
      next.player = filters.player;
      if (filters.playerColor) next.playerColor = filters.playerColor;
    } else {
      ignored.push(`player ${filters.player}`);
    }
  }
  if (filters.speeds && filters.speeds.length > 0) {
    if (speed) next.speeds = filters.speeds;
    else ignored.push(`speed ${filters.speeds.join(', ')}`);
  }
  return { filters: next, ignored };
}

function ratingPhrase(filters: ExplorerFilters): string {
  if (filters.minRating != null && filters.maxRating != null) {
    return `Elo ${filters.minRating}–${filters.maxRating}`;
  }
  if (filters.minRating != null) return `Min Elo ${filters.minRating}`;
  return `Elo up to ${filters.maxRating}`;
}
