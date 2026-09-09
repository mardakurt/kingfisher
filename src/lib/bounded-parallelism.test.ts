import { describe, expect, it, vi } from 'vitest';

import { runBounded } from './bounded-parallelism';

describe('runBounded', () => {
  it('returns results in the original order', async () => {
    const items = [3, 1, 4, 1, 5, 9, 2, 6];
    const results = await runBounded({
      items,
      worker: async (value) => value * 2,
    });
    expect(results).toEqual([6, 2, 8, 2, 10, 18, 4, 12]);
  });

  it('runs at most `concurrency` workers at a time', async () => {
    let inFlight = 0;
    let peak = 0;
    const concurrency = 3;
    await runBounded({
      items: Array.from({ length: 20 }, (_, index) => index),
      concurrency,
      worker: async (value) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        // Sleep a few ms so the bound is observable.
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return value;
      },
    });
    expect(peak).toBeLessThanOrEqual(concurrency);
    expect(peak).toBeGreaterThan(1);
  });

  it('isolates per-item errors and returns null in the result slot', async () => {
    const onError = vi.fn();
    const results = await runBounded({
      items: [1, 2, 3, 4],
      concurrency: 2,
      worker: async (value) => {
        if (value === 2) throw new Error('boom');
        return value * 10;
      },
      onError,
    });
    expect(results).toEqual([10, null, 30, 40]);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[1]).toBe(2);
  });

  it('honours AbortSignal and stops launching new workers', async () => {
    const controller = new AbortController();
    const started: number[] = [];
    const promise = runBounded({
      items: [1, 2, 3, 4, 5, 6, 7, 8],
      concurrency: 2,
      signal: controller.signal,
      worker: async (value) => {
        started.push(value);
        if (value === 1) controller.abort();
        await new Promise((resolve) => setTimeout(resolve, 5));
        return value;
      },
    });
    const results = await promise;
    // Two workers are launched up front, the second sees the abort and
    // returns. The remaining items are not started.
    expect(started.length).toBeLessThan(8);
    expect(results.filter((value) => value !== null).length).toBeLessThan(8);
  });

  it('returns an empty array for an empty input', async () => {
    const results = await runBounded({
      items: [],
      worker: async (value: number) => value,
    });
    expect(results).toEqual([]);
  });

  it('falls back to concurrency 1 when zero is requested', async () => {
    const results = await runBounded({
      items: [1, 2, 3],
      concurrency: 0,
      worker: async (value) => value,
    });
    expect(results).toEqual([1, 2, 3]);
  });
});
