import { describe, expect, it } from 'vitest';

import {
  isRetryableProviderError,
  parseRetryAfter,
  providerRetry,
  retryDelayMs,
  withTimeout,
} from './retry';
import { DatabaseError, type ProviderHealthState } from './types';

type FailureState = Exclude<ProviderHealthState, 'ready' | 'loading'>;

const failure = (state: FailureState) => new DatabaseError('failed', undefined, state);

describe('which provider failures are worth repeating', () => {
  it('retries a network error, which a second attempt can plausibly fix', () => {
    expect(isRetryableProviderError(failure('network-error'))).toBe(true);
  });

  it('never retries a rejected credential', () => {
    // The token will not become valid a second later, and the retry spends
    // another request against the rate limit.
    expect(isRetryableProviderError(failure('authentication-required'))).toBe(false);
  });

  it('never retries a rate limit', () => {
    expect(isRetryableProviderError(failure('rate-limited'))).toBe(false);
  });

  it('never retries a response it could not parse', () => {
    // A schema change is not transient; retrying it forever was the failure
    // mode this policy exists to prevent.
    expect(isRetryableProviderError(failure('error'))).toBe(false);
  });

  it('never retries a misconfigured or unsupported query', () => {
    expect(isRetryableProviderError(failure('misconfigured'))).toBe(false);
    expect(isRetryableProviderError(failure('unsupported'))).toBe(false);
  });

  it('retries a bare transport error thrown before any status existed', () => {
    expect(isRetryableProviderError(new TypeError('Failed to fetch'))).toBe(true);
  });

  it('stops after a single extra attempt', () => {
    const error = failure('network-error');
    expect(providerRetry(0, error)).toBe(true);
    expect(providerRetry(1, error)).toBe(false);
    expect(providerRetry(5, error)).toBe(false);
  });

  it('does not retry an auth failure even on the first attempt', () => {
    expect(providerRetry(0, failure('authentication-required'))).toBe(false);
  });
});

describe('how long to wait', () => {
  it('honours a Retry-After the service supplied', () => {
    const error = new DatabaseError('slow down', undefined, 'rate-limited', 429, 5_000);
    expect(retryDelayMs(error, 0)).toBe(5_000);
  });

  it('caps a very long Retry-After rather than hanging for an hour', () => {
    const error = new DatabaseError('slow down', undefined, 'rate-limited', 429, 3_600_000);
    expect(retryDelayMs(error, 0)).toBe(60_000);
  });

  it('backs off when the service said nothing', () => {
    expect(retryDelayMs(new Error('x'), 0)).toBe(1000);
    expect(retryDelayMs(new Error('x'), 1)).toBe(2000);
    expect(retryDelayMs(new Error('x'), 10)).toBe(8000);
  });
});

describe('reading a Retry-After header', () => {
  it('reads a count of seconds', () => {
    expect(parseRetryAfter('30')).toBe(30_000);
  });

  it('reads an HTTP date as a distance from now', () => {
    const now = Date.parse('2026-09-02T12:00:00Z');
    expect(parseRetryAfter('Wed, 02 Sep 2026 12:00:20 GMT', now)).toBe(20_000);
  });

  it('never returns a negative wait for a date already past', () => {
    const now = Date.parse('2026-09-02T12:00:00Z');
    expect(parseRetryAfter('Wed, 02 Sep 2026 11:59:00 GMT', now)).toBe(0);
  });

  it('declines to guess at anything else', () => {
    // A wrong wait is worse than the default backoff.
    expect(parseRetryAfter('soon')).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter('')).toBeUndefined();
  });
});

describe('request deadlines', () => {
  it('aborts when the caller aborts', () => {
    const controller = new AbortController();
    const signal = withTimeout(controller.signal, 60_000);
    expect(signal.aborted).toBe(false);
    controller.abort();
    expect(signal.aborted).toBe(true);
  });

  it('produces a signal even when the caller supplied none', () => {
    expect(withTimeout(undefined, 50)).toBeInstanceOf(AbortSignal);
  });

  it('is already aborted when the caller aborted first', () => {
    const controller = new AbortController();
    controller.abort();
    expect(withTimeout(controller.signal, 60_000).aborted).toBe(true);
  });

  it('aborts on its own deadline', async () => {
    const signal = withTimeout(undefined, 10);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(signal.aborted).toBe(true);
  });
});
