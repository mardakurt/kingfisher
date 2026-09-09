import { describe, expect, it, vi } from 'vitest';

import { StreamingCache } from './streaming-cache';

function chunk(byte: number, size = 16): Uint8Array {
  return new Uint8Array(size).fill(byte);
}

describe('StreamingCache', () => {
  it('returns a chunk that was just put', () => {
    const cache = new StreamingCache({
      packId: 'kingfisher-elite-otb',
      packVersion: '2',
      budgetBytes: 1024,
    });
    cache.put('a'.repeat(64), chunk(0xaa));
    expect(cache.get('a'.repeat(64))?.byteLength).toBe(16);
  });

  it('uses the SHA-256 as the cache key, not the URL', () => {
    const cache = new StreamingCache({ packId: 'p', packVersion: '1', budgetBytes: 1024 });
    const sha = 'b'.repeat(64);
    cache.put(sha, chunk(0xbb));
    // The same digest under any other name should hit the same slot.
    expect(cache.get(sha)).not.toBeNull();
    // A different digest is a miss, by construction.
    expect(cache.get('c'.repeat(64))).toBeNull();
  });

  it('evicts the least-recently-used chunk when the budget is exceeded', () => {
    const onEvict = vi.fn();
    const cache = new StreamingCache({
      packId: 'p',
      packVersion: '1',
      budgetBytes: 32,
      onEvict,
    });
    cache.put('1'.repeat(64), chunk(0x01, 16));
    cache.put('2'.repeat(64), chunk(0x02, 16));
    expect(cache.size()).toBe(2);
    cache.put('3'.repeat(64), chunk(0x03, 16));
    // The first put is the oldest, so it should be the one evicted.
    expect(cache.get('1'.repeat(64))).toBeNull();
    expect(cache.get('2'.repeat(64))).not.toBeNull();
    expect(cache.get('3'.repeat(64))).not.toBeNull();
    expect(onEvict).toHaveBeenCalled();
  });

  it('does not evict a chunk that is touched between puts', () => {
    const cache = new StreamingCache({ packId: 'p', packVersion: '1', budgetBytes: 32 });
    cache.put('1'.repeat(64), chunk(0x01, 16));
    cache.put('2'.repeat(64), chunk(0x02, 16));
    // Touch the first chunk so it becomes the most-recently-used.
    cache.get('1'.repeat(64));
    cache.put('3'.repeat(64), chunk(0x03, 16));
    expect(cache.get('1'.repeat(64))).not.toBeNull();
    expect(cache.get('2'.repeat(64))).toBeNull();
  });

  it('reports bytes and chunk count for the catalog UI', () => {
    const cache = new StreamingCache({ packId: 'p', packVersion: '1', budgetBytes: 1024 });
    cache.put('1'.repeat(64), chunk(0x01, 8));
    cache.put('2'.repeat(64), chunk(0x02, 12));
    expect(cache.size()).toBe(2);
    expect(cache.bytes()).toBe(20);
  });

  it('clear() drops everything', () => {
    const cache = new StreamingCache({ packId: 'p', packVersion: '1', budgetBytes: 1024 });
    cache.put('1'.repeat(64), chunk(0x01));
    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.bytes()).toBe(0);
  });
});
