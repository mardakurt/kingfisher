/**
 * When a failed remote request is worth repeating.
 *
 * The policy has to be typed rather than guessed from the message. The
 * explorer previously decided by substring — `!message.includes('rate
 * limiting')` — which retried a 401 (the token is not going to become valid a
 * second later, and the second request is another entry in the rate-limit
 * budget), retried a schema mismatch, and would have started retrying rate
 * limits the day somebody rewrote that sentence.
 *
 * The rule underneath: retry only what a retry could plausibly fix. A timeout
 * or a dropped connection is worth one more attempt. A rejected credential, a
 * misconfigured query, an unsupported operation and a response Kingfisher
 * cannot parse are all facts that will still be true in a second's time.
 */

import { DatabaseError, type ProviderHealthState } from './types';

/** One extra attempt, not a storm. */
const MAX_ATTEMPTS = 1;

const RETRYABLE: ReadonlySet<ProviderHealthState> = new Set<ProviderHealthState>(['network-error']);

export function isRetryableProviderError(error: unknown): boolean {
  if (error instanceof DatabaseError) return RETRYABLE.has(error.state);
  // An unrecognised failure is usually a transport error thrown by `fetch`
  // before any status existed, which is exactly the retryable case.
  return error instanceof Error && !(error instanceof DatabaseError);
}

/** The `retry` predicate TanStack Query expects. */
export const providerRetry = (failureCount: number, error: unknown): boolean =>
  failureCount < MAX_ATTEMPTS && isRetryableProviderError(error);

/**
 * How long to wait before that one retry.
 *
 * `Retry-After` is honoured when a provider supplies one, because a service
 * telling you when to come back is more reliable than any backoff curve — and
 * ignoring it is how a client earns a longer ban. Rate limits are not retried
 * automatically at all, so this only applies where a caller retries by hand.
 */
export function retryDelayMs(error: unknown, attempt: number): number {
  if (error instanceof DatabaseError && error.retryAfterMs !== undefined) {
    return Math.min(error.retryAfterMs, 60_000);
  }
  return Math.min(1000 * 2 ** attempt, 8000);
}

/**
 * Parse a `Retry-After` header, which is either seconds or an HTTP date.
 *
 * Returns undefined for anything else rather than guessing: a wrong wait is
 * worse than the default backoff.
 */
export function parseRetryAfter(header: string | null, now = Date.now()): number | undefined {
  if (!header) return undefined;
  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return undefined;
  return Math.max(0, at - now);
}

/**
 * A signal that aborts when the caller does, or when the deadline passes.
 *
 * Every remote request needs one. A fetch with no timeout is the eternal
 * spinner in its original form: the promise simply never settles, and no
 * amount of error handling downstream ever runs.
 */
export function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  if (!signal) return timeout;
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([signal, timeout]);

  const controller = new AbortController();
  const abort = () => controller.abort();
  for (const source of [signal, timeout]) {
    if (source.aborted) {
      controller.abort();
      break;
    }
    source.addEventListener('abort', abort, { once: true });
  }
  return controller.signal;
}
