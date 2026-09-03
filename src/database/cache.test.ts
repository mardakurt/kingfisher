import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { enforceExplorerCacheLimit, MAX_EXPLORER_CACHE_ENTRIES } from './cache';

describe('Explorer cache boundary', () => {
  it('keeps the newest 256 of 500 inactive positions without touching other caches', () => {
    const client = new QueryClient();
    client.setQueryData(['profile'], { aliases: [] });
    for (let index = 0; index < 500; index += 1) {
      client.setQueryData(['explorer', 'local', 'v1', `fen-${index}`, {}], { index });
    }

    expect(enforceExplorerCacheLimit(client)).toBe(500 - MAX_EXPLORER_CACHE_ENTRIES);
    const explorer = client
      .getQueryCache()
      .getAll()
      .filter((query) => query.queryKey[0] === 'explorer');
    expect(explorer).toHaveLength(MAX_EXPLORER_CACHE_ENTRIES);
    expect(client.getQueryData(['profile'])).toEqual({ aliases: [] });
    expect(client.getQueryData(['explorer', 'local', 'v1', 'fen-499', {}])).toEqual({
      index: 499,
    });
  });

  it('never evicts a request that has not settled yet', async () => {
    const client = new QueryClient();
    for (let index = 0; index < MAX_EXPLORER_CACHE_ENTRIES; index += 1) {
      client.setQueryData(['explorer', 'local', 'v1', `settled-${index}`, {}], { index });
    }

    // A prefetch for the move the player is about to make: in flight, no
    // observers, and no data yet. It is the newest thing in the cache and the
    // most likely to be needed next.
    const inFlight = ['explorer', 'local', 'v1', 'prefetched', {}];
    const prefetch = client.prefetchQuery({
      queryKey: inFlight,
      queryFn: () =>
        new Promise((resolve) => setTimeout(() => resolve({ index: 'prefetched' }), 5)),
    });

    expect(enforceExplorerCacheLimit(client)).toBe(1);
    await prefetch;
    expect(client.getQueryData(inFlight)).toEqual({ index: 'prefetched' });
    expect(client.getQueryData(['explorer', 'local', 'v1', 'settled-0', {}])).toBeUndefined();
  });
});
