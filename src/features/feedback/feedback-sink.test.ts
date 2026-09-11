import { describe, expect, it } from 'vitest';

import { GithubFallbackSink, HttpFeedbackSink } from './feedback-sink';
import type { FeedbackEnvelope } from './feedback-schema';

const envelope: FeedbackEnvelope = {
  category: 'broken',
  message: 'The explorer is showing the wrong source.',
  includeTechnical: false,
  clientVersion: '1.0.0',
  surface: 'web',
};

describe('HttpFeedbackSink', () => {
  it('submits to /api/feedback by default with JSON content-type', async () => {
    let capturedUrl: string | null = null;
    let capturedInit: RequestInit | undefined;
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedInit = init;
      return new Response(JSON.stringify({ reference: 'ref-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    const sink = new HttpFeedbackSink({ fetchImpl });
    const result = await sink.submit(envelope);
    expect(result).toEqual({ ok: true, reference: 'ref-1' });
    expect(capturedUrl).toBe('/api/feedback');
    expect(capturedInit?.method).toBe('POST');
    expect((capturedInit?.headers as Record<string, string>)['content-type']).toBe(
      'application/json',
    );
    expect(capturedInit?.credentials).toBe('same-origin');
    expect(capturedInit?.body).toBe(JSON.stringify(envelope));
  });

  it('maps a 200 without a reference body to a generic success', async () => {
    const fetchImpl = (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
    const sink = new HttpFeedbackSink({ fetchImpl });
    const result = await sink.submit(envelope);
    expect(result).toEqual({ ok: true, reference: 'submitted' });
  });

  it('maps 413 to a too-large result', async () => {
    const fetchImpl = (async () => new Response('{}', { status: 413 })) as unknown as typeof fetch;
    const sink = new HttpFeedbackSink({ fetchImpl });
    expect(await sink.submit(envelope)).toEqual({
      ok: false,
      code: 'too-large',
      message: 'The message is too large to send.',
    });
  });

  it('maps 429 to a rate-limited result and uses the server message when present', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ message: 'Try later.' }), {
        status: 429,
      })) as unknown as typeof fetch;
    const sink = new HttpFeedbackSink({ fetchImpl });
    expect(await sink.submit(envelope)).toEqual({
      ok: false,
      code: 'rate-limited',
      message: 'Try later.',
    });
  });

  it('maps 400/403/422 to a rejected result', async () => {
    for (const status of [400, 403, 422]) {
      const fetchImpl = (async () => new Response('{}', { status })) as unknown as typeof fetch;
      const sink = new HttpFeedbackSink({ fetchImpl });
      const result = await sink.submit(envelope);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('rejected');
    }
  });

  it('maps any other status to an unavailable result', async () => {
    const fetchImpl = (async () => new Response('{}', { status: 500 })) as unknown as typeof fetch;
    const sink = new HttpFeedbackSink({ fetchImpl });
    const result = await sink.submit(envelope);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('unavailable');
  });

  it('maps a network failure to a network result', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    const sink = new HttpFeedbackSink({ fetchImpl });
    const result = await sink.submit(envelope);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('network');
  });

  it('maps an aborted request to a timeout result', async () => {
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      return await new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      });
    }) as unknown as typeof fetch;
    const sink = new HttpFeedbackSink({ fetchImpl, timeoutMs: 5 });
    const result = await sink.submit(envelope);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('timeout');
  });

  it('uses a configurable endpoint', async () => {
    let capturedUrl: string | null = null;
    const fetchImpl = (async (url: string) => {
      capturedUrl = url;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const sink = new HttpFeedbackSink({ fetchImpl, endpoint: '/api/feedback-v2' });
    await sink.submit(envelope);
    expect(capturedUrl).toBe('/api/feedback-v2');
  });
});

describe('GithubFallbackSink', () => {
  it('opens a pre-filled issue URL and reports the user-visible message', async () => {
    const opens: string[] = [];
    const original = globalThis.open;
    globalThis.open = ((url: string) => {
      opens.push(url);
      return null;
    }) as typeof window.open;
    try {
      const sink = new GithubFallbackSink({
        repositoryUrl: 'https://github.com/mardakurt/kingfisher',
        template: 'bug_report.md',
        surface: 'web',
        clientVersion: '1.0.0',
      });
      const result = await sink.submit(envelope);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('unavailable');
      expect(opens).toHaveLength(1);
      const url = opens[0];
      expect(url).toContain('/issues/new?template=bug_report.md');
      expect(url).toContain('Kingfisher');
      expect(url).toContain('broken');
    } finally {
      globalThis.open = original;
    }
  });

  it('appends the current FEN when the envelope carries one', async () => {
    const opens: string[] = [];
    const original = globalThis.open;
    globalThis.open = ((url: string) => {
      opens.push(url);
      return null;
    }) as typeof window.open;
    try {
      const sink = new GithubFallbackSink({
        repositoryUrl: 'https://github.com/mardakurt/kingfisher',
        template: 'data_issue.md',
        surface: 'desktop',
        clientVersion: '1.0.0',
      });
      await sink.submit({
        ...envelope,
        currentFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      });
      const url = opens[0];
      expect(decodeURIComponent(url!)).toContain('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');
    } finally {
      globalThis.open = original;
    }
  });
});
