import 'fake-indexeddb/auto';

import { describe, expect, it } from 'vitest';

import { openStreamingCacheDatabase, STREAMING_CACHE_DATABASE } from './streaming-cache-database';

/**
 * The streaming cache keeps one connection open for the life of the page.
 * Another context deleting or upgrading its database must not wait on it:
 * a profile reset hung on exactly that in WebKit (Phase 87).
 */
describe('the streaming cache database, when another context wants it', () => {
  it('lets a delete through without blocking, and reopens on the next call', async () => {
    const cache = await openStreamingCacheDatabase();
    expect(await cache.get('missing')).toBeNull();

    const outcome = await new Promise<string>((resolve) => {
      const request = indexedDB.deleteDatabase(STREAMING_CACHE_DATABASE);
      request.onsuccess = () => resolve('deleted');
      request.onerror = () => resolve('error');
      request.onblocked = () => resolve('blocked');
    });
    expect(outcome).toBe('deleted');

    // The cache still answers: it opened a fresh, empty database.
    expect(await cache.get('missing')).toBeNull();
  });
});
