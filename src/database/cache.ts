import type { QueryClient } from '@tanstack/react-query';

export const MAX_EXPLORER_CACHE_ENTRIES = 256;

/**
 * Bound only inactive Explorer history, oldest first.
 *
 * The current position and any mounted comparison stay untouched. 256 entries
 * retains several long games of instant back-navigation while a 500-position
 * research session cannot grow the cache without limit.
 *
 * "Oldest" has to mean *settled* oldest. A query that has just been created —
 * a prefetch for a move the player has not made yet, or a request still in
 * flight — carries `dataUpdatedAt: 0` and has no observers, so a naive sort by
 * timestamp ranks the newest entry in the cache as the oldest thing in it and
 * evicts the very request that was about to be useful. Once the cache reached
 * its ceiling that would silently disable prefetching for the rest of the
 * session, and nothing on screen would look wrong.
 */
export function enforceExplorerCacheLimit(
  client: QueryClient,
  maximum = MAX_EXPLORER_CACHE_ENTRIES,
): number {
  const explorer = client
    .getQueryCache()
    .getAll()
    .filter((query) => query.queryKey[0] === 'explorer');
  let excess = explorer.length - maximum;
  if (excess <= 0) return 0;
  const evictable = explorer
    .filter((query) => query.getObserversCount() === 0)
    .filter((query) => query.state.fetchStatus === 'idle')
    .map((query) => ({
      query,
      settledAt: Math.max(query.state.dataUpdatedAt, query.state.errorUpdatedAt),
    }))
    .filter((entry) => entry.settledAt > 0)
    .sort((a, b) => a.settledAt - b.settledAt);
  let removed = 0;
  for (const entry of evictable) {
    if (excess <= 0) break;
    client.getQueryCache().remove(entry.query);
    excess -= 1;
    removed += 1;
  }
  return removed;
}
