/**
 * Translate any error into a single user-facing line, with a
 * companion remedy when there is one worth giving.
 *
 * Phase 29 (PART CH): the user-facing error copy was scattered.
 * A workspace would surface "TypeError: NetworkError when
 * attempting to fetch resource" alongside "DOMException" or
 * "ERR_CONNECTION_REFUSED", and a player would see a status
 * code, not a sentence. The brief is explicit that the user
 * should see "Reference data is temporarily unavailable. Your
 * work is saved locally. Try again." rather than the raw
 * exception. Diagnostics can still carry the technical detail.
 *
 * The function is deliberately small and pure — every workspace
 * that catches an error can call it. The `DatabaseError` shape
 * already carries `remedy`, so the data flows through cleanly.
 *
 * Inputs:
 *   - `DatabaseError` (from `@/database/types`) -> its message
 *     joined with its `remedy` when one is set.
 *   - A native `TypeError` whose message looks like a network
 *     failure -> the standard "temporarily unavailable" line.
 *   - A `DOMException` of `NetworkError`, `AbortError`, or
 *     `TimeoutError` -> the matching one-liner.
 *   - Anything else -> the original `error.message` with a
 *     generic prefix, so the user sees something rather than
 *     a blank state.
 *
 * The companion `remedy` is a short imperative ("Try again",
 * "Check the network connection", "Use the offline source"),
 * not a paragraph, and is shown only when one was supplied.
 */

const NETWORK_HINT = 'Check the network connection, or switch to an offline source.';
const TRY_AGAIN = 'Try again in a moment.';

interface WithMessage {
  readonly message: string;
  readonly remedy?: string;
}

const isNetworkFailureMessage = (message: string): boolean => {
  const m = message.toLowerCase();
  return (
    m.includes('failed to fetch') ||
    m.includes('networkerror') ||
    m.includes('network request failed') ||
    m.includes('err_connection') ||
    m.includes('econnrefused') ||
    m.includes('etimedout') ||
    m.includes('enotfound') ||
    m.includes('socket hang up') ||
    m.includes('load failed')
  );
};

const isAbort = (error: unknown): boolean =>
  typeof DOMException !== 'undefined' &&
  (error instanceof DOMException || (error as { name?: string } | null)?.name === 'AbortError') &&
  (error as { name?: string }).name === 'AbortError';

const isTimeout = (error: unknown): boolean => {
  const name = (error as { name?: string } | null)?.name;
  return name === 'TimeoutError' || name === 'AbortError';
};

export interface DescribedError {
  /** What the user reads. Plain English, no codes. */
  readonly message: string;
  /** Optional imperative next step. Shown as a separate line. */
  readonly remedy?: string;
}

export function describeError(error: unknown): DescribedError {
  if (error === null || error === undefined) {
    return { message: 'Something went wrong, but no error was reported.', remedy: TRY_AGAIN };
  }
  if (typeof error === 'string') {
    return { message: error };
  }
  if (isAbort(error)) {
    return { message: 'The request was cancelled.', remedy: TRY_AGAIN };
  }
  if (isTimeout(error)) {
    return { message: 'The request took too long.', remedy: `${NETWORK_HINT} ${TRY_AGAIN}` };
  }
  if (error instanceof Error) {
    const withMessage = error as Error & { remedy?: string; status?: number };
    if (isNetworkFailureMessage(error.message)) {
      return { message: 'Reference data is temporarily unavailable.', remedy: NETWORK_HINT };
    }
    if (withMessage.remedy) {
      return { message: withMessage.message, remedy: withMessage.remedy };
    }
    // DatabaseError messages are written for users; pass them
    // through without a prefix. Anything else gets a generic
    // wrap so the user does not see a raw exception name.
    if (error.name === 'DatabaseError') {
      return { message: error.message };
    }
    return {
      message: 'The action did not complete.',
      remedy: error.message ? `${error.message}. ${TRY_AGAIN}` : TRY_AGAIN,
    };
  }
  return { message: String(error), remedy: TRY_AGAIN };
}

/**
 * Render a `DescribedError` as a single user-facing string, with
 * the remedy on a second line if present.
 */
export function formatDescribedError(error: DescribedError): string {
  if (!error.remedy) return error.message;
  return `${error.message} ${error.remedy}`;
}

/**
 * For callers that want the raw `error.message` plus a remedy
 * without going through `describeError`. Useful for surfaces
 * that already show the technical detail to a power user.
 */
export function withRemedy(error: unknown, remedy: string): WithMessage {
  if (error instanceof Error) {
    return { message: error.message, remedy };
  }
  return { message: String(error), remedy };
}
