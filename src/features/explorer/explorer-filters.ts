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
