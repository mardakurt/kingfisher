/**
 * FeedbackSink is the abstraction the modal talks to.
 *
 * Two implementations exist:
 *
 *   - `HttpFeedbackSink` — the default. Posts the validated
 *     envelope to `/api/feedback`. The route decides whether
 *     the message reaches a GitHub issue, a private
 *     repository, or a fallback. The renderer never sees
 *     backend credentials.
 *
 *   - `GithubFallbackSink` — opens the existing GitHub issue
 *     template URL with the message pre-filled in the title.
 *     Used when the server is unavailable and the modal
 *     reports "we could not send right now". The user keeps
 *     their draft and decides whether to retry.
 *
 * The contract is small on purpose: submitFeedback takes a
 * validated envelope and returns a result. No retry, no
 * background queue, no analytics. Phase 40 deliberately does
 * not add an offline queue — a user who closes the modal
 * before sending has lost the draft, and a user who keeps the
 * modal open while offline gets a clear "you are offline"
 * message and the option to copy the text.
 */

import type { FeedbackEnvelope, FeedbackResult, FeedbackSurface } from './feedback-schema';

export interface FeedbackSink {
  submit(envelope: FeedbackEnvelope): Promise<FeedbackResult>;
}

export const FEEDBACK_ENDPOINT = '/api/feedback';

export class HttpFeedbackSink implements FeedbackSink {
  readonly endpoint: string;
  readonly fetchImpl: typeof fetch;
  readonly timeoutMs: number;

  constructor(
    options: Partial<{ endpoint: string; fetchImpl: typeof fetch; timeoutMs: number }> = {},
  ) {
    this.endpoint = options.endpoint ?? FEEDBACK_ENDPOINT;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 12_000;
  }

  async submit(envelope: FeedbackEnvelope): Promise<FeedbackResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(envelope),
        signal: controller.signal,
        credentials: 'same-origin',
        // No GitHub token ever lives on the renderer. The route
        // is the only place credentials exist.
      });
      const parsed = await parseResponse(response);
      return parsed;
    } catch (error) {
      if (controller.signal.aborted) {
        return {
          ok: false,
          code: 'timeout',
          message: 'The feedback request did not complete in time.',
        };
      }
      const message = error instanceof Error ? error.message : 'Network error.';
      if (/failed to fetch|networkerror|load failed/i.test(message)) {
        return { ok: false, code: 'network', message: 'You appear to be offline.' };
      }
      return { ok: false, code: 'network', message };
    } finally {
      clearTimeout(timer);
    }
  }
}

export interface GithubFallbackOptions {
  readonly repositoryUrl: string;
  readonly template: string;
  readonly surface: FeedbackSurface;
  readonly clientVersion: string;
}

export class GithubFallbackSink implements FeedbackSink {
  readonly options: GithubFallbackOptions;

  constructor(options: GithubFallbackOptions) {
    this.options = options;
  }

  async submit(envelope: FeedbackEnvelope): Promise<FeedbackResult> {
    /* The fallback is a *link*, not a submission. The user keeps
       their draft and decides whether to file the issue. */
    const title = `${envelope.category}: ${envelope.message.slice(0, 80)}`;
    const body = [
      envelope.message,
      '',
      `Kingfisher ${envelope.clientVersion} on ${envelope.surface}.`,
      envelope.currentFen ? `Position: ${envelope.currentFen}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    const url = `${this.options.repositoryUrl}/issues/new?template=${encodeURIComponent(
      this.options.template,
    )}&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
    if (typeof window !== 'undefined' && typeof window.open === 'function') {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else if (typeof globalThis !== 'undefined' && typeof (globalThis as { open?: unknown }).open === 'function') {
      (globalThis as { open: (url: string) => unknown }).open(url);
    }
    return {
      ok: false,
      code: 'unavailable',
      message:
        'Opened GitHub with your message pre-filled. The direct submission path was not available.',
    };
  }
}

async function parseResponse(response: Response): Promise<FeedbackResult> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (response.status === 200) {
    const reference = (body as { reference?: unknown } | null)?.reference;
    if (typeof reference === 'string') return { ok: true, reference };
    return { ok: true, reference: 'submitted' };
  }
  if (response.status === 413) {
    return { ok: false, code: 'too-large', message: 'The message is too large to send.' };
  }
  if (response.status === 429) {
    const message = (body as { message?: unknown } | null)?.message;
    return {
      ok: false,
      code: 'rate-limited',
      message:
        typeof message === 'string' ? message : 'Too many submissions. Please try again later.',
    };
  }
  if (response.status === 400 || response.status === 403 || response.status === 422) {
    const message = (body as { message?: unknown } | null)?.message;
    return {
      ok: false,
      code: 'rejected',
      message: typeof message === 'string' ? message : 'The submission was rejected.',
    };
  }
  return {
    ok: false,
    code: 'unavailable',
    message: 'The feedback service is unavailable. Please try again shortly.',
  };
}

/**
 * Decide which sink to use at submit time.
 *
 * The renderer never blocks feedback on a sink choice: if the
 * server is reachable, the HTTP sink is used; otherwise the
 * GitHub fallback is offered. The decision is exposed so the
 * modal can tell the user "we could not send this directly"
 * before falling back.
 */
export function pickFeedbackSink(
  directAvailable: boolean,
  fallback: GithubFallbackSink,
): FeedbackSink {
  return directAvailable ? new HttpFeedbackSink() : fallback;
}
