/**
 * Streaming cache benchmark.
 *
 * Phase 30 (PART BF-BG): the brief asks for a deterministic
 * benchmark harness that measures the cache hierarchy
 * (memory -> IndexedDB -> network) without needing a real
 * network or a real Vercel preview.
 *
 * Run via:
 *
 *   npx vitest run --config vitest.bench.config.mts scripts/bench-streaming-cache.test.mts
 *
 * The output is logged on completion.
 *
 * The test environment provides the `@/` alias resolution
 * the production code expects, so the imports are
 * straight out of the application.
 */

import { performance } from 'node:perf_hooks';
import { createHash, randomBytes } from 'node:crypto';
import { describe, it } from 'vitest';

import { TieredStreamingCache } from '@/reference/tiered-streaming-cache';
import { InMemoryStreamingCacheStorage } from '@/persistence/indexeddb/streaming-cache-storage.memory';

const CHUNKS = 200;
const CHUNK_SIZE = 16384; // 16 KB
const MEMORY_BUDGET = 16 * 1024 * 1024;
const PERSISTENT_BUDGET = 64 * 1024 * 1024;
const CONCURRENCY = 4;

function generateChunks(count: number, size: number): Map<string, Uint8Array> {
  const chunks = new Map<string, Uint8Array>();
  const seed = Buffer.from('kingfisher-bench-streaming-cache', 'utf8');
  for (let i = 0; i < count; i += 1) {
    const bytes = Buffer.concat([seed, Buffer.from(String(i).padStart(8, '0'))]);
    const body = new Uint8Array(size);
    for (let offset = 0; offset < size; offset += 32) {
      const slice = randomBytes(Math.min(32, size - offset));
      body.set(slice, offset);
    }
    const merged = new Uint8Array(bytes.length + body.length);
    merged.set(bytes, 0);
    merged.set(body, bytes.length);
    const digest = createHash('sha256').update(Buffer.from(merged)).digest('hex');
    chunks.set(digest, merged);
  }
  return chunks;
}

function timeSamples(samples: readonly number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  return {
    medianMs: Number(median.toFixed(3)),
    p95Ms: Number(p95.toFixed(3)),
    meanMs: Number((sum / sorted.length).toFixed(3)),
    samples: sorted.length,
  };
}

function makeNetwork(chunks: Map<string, Uint8Array>, latencyMs: number) {
  const inflight = new Map<string, Promise<Uint8Array>>();
  return {
    async fetch(digest: string): Promise<Uint8Array> {
      const existing = inflight.get(digest);
      if (existing) return existing;
      const promise = (async () => {
        const bytes = chunks.get(digest);
        if (!bytes) throw new Error(`Unknown digest: ${digest}`);
        await new Promise((resolve) => setTimeout(resolve, latencyMs));
        return bytes;
      })();
      inflight.set(digest, promise);
      promise.finally(() => inflight.delete(digest));
      return promise;
    },
  };
}

async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const runners = new Array(limit).fill(null).map(async () => {
    while (queue.length > 0) {
      const next = queue.shift();
      if (next === undefined) return;
      await worker(next);
    }
  });
  await Promise.all(runners);
}

describe('streaming cache benchmark', () => {
  it('measures memory / persistent / network performance', async () => {
    const chunks = generateChunks(CHUNKS, CHUNK_SIZE);
    const network = makeNetwork(chunks, 5);
    const storage = new InMemoryStreamingCacheStorage();
    const cache = new TieredStreamingCache({
      packId: 'bench',
      packVersion: '1',
      memoryBudgetBytes: MEMORY_BUDGET,
      persistentBudgetBytes: PERSISTENT_BUDGET,
      persistent: storage,
    });

    const getWithNetwork = async (digest: string) => {
      const hit = await cache.get(digest);
      if (hit) return hit;
      const bytes = await network.fetch(digest);
      cache.put(digest, bytes);
      return bytes;
    };

    const digests = Array.from(chunks.keys());

    // Cold-then-warm pass.
    const warmStart = performance.now();
    await runWithConcurrency(digests, CONCURRENCY, async (digest) => {
      await getWithNetwork(digest);
    });
    const warmMs = performance.now() - warmStart;

    // Pure memory reads.
    const memoryHits: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const start = performance.now();
      for (const digest of digests) {
        const hit = await cache.get(digest);
        if (!hit) throw new Error(`Memory miss for ${digest}`);
      }
      memoryHits.push(performance.now() - start);
    }

    // Pure persistent reads (a fresh cache with no memory room).
    const persistentOnly = new TieredStreamingCache({
      packId: 'bench',
      packVersion: '1',
      memoryBudgetBytes: 0,
      persistentBudgetBytes: PERSISTENT_BUDGET,
      persistent: storage,
    });
    const persistentHits: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const start = performance.now();
      for (const digest of digests) {
        const hit = await persistentOnly.get(digest);
        if (!hit) throw new Error(`Persistent miss for ${digest}`);
      }
      persistentHits.push(performance.now() - start);
    }

    // Pure network reads.
    const freshNetwork = makeNetwork(chunks, 5);
    const networkMisses: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const start = performance.now();
      for (const digest of digests) {
        await freshNetwork.fetch(digest);
      }
      networkMisses.push(performance.now() - start);
    }

    // Concurrency sweep.
    const concurrencyResults: Record<string, ReturnType<typeof timeSamples>> = {};
    for (const c of [2, 4, 6, 8]) {
      const samples: number[] = [];
      for (let i = 0; i < 3; i += 1) {
        const network2 = makeNetwork(chunks, 5);
        const storage2 = new InMemoryStreamingCacheStorage();
        const cache2 = new TieredStreamingCache({
          packId: 'bench',
          packVersion: '1',
          memoryBudgetBytes: MEMORY_BUDGET,
          persistentBudgetBytes: PERSISTENT_BUDGET,
          persistent: storage2,
        });
        const start = performance.now();
        await runWithConcurrency(digests, c, async (digest) => {
          const hit = await cache2.get(digest);
          if (hit) return;
          const bytes = await network2.fetch(digest);
          cache2.put(digest, bytes);
        });
        samples.push(performance.now() - start);
      }
      concurrencyResults[`c${c}`] = timeSamples(samples);
    }

    const result = {
      config: {
        chunks: CHUNKS,
        chunkSize: CHUNK_SIZE,
        memoryBudget: MEMORY_BUDGET,
        persistentBudget: PERSISTENT_BUDGET,
        concurrency: CONCURRENCY,
      },
      coldWarmMs: Number(warmMs.toFixed(3)),
      memoryHits: timeSamples(memoryHits),
      persistentHits: timeSamples(persistentHits),
      networkMisses: timeSamples(networkMisses),
      concurrency: concurrencyResults,
      persistentBytes: await storage.totalBytes(),
      persistentCount: await storage.count(),
    };

    console.log('STREAMING-CACHE-BENCH', JSON.stringify(result, null, 2));
  }, 60_000);
});
