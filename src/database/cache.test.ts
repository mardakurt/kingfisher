import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { enforceExplorerCacheLimit, MAX_EXPLORER_CACHE_ENTRIES } from './cache';

/*
 * The cache identity test for the data intelligence work. A v2 pack answer
 * must not be served from a v1 cache entry, and a Career query must not be
 * answered from a Recent query's entry. The query keys are the contract:
 * they must include source version, period, side, and player identity, in
 * the exact shape that the hooks actually produce.
 */
describe('Explorer cache identity', () => {
  it('treats the same fen under two pack versions as two separate entries', () => {
    const client = new QueryClient();
    client.setQueryData(['explorer', 'elite', 'kingfisher-elite-otb@v1', 'fen-A', {}], {
      source: 'v1',
    });
    client.setQueryData(['explorer', 'elite', 'kingfisher-elite-otb@v2', 'fen-A', {}], {
      source: 'v2',
    });

    expect(
      client.getQueryData(['explorer', 'elite', 'kingfisher-elite-otb@v1', 'fen-A', {}]),
    ).toEqual({
      source: 'v1',
    });
    expect(
      client.getQueryData(['explorer', 'elite', 'kingfisher-elite-otb@v2', 'fen-A', {}]),
    ).toEqual({
      source: 'v2',
    });
    // A collision (same key for both versions) would have overwritten; the
    // assertions prove the keys are distinct.
    expect(
      client.getQueryData(['explorer', 'elite', 'kingfisher-elite-otb@v1', 'fen-A', {}]),
    ).not.toEqual(
      client.getQueryData(['explorer', 'elite', 'kingfisher-elite-otb@v2', 'fen-A', {}]),
    );
  });

  it('isolates Career from Recent on the same player identity', () => {
    const client = new QueryClient();
    const keys = {
      career: ['player-aggregate', 'carlsen', ['carlsen,magnus'], 'all', undefined],
      recent: ['player-aggregate', 'carlsen', ['carlsen,magnus'], 'last-12m', 2025],
    };
    client.setQueryData(keys.career, { wins: 100, draws: 30, losses: 50 });
    client.setQueryData(keys.recent, { wins: 5, draws: 1, losses: 2 });

    expect(client.getQueryData(keys.career)).toEqual({ wins: 100, draws: 30, losses: 50 });
    expect(client.getQueryData(keys.recent)).toEqual({ wins: 5, draws: 1, losses: 2 });
    expect(client.getQueryData(keys.career)).not.toEqual(client.getQueryData(keys.recent));
  });

  it('keeps Rapid and Blitz in separate cache entries', () => {
    const client = new QueryClient();
    const rapid = [
      'explorer',
      'high-rated',
      'kingfisher-high-rated-online@v1',
      'fen-R',
      {
        speeds: ['rapid'],
      },
    ];
    const blitz = [
      'explorer',
      'high-rated',
      'kingfisher-high-rated-online@v1',
      'fen-R',
      {
        speeds: ['blitz'],
      },
    ];
    client.setQueryData(rapid, { share: 0.42 });
    client.setQueryData(blitz, { share: 0.58 });

    expect(client.getQueryData(rapid)).toEqual({ share: 0.42 });
    expect(client.getQueryData(blitz)).toEqual({ share: 0.58 });
    expect(client.getQueryData(rapid)).not.toEqual(client.getQueryData(blitz));
  });

  it('keeps player A and player B in separate cache entries at the same fen', () => {
    const client = new QueryClient();
    const carlsen = ['explorer', 'player', 'lichess-player', 'carlsen', 'fen-P', {}];
    const firo = ['explorer', 'player', 'lichess-player', 'firouzja', 'fen-P', {}];
    client.setQueryData(carlsen, { name: 'Carlsen' });
    client.setQueryData(firo, { name: 'Firouzja' });

    expect(client.getQueryData(carlsen)).toEqual({ name: 'Carlsen' });
    expect(client.getQueryData(firo)).toEqual({ name: 'Firouzja' });
  });
});

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
