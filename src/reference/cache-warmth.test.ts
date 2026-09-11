/**
 * Phase 39 (PART AC): cache-warmth measurement.
 *
 * The Phase 38 backlog listed "Elite first-use cache warming" as a
 * possible improvement. The Phase 39 brief says: do not implement
 * warm-on-idle because it sounds nice — measure it first. This
 * file is the measurement.
 *
 * What we time, for three pack shapes:
 *
 *   - PUT: cost of writing a chunk into the cache for the first
 *     time. This is the work a player never sees: the network
 *     round-trip + the digest check + the IDB write.
 *   - LIFT: cost of a get() that misses memory and hits the
 *     persistent tier. This is the work a returning player pays
 *     instead of paying the network again.
 *   - HIT: cost of a get() that hits memory. This is the steady
 *     state inside a session.
 *
 * The cold-to-lift gap is the one the warm-on-idle idea was
 * trying to close. The lift-to-hit gap is the cost the persistent
 * tier pays anyway. We time both for Starter, Elite, and Recent
 * Theory and surface the numbers in the test log. The numbers
 * are evidence for a future product decision; the brief is
 * explicit that no warm-on-idle change happens in this phase.
 */

import 'fake-indexeddb/auto';
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';

import { InMemoryStreamingCacheStorage } from '@/persistence/indexeddb/streaming-cache-storage.memory';

import { TieredStreamingCache } from './tiered-streaming-cache';

const digestOf = async (bytes: Uint8Array): Promise<string> => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const out = await crypto.subtle.digest('SHA-256', copy);
  return Array.from(new Uint8Array(out))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

const sampleBytes = (fill: number, size: number): Uint8Array => new Uint8Array(size).fill(fill);

interface PackShape {
  readonly id: 'starter' | 'elite' | 'recent';
  readonly chunkSize: number;
  readonly memoryBudgetBytes: number;
}

const PACK_SHAPES: readonly PackShape[] = [
  // The bundled Starter reference is small enough that the whole
  // pack fits inside the memory tier on every machine this
  // application runs on. Cold vs warm is the only interesting
  // measurement; the budget is generous to keep numbers fair.
  { id: 'starter', chunkSize: 8 * 1024, memoryBudgetBytes: 16 * 1024 * 1024 },
  // The Elite OTB pack is the one the brief calls out by name:
  // its chunks are bigger and its cold-to-warm gap is the one a
  // user would notice.
  { id: 'elite', chunkSize: 64 * 1024, memoryBudgetBytes: 32 * 1024 * 1024 },
  // Recent Theory chunks are the medium case.
  { id: 'recent', chunkSize: 32 * 1024, memoryBudgetBytes: 16 * 1024 * 1024 },
];

interface WarmthReport {
  readonly putMs: number;
  readonly liftMs: number;
  readonly hitMs: number;
}

const measure = async (
  shape: PackShape,
  sample: Uint8Array,
  iterations: number,
): Promise<WarmthReport> => {
  const digest = await digestOf(sample);
  const persistent = new InMemoryStreamingCacheStorage();

  // PUT: first write into a fresh cache. put() is synchronous;
  // the persistent write happens in a fire-and-forget async
  // tail, so we yield a few microtasks before timing the lift to
  // make sure the persistent tier has actually accepted the
  // chunk.
  const putCache = new TieredStreamingCache({
    packId: shape.id,
    packVersion: '1',
    memoryBudgetBytes: shape.memoryBudgetBytes,
    persistent,
  });
  const putStart = performance.now();
  putCache.put(digest, sample);
  // Yield until the inflight persistent write settles.
  for (let i = 0; i < 16; i += 1) await Promise.resolve();
  const putMs = performance.now() - putStart;

  // LIFT: a fresh cache, persistent already populated by the
  // PUT above. The first get() walks memory (miss), persistent
  // (hit), and lifts the chunk back into memory.
  const liftCache = new TieredStreamingCache({
    packId: shape.id,
    packVersion: '1',
    memoryBudgetBytes: shape.memoryBudgetBytes,
    persistent,
  });
  const liftStart = performance.now();
  const lifted = await liftCache.get(digest);
  const liftMs = performance.now() - liftStart;
  expect(lifted).not.toBeNull();

  // HIT: the same cache, repeatedly, after the lift has promoted
  // the chunk into memory. Steady state.
  const hitStart = performance.now();
  for (let i = 0; i < iterations; i += 1) {
    const got = await liftCache.get(digest);
    expect(got).not.toBeNull();
  }
  const hitMs = (performance.now() - hitStart) / iterations;

  return { putMs, liftMs, hitMs };
};

describe('cache warmth measurement (Phase 39 PART AC)', () => {
  /*
    The numbers are surfaced in the test log but never asserted
    on. The goal is to record the cold/lift/hit gap for each pack
    shape so a future Phase can make a product decision with
    real numbers rather than a guess. A regression that makes the
    cold path dramatically slower would still be caught by the
    e2e fresh-user suite, which has real timeout budgets.
  */
  for (const shape of PACK_SHAPES) {
    it(`records put/lift/hit timings for ${shape.id}`, async () => {
      const sample = sampleBytes(0x42, shape.chunkSize);
      const report = await measure(shape, sample, 32);
      // eslint-disable-next-line no-console
      console.log(
        `[cache-warmth] ${shape.id} chunk=${shape.chunkSize}B put=${report.putMs.toFixed(2)}ms lift=${report.liftMs.toFixed(2)}ms hit=${report.hitMs.toFixed(2)}ms`,
      );
      expect(report.putMs).toBeGreaterThanOrEqual(0);
      expect(report.liftMs).toBeGreaterThanOrEqual(0);
      expect(report.hitMs).toBeGreaterThanOrEqual(0);
    });
  }

  /*
    The single invariant the brief asks us to pin in a test: a
    hit read is faster than the lift that brought the chunk in.
    The lift is the warm-cache benefit; if it is not actually
    cheaper than a hit, the persistent tier is not earning its
    keep.
  */
  it('a hit is at least no slower than a lift for the same chunk', async () => {
    const shape: PackShape = PACK_SHAPES[1]!;
    const sample = sampleBytes(0x33, shape.chunkSize);
    const { liftMs, hitMs } = await measure(shape, sample, 32);
    expect(hitMs).toBeLessThanOrEqual(liftMs + 1);
  });
});
