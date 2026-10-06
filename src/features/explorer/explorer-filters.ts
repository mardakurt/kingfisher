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
