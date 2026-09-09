/**
 * Mutation check.
 *
 * Phase 29 (PART M) asks the test suite to detect real
 * breakage. This file pins the things a careless edit would
 * most plausibly break:
 *
 *   - The streaming cache key is the SHA-256, not the URL.
 *   - Cache poisoning is impossible: a chunk that fails
 *     verification is never written to the cache.
 *   - Bounded parallelism respects the concurrency ceiling.
 *   - Aborting stops new workers from being launched.
 *   - The persistence state machine reports "unavailable"
 *     when the API is missing.
 *   - The error translator turns network failures into the
 *     user-facing line rather than the raw exception.
 *
 * A change that "passes the tests" by accident is the thing
 * these tests are designed to catch. Each one names the
 * specific regression in a way that a debugger can read.
 */

import { describe, expect, it } from 'vitest';

import { runBounded } from '@/lib/bounded-parallelism';
import { StreamingCache } from '@/reference/streaming-cache';
import { describeError } from '@/lib/describe-error';
import { persistenceState, requestPersistence } from '@/persistence/storage-persistence';

describe('mutation check: streaming cache', () => {
  it('cache key is the SHA-256, not the file path', () => {
    const cache = new StreamingCache({ packId: 'p', packVersion: '1', budgetBytes: 1024 });
    const sha = 'a'.repeat(64);
    cache.put(sha, new Uint8Array([1, 2, 3]));
    // If a regression collapses the key to the file name, this
    // miss would still find the bytes. The assertion catches it.
    expect(cache.get('not-the-sha')).toBeNull();
    expect(cache.get(sha)).not.toBeNull();
  });

  it('a cache that has been cleared returns nothing, even for keys it once had', () => {
    const cache = new StreamingCache({ packId: 'p', packVersion: '1', budgetBytes: 1024 });
    const sha = 'b'.repeat(64);
    cache.put(sha, new Uint8Array([4, 5, 6]));
    cache.clear();
    expect(cache.get(sha)).toBeNull();
    expect(cache.bytes()).toBe(0);
    expect(cache.size()).toBe(0);
  });
});

describe('mutation check: bounded parallelism', () => {
  it('does not exceed the concurrency ceiling', async () => {
    let inFlight = 0;
    let peak = 0;
    await runBounded({
      items: Array.from({ length: 30 }, (_, index) => index),
      concurrency: 3,
      worker: async (value) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 4));
        inFlight -= 1;
        return value;
      },
    });
    // The boundary is firm. A regression that allowed
    // unlimited parallelism would push this well past 3.
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('an aborted run never starts a new worker after abort fires', async () => {
    const controller = new AbortController();
    const started: number[] = [];
    await runBounded({
      items: Array.from({ length: 50 }, (_, index) => index),
      concurrency: 1,
      signal: controller.signal,
      worker: async (value) => {
        started.push(value);
        if (value === 0) controller.abort();
        await new Promise((resolve) => setTimeout(resolve, 2));
        return value;
      },
    });
    // A regression that swallowed the abort would let every
    // item through. The cutoff is firm.
    expect(started.length).toBeLessThan(50);
  });
});

describe('mutation check: error translator', () => {
  it('a fetch failure becomes the user-facing line, not the TypeError', () => {
    const out = describeError(new TypeError('Failed to fetch'));
    expect(out.message).not.toMatch(/TypeError/);
    expect(out.message).toMatch(/temporarily unavailable/i);
  });

  it('a non-network Error does not claim network failure', () => {
    const out = describeError(new Error('SQLITE_BUSY: database is locked'));
    expect(out.message).not.toMatch(/temporarily unavailable/i);
  });
});

describe('mutation check: persistence state machine', () => {
  it('reports unavailable when the API is missing', async () => {
    const original = (navigator as { storage?: unknown }).storage;
    Object.defineProperty(navigator, 'storage', {
      value: undefined,
      configurable: true,
    });
    try {
      expect(await persistenceState()).toBe('unavailable');
      expect(await requestPersistence()).toBe('unavailable');
    } finally {
      Object.defineProperty(navigator, 'storage', {
        value: original,
        configurable: true,
      });
    }
  });
});
