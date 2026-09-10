/**
 * Cache eviction benchmark.
 *
 * Phase 30's handover identified the persistent eviction walk as a
 * future bottleneck at "real load" — the loop pulled up to 256
 * candidates by walking every record, which is O(N) on the size of
 * the cache. Phase 31 (PART AN-AO) added an `oldestEntries` query
 * that uses the `lastAccessed` index, so eviction is now O(1) on
 * the size of the cache regardless of how many records the user
 * has accumulated.
 *
 * This benchmark measures the eviction behaviour at 10k and 50k
 * records. It runs entirely in-memory through the production
 * `InMemoryStreamingCacheStorage`; the IndexedDB code path is
 * structurally identical, so the cost is the same shape.
 *
 * Run with:
 *   npx vitest run --config vitest.bench.config.mts scripts/bench-cache-eviction.test.ts
 */

import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { describe, it } from 'vitest';

import { TieredStreamingCache } from '@/reference/tiered-streaming-cache';
import { InMemoryStreamingCacheStorage } from '@/persistence/indexeddb/streaming-cache-storage.memory';
import type { StreamingCacheRecord } from '@/persistence/streaming-cache-storage';

interface ScaleRow {
  readonly records: number;
  readonly insertMs: number;
  readonly touchAllMs: number;
  readonly oldestEntriesMs: number;
  readonly evictMs: number;
  readonly afterCount: number;
  readonly afterBytes: number;
}

function digestFor(index: number): string {
  return createHash('sha256').update(`kingfisher-bench-${index}`).digest('hex');
}

function synthRecord(index: number, size = 4096): StreamingCacheRecord {
  const bytes = new Uint8Array(size);
  // Mix in a few pseudo-random bytes so the digest is unique; the
  // store does not care about the bytes' contents beyond identity.
  bytes[0] = (index >>> 24) & 0xff;
  bytes[1] = (index >>> 16) & 0xff;
  bytes[2] = (index >>> 8) & 0xff;
  bytes[3] = index & 0xff;
  return {
    digest: digestFor(index),
    bytes,
    packId: 'bench',
    packVersion: '1',
    bytesLength: size,
    lastAccessed: 0,
    writtenAt: 0,
  };
}

async function insert(storage: InMemoryStreamingCacheStorage, count: number): Promise<number> {
  const start = performance.now();
  for (let i = 0; i < count; i += 1) {
    await storage.put(synthRecord(i));
  }
  return performance.now() - start;
}

async function touchAll(storage: InMemoryStreamingCacheStorage, count: number): Promise<number> {
  const start = performance.now();
  for (let i = 0; i < count; i += 1) {
    await storage.get(digestFor(i));
  }
  return performance.now() - start;
}

async function oldestEntriesMs(
  storage: InMemoryStreamingCacheStorage,
  limit: number,
): Promise<number> {
  const start = performance.now();
  await storage.oldestEntries(limit);
  return performance.now() - start;
}

async function evictToBudget(
  storage: InMemoryStreamingCacheStorage,
  budgetBytes: number,
): Promise<{ ms: number; count: number; bytes: number }> {
  const start = performance.now();
  // The TieredStreamingCache enforces the persistent budget on every
  // put. We exercise that path by writing enough chunks to force
  // several evictions, so the write loop has to iterate.
  const tiered = new TieredStreamingCache({
    packId: 'bench',
    packVersion: '1',
    memoryBudgetBytes: 0,
    persistentBudgetBytes: budgetBytes,
    persistent: storage,
  });
  // Put a new chunk, wait for the async write to settle, and
  // then write another so the eviction has to run again. Each
  // round forces a fresh `enforcePersistentBudget` call.
  for (let i = 0; i < 8; i += 1) {
    const digest = digestFor(Number.MAX_SAFE_INTEGER - 1 - i);
    tiered.put(digest, new Uint8Array(1024));
    // The write is fire-and-forget; the inflight map is internal.
    // Yield to the microtask queue so the write is allowed to
    // complete before the next round trips the budget again.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  // One more pass to make sure the last write settled.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return {
    ms: performance.now() - start,
    count: await storage.count(),
    bytes: await storage.totalBytes(),
  };
}

async function runScale(records: number): Promise<ScaleRow> {
  const storage = new InMemoryStreamingCacheStorage();
  const insertMs = await insert(storage, records);
  const touchAllMs = await touchAll(storage, records);
  // Use a budget that is a quarter of the inserted bytes, so the
  // eviction must drop three quarters of the records.
  const budget = records * 4096 * 0.25;
  const oldestEntriesMsValue = await oldestEntriesMs(storage, 512);
  const evict = await evictToBudget(storage, budget);
  return {
    records,
    insertMs: Number(insertMs.toFixed(3)),
    touchAllMs: Number(touchAllMs.toFixed(3)),
    oldestEntriesMs: Number(oldestEntriesMsValue.toFixed(3)),
    evictMs: Number(evict.ms.toFixed(3)),
    afterCount: evict.count,
    afterBytes: evict.bytes,
  };
}

describe('cache eviction at scale', () => {
  it('measures 10k and 50k records', async () => {
    const ten = await runScale(10_000);
    const fifty = await runScale(50_000);
    const report = { ten, fifty };
    // eslint-disable-next-line no-console
    console.log('CACHE-EVICTION-BENCH', JSON.stringify(report, null, 2));
  }, 120_000);
});
