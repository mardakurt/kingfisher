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

export interface Deadline {
  /** Aborts when the caller's signal does, or when the deadline passes. */
  readonly signal: AbortSignal;
  /** True once the deadline, rather than the caller, ended the request. */
  expired(): boolean;
}

/**
 * A deadline for one request, combined with the caller's own signal.
 *
 * Built from an `AbortController` and a timer, and deliberately not from
 * `AbortSignal.any([signal, AbortSignal.timeout(ms)])`. In WebKit — so in
 * Safari — a signal made by `AbortSignal.any` from a timeout signal never
 * aborts once the page has allocated enough to collect garbage in the
 * meantime: the fetch it guards stays pending for ever, and the panel waiting
 * on it reads "Reading…" for ever. Found by `e2e/provider-states.spec.ts`
 * with an explorer request that was never answered. Here the timer's callback
 * holds the controller, so nothing it needs can be collected before it fires.
 *
 * `expired()` says which of the two ended it. The rejection's error name does
 * not: WebKit rejects a timed-out fetch with `AbortError`, not `TimeoutError`.
 */
export function deadline(ms: number, signal?: AbortSignal): Deadline {
  const controller = new AbortController();
  let expired = false;
  const timer: unknown = setTimeout(() => {
    expired = true;
    controller.abort(new DOMException(`No answer within ${ms} ms.`, 'TimeoutError'));
  }, ms);
  // Under Node a pending deadline must not keep a finished script alive.
  (timer as { unref?: () => void } | null)?.unref?.();
  if (signal) {
    const follow = () => {
      clearTimeout(timer as ReturnType<typeof setTimeout>);
      controller.abort(signal.reason);
    };
    if (signal.aborted) follow();
    else signal.addEventListener('abort', follow, { once: true });
  }
  return { signal: controller.signal, expired: () => expired };
}

/**
 * A signal that aborts when the caller does, or when the deadline passes.
 *
 * Every remote request needs one. A fetch with no timeout is the eternal
 * spinner in its original form: the promise simply never settles, and no
 * amount of error handling downstream ever runs. See `deadline` for why this
 * is not `AbortSignal.any`.
 */
export function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  return deadline(ms, signal).signal;
}
