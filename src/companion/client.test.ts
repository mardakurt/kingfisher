/**
 * The deadline a companion request is given.
 *
 * Twenty seconds is right for a query and wrong for work proportional to the
 * size of a collection. Verifying the aggregates of a 210,000-game database —
 * sixteen million indexed positions, twelve gigabytes — takes 67 seconds on the
 * machine that built it, because the counts it compares *are* the verification
 * and there is no way to reach them without reading every row. Under the
 * ordinary deadline the integrity check therefore failed on exactly the
 * collections worth checking, and reported the companion as unresponsive when
 * it was working.
 *
 * The deadline is read off `AbortSignal.timeout`, which is where it is actually
 * decided, so a change that routes one of these back through the ordinary path
 * fails here rather than only on somebody's large database.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CompanionClient } from './client';

/** Milliseconds each request asked `AbortSignal.timeout` for, in order. */
let deadlines: number[] = [];

function client(): CompanionClient {
  return new CompanionClient({ url: 'http://127.0.0.1:4338', token: 'test-token' });
}

beforeEach(() => {
  deadlines = [];
  const real = AbortSignal.timeout.bind(AbortSignal);
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
    deadlines.push(ms);
    // A signal that never fires, so nothing here races a real clock.
    return real(3_600_000);
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('how long the companion is given to answer', () => {
  it('gives an ordinary query twenty seconds', async () => {
    await client().status();
    expect(deadlines).toEqual([20_000]);
  });

  it.each([
    ['integrity', (c: CompanionClient) => c.databaseIntegrity('k')],
    ['rebuild aggregates', (c: CompanionClient) => c.rebuildAggregates('k')],
    ['clear', (c: CompanionClient) => c.clearDatabase('k')],
    ['delete games', (c: CompanionClient) => c.deleteGames('k', { fingerprints: ['a'] })],
  ])('gives %s long enough to scan a whole collection', async (_name, call) => {
    await call(client()).catch(() => undefined);
    const [given] = deadlines;
    // Comfortably past the 67 seconds a 210,000-game verification measured, and
    // past the five minutes the same work projects to at a million games.
    expect(given).toBeGreaterThan(300_000);
  });

  it('still gives up eventually, rather than waiting for ever', async () => {
    await client()
      .databaseIntegrity('k')
      .catch(() => undefined);
    const [given] = deadlines as [number];
    // The point of the longer deadline is patience, not the absence of one: a
    // companion that has wedged must still lose the request.
    expect(Number.isFinite(given)).toBe(true);
    expect(given).toBeLessThanOrEqual(900_000);
  });

  it('does not quietly lengthen every request along with them', async () => {
    const companion = client();
    await companion.status();
    await companion.databaseIntegrity('k').catch(() => undefined);
    const [ordinary, maintenance] = deadlines as [number, number];
    expect(ordinary).toBe(20_000);
    expect(maintenance).toBeGreaterThan(ordinary);
  });
});
