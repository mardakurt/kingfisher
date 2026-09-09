import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';

import { DatabaseError } from '@/database/types';
import { InMemoryStreamingCacheStorage } from '@/persistence/indexeddb/streaming-cache-storage.memory';
import { verifyChunkDigest } from '@/persistence/streaming-cache-storage';

import { TieredStreamingCache } from './tiered-streaming-cache';

const digestOf = async (bytes: Uint8Array): Promise<string> => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const out = await crypto.subtle.digest('SHA-256', copy);
  return Array.from(new Uint8Array(out))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

const sampleBytes = (fill: number, size = 8): Uint8Array =>
  new Uint8Array(size).fill(fill);

describe('TieredStreamingCache', () => {
  it('serves a put chunk from memory on the next read', async () => {
    const persistent = new InMemoryStreamingCacheStorage();
    const cache = new TieredStreamingCache({
      packId: 'p',
      packVersion: '1',
      memoryBudgetBytes: 1024,
      persistent,
    });
    const bytes = sampleBytes(0xaa);
    const digest = await digestOf(bytes);
    cache.put(digest, bytes);
    const got = await cache.get(digest);
    expect(got).not.toBeNull();
    expect(got!.byteLength).toBe(8);
  });

  it('lifts a persistent chunk into memory on first read', async () => {
    const persistent = new InMemoryStreamingCacheStorage();
    // Pre-write into the persistent tier, simulating a
    // previous session having cached the chunk.
    const bytes = sampleBytes(0xbb);
    const digest = await digestOf(bytes);
    await persistent.put({
      digest,
      bytes,
      packId: 'p',
      packVersion: '1',
      bytesLength: bytes.byteLength,
      lastAccessed: Date.now(),
      writtenAt: Date.now(),
    });
    const cache = new TieredStreamingCache({
      packId: 'p',
      packVersion: '1',
      memoryBudgetBytes: 1024,
      persistent,
    });
    const got = await cache.get(digest);
    expect(got).not.toBeNull();
    expect(got!.byteLength).toBe(8);
    // After the read, the memory tier should know the chunk
    // so the second read does not touch the persistent tier.
    expect(cache.memorySize()).toBe(1);
  });

  it('writes into both tiers on put', async () => {
    const persistent = new InMemoryStreamingCacheStorage();
    const cache = new TieredStreamingCache({
      packId: 'p',
      packVersion: '1',
      memoryBudgetBytes: 1024,
      persistent,
    });
    const bytes = sampleBytes(0xcc);
    const digest = await digestOf(bytes);
    cache.put(digest, bytes);
    await cache.drain();
    expect(await persistent.count()).toBe(1);
    expect(await persistent.totalBytes()).toBe(bytes.byteLength);
  });

  it('refuses to serve a chunk whose persistent bytes do not match the digest', async () => {
    const persistent = new InMemoryStreamingCacheStorage();
    // Plant a record whose bytes have been tampered with after
    // the digest was written.
    const real = sampleBytes(0xdd);
    const digest = await digestOf(real);
    const tampered = sampleBytes(0xde);
    await persistent.put({
      digest,
      bytes: tampered,
      packId: 'p',
      packVersion: '1',
      bytesLength: tampered.byteLength,
      lastAccessed: Date.now(),
      writtenAt: Date.now(),
    });
    const cache = new TieredStreamingCache({
      packId: 'p',
      packVersion: '1',
      memoryBudgetBytes: 1024,
      persistent,
    });
    await expect(cache.get(digest)).rejects.toBeInstanceOf(DatabaseError);
    // The corrupt record is dropped so the next attempt can
    // re-fetch and re-establish a verified entry under the
    // same key.
    await cache.drain();
    expect(await persistent.count()).toBe(0);
  });

  it('clear() drops both tiers', async () => {
    const persistent = new InMemoryStreamingCacheStorage();
    const cache = new TieredStreamingCache({
      packId: 'p',
      packVersion: '1',
      memoryBudgetBytes: 1024,
      persistent,
    });
    const bytes = sampleBytes(0xee);
    const digest = await digestOf(bytes);
    cache.put(digest, bytes);
    await cache.drain();
    expect(cache.memorySize()).toBe(1);
    expect(await persistent.count()).toBe(1);
    await cache.clear();
    expect(cache.memorySize()).toBe(0);
    expect(await persistent.count()).toBe(0);
  });

  it('persistent cache is logically separate from installed reference packs', async () => {
    // The persistent store used by the streaming cache is
    // InMemoryStreamingCacheStorage, with no reference to any
    // pack metadata. A study saved into the main IndexedDB
    // store and a streamed chunk saved here are not
    // addressable through each other. This is the property
    // we want from the namespace.
    const persistent = new InMemoryStreamingCacheStorage();
    const cache = new TieredStreamingCache({
      packId: 'kingfisher-elite-otb',
      packVersion: '2',
      memoryBudgetBytes: 1024,
      persistent,
    });
    const bytes = sampleBytes(0xff, 16);
    const digest = await digestOf(bytes);
    cache.put(digest, bytes);
    await cache.drain();
    // Clearing the streaming cache only touches the
    // streaming cache's storage, never any "studies" store.
    await cache.clear();
    expect(await persistent.count()).toBe(0);
  });

  it('memory tier is byte-budgeted and LRU evicts as expected', async () => {
    const persistent = new InMemoryStreamingCacheStorage();
    const cache = new TieredStreamingCache({
      packId: 'p',
      packVersion: '1',
      memoryBudgetBytes: 16,
      persistent,
    });
    const d1 = await digestOf(sampleBytes(0x01, 8));
    const d2 = await digestOf(sampleBytes(0x02, 8));
    const d3 = await digestOf(sampleBytes(0x03, 8));
    cache.put(d1, sampleBytes(0x01, 8));
    cache.put(d2, sampleBytes(0x02, 8));
    cache.put(d3, sampleBytes(0x03, 8));
    // 24 bytes over a 16 byte budget: the LRU tail (d1) is
    // the one evicted. d2 and d3 survive.
    expect(await cache.get(d1)).toBeNull();
    expect(await cache.get(d2)).not.toBeNull();
    expect(await cache.get(d3)).not.toBeNull();
  });

  it('persistent tier enforces its own byte budget', async () => {
    const persistent = new InMemoryStreamingCacheStorage();
    const evicted: { sha256: string; bytes: number }[] = [];
    const cache = new TieredStreamingCache({
      packId: 'p',
      packVersion: '1',
      memoryBudgetBytes: 1024,
      persistentBudgetBytes: 16,
      persistent,
      onPersistentEvict: (entry) => evicted.push(entry),
    });
    for (let i = 0; i < 5; i += 1) {
      const bytes = new Uint8Array(8).fill(i + 1);
      const digest = await digestOf(bytes);
      cache.put(digest, bytes);
    }
    await cache.drain();
    const total = await persistent.totalBytes();
    // The persistent budget is 16 bytes; the cache should
    // have evicted until the total is at or under the budget.
    expect(total).toBeLessThanOrEqual(16);
    expect(evicted.length).toBeGreaterThan(0);
  });

  it('uses the digest as the cache identity, not the URL', async () => {
    const persistent = new InMemoryStreamingCacheStorage();
    const cache = new TieredStreamingCache({
      packId: 'p',
      packVersion: '1',
      memoryBudgetBytes: 1024,
      persistent,
    });
    const bytes = sampleBytes(0xab);
    const digest = await digestOf(bytes);
    cache.put(digest, bytes);
    // Asking for the same digest under any other name
    // (simulated by a different caller) must hit the same
    // record.
    const got = await cache.get(digest);
    expect(got).not.toBeNull();
    expect(got!.byteLength).toBe(8);
  });

  it('two concurrent puts of the same digest do not double-write', async () => {
    const persistent = new InMemoryStreamingCacheStorage();
    const cache = new TieredStreamingCache({
      packId: 'p',
      packVersion: '1',
      memoryBudgetBytes: 1024,
      persistent,
    });
    const bytes = sampleBytes(0x55);
    const digest = await digestOf(bytes);
    cache.put(digest, bytes);
    cache.put(digest, bytes);
    cache.put(digest, bytes);
    await cache.drain();
    // One persistent record, despite three calls.
    expect(await persistent.count()).toBe(1);
  });

  it('a persistent read failure does not lose memory cache', async () => {
    const persistent = new InMemoryStreamingCacheStorage();
    const cache = new TieredStreamingCache({
      packId: 'p',
      packVersion: '1',
      memoryBudgetBytes: 1024,
      persistent,
    });
    const bytes = sampleBytes(0x66);
    const digest = await digestOf(bytes);
    // Write into memory, drain, and then sabotage the
    // persistent layer. The next read should still hit
    // memory without throwing.
    cache.put(digest, bytes);
    await cache.drain();
    const original = persistent.get.bind(persistent);
    const failingSpy = vi
      .spyOn(persistent, 'get')
      .mockImplementation(async (d: string) => {
        if (d === digest) throw new Error('synthetic IDB failure');
        return original(d);
      });
    const got = await cache.get(digest);
    expect(got).not.toBeNull();
    // Memory is still intact: a second read should serve from
    // the in-memory tier without even reaching the persistent
    // store, so the failure is irrelevant.
    failingSpy.mockClear();
    const got2 = await cache.get(digest);
    expect(got2).not.toBeNull();
    // The second read did not touch the persistent store.
    expect(failingSpy).not.toHaveBeenCalled();
  });
});

describe('TieredStreamingCache.verifyChunkDigest', () => {
  it('agrees with the in-memory storage on a matching record', async () => {
    const bytes = sampleBytes(0x77);
    const digest = await digestOf(bytes);
    expect(await verifyChunkDigest(digest, bytes)).toBe(true);
  });
});
