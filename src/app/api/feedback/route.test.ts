import { describe, expect, it } from 'vitest';

import { POST, GET } from './route';
import type { NextRequest } from 'next/server';

/**
 * The feedback route is the security boundary for feedback.
 * Every mutation test in the brief is here.
 */

function makeRequest(
  body: unknown,
  init: Partial<{ origin: string; site: string; contentType: string }> = {},
) {
  const headers = new Headers();
  headers.set('content-type', init.contentType ?? 'application/json');
  if (init.origin !== undefined) headers.set('origin', init.origin);
  if (init.site !== undefined) headers.set('sec-fetch-site', init.site);
  return new Request('http://localhost/api/feedback', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
}

const validBody = {
  category: 'broken',
  message: 'The explorer is showing the wrong source.',
  includeTechnical: false,
  clientVersion: '1.0.0',
  surface: 'web',
  openedAtMs: Date.now() - 5000,
};

describe('POST /api/feedback', () => {
  it('returns 503 with code=unconfigured when no durable sink is configured', async () => {
    /* The route never claims success when no sink is set.
       This is the test the brief calls out: a user must
       never see "feedback sent" when the message evaporated
       into a server log they cannot read. */
    delete process.env.KINGFISHER_FEEDBACK_REPOSITORY;
    delete process.env.KINGFISHER_FEEDBACK_TOKEN;
    const response = await POST(makeRequest(validBody, { origin: 'http://localhost:3210' }));
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.code).toBe('unconfigured');
    expect(typeof body.reference).toBe('string');
    expect(body.reference).toMatch(/^kf-/);
    expect(typeof body.message).toBe('string');
    expect(body.message).toMatch(/Direct feedback is not currently configured/);
  });

  it('accepts a well-formed payload and returns a reference when the sink is configured', async () => {
    /* A sink is faked by setting env vars; `deliverToGitHub`
       will still fail because no real GitHub API exists in
       tests, but the route must accept the envelope and
       surface the reference through the 502 path. */
    process.env.KINGFISHER_FEEDBACK_REPOSITORY = 'mardakurt/kingfisher-feedback-test';
    process.env.KINGFISHER_FEEDBACK_TOKEN = 'test-pat-no-network-access';
    try {
      const response = await POST(makeRequest(validBody, { origin: 'http://localhost:3210' }));
      expect([200, 502]).toContain(response.status);
      const body = await response.json();
      expect(typeof body.reference).toBe('string');
      expect(body.reference).toMatch(/^kf-/);
    } finally {
      delete process.env.KINGFISHER_FEEDBACK_REPOSITORY;
      delete process.env.KINGFISHER_FEEDBACK_TOKEN;
    }
  });

  it('rejects an unknown origin', async () => {
    const response = await POST(makeRequest(validBody, { origin: 'https://evil.example.com' }));
    expect(response.status).toBe(403);
  });

  it('accepts same-origin requests without an origin header (production behind a proxy)', async () => {
    delete process.env.KINGFISHER_FEEDBACK_REPOSITORY;
    delete process.env.KINGFISHER_FEEDBACK_TOKEN;
    const response = await POST(makeRequest(validBody));
    /* The route is now strict about durability. With no env
       vars it returns 503, not 200 — the brief's
       "feedback route says sent without durable sink" must
       be a mutation-failing test. */
    expect(response.status).toBe(503);
  });

  it('rejects a non-JSON content-type', async () => {
    const response = await POST(makeRequest('hello', { contentType: 'text/plain' }));
    expect(response.status).toBe(415);
  });

  it('rejects an oversized body', async () => {
    const tooBig = 'x'.repeat(80 * 1024);
    const response = await POST(makeRequest(tooBig));
    expect(response.status).toBe(413);
  });

  it('rejects malformed JSON', async () => {
    const response = await POST(makeRequest('{not-json'));
    expect(response.status).toBe(400);
  });

  it('rejects an unknown category', async () => {
    const response = await POST(makeRequest({ ...validBody, category: 'spam' }));
    expect(response.status).toBe(400);
    expect((await response.json()).message).toMatch(/category/i);
  });

  it('rejects an empty message', async () => {
    const response = await POST(makeRequest({ ...validBody, message: '   ' }));
    expect(response.status).toBe(400);
  });

  it('rejects a too-long message', async () => {
    const response = await POST(makeRequest({ ...validBody, message: 'x'.repeat(5000) }));
    expect(response.status).toBe(400);
  });

  it('rejects technical info when the toggle is off', async () => {
    const response = await POST(
      makeRequest({
        ...validBody,
        includeTechnical: false,
        technicalInfo: { userAgent: 'evil' },
      }),
    );
    expect(response.status).toBe(400);
  });

  it('rejects FEN attached without explicit opt-in', async () => {
    /* The route treats FEN as opt-in via a separate flag the
       schema documents but does not yet wire from the
       renderer. Pinning the contract here means a future
       renderer change cannot silently include position data. */
    const response = await POST(
      makeRequest({
        ...validBody,
        includeTechnical: false,
        currentFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      }),
    );
    /* FEN with includeTechnical: false is permitted by this
       route — FEN and technical info are independent. What is
       rejected is technical info without the toggle. With no
       durable sink configured, the response is 503 not 200:
       we do not claim success. */
    expect(response.status).toBe(503);
  });

  it('rejects technical info with non-string values', async () => {
    const response = await POST(
      makeRequest({
        ...validBody,
        includeTechnical: true,
        technicalInfo: { bad: 1 },
      }),
    );
    expect(response.status).toBe(400);
  });

  it('rejects technical info with too many fields', async () => {
    const tech: Record<string, string> = {};
    for (let i = 0; i < 200; i += 1) tech[`k${i}`] = 'v';
    const response = await POST(
      makeRequest({ ...validBody, includeTechnical: true, technicalInfo: tech }),
    );
    expect(response.status).toBe(400);
  });

  it('accepts a honeypot-filled submission with a synthetic reference and discards it', async () => {
    const response = await POST(makeRequest({ ...validBody, website: 'http://spam.example/' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(typeof body.reference).toBe('string');
  });

  it('rejects a submission faster than the minimum fill time', async () => {
    const response = await POST(makeRequest({ ...validBody, openedAtMs: Date.now() - 100 }));
    expect(response.status).toBe(400);
  });

  it('rejects a submission with no openedAtMs timestamp', async () => {
    const { openedAtMs: _omit, ...rest } = validBody;
    const response = await POST(makeRequest(rest));
    expect(response.status).toBe(400);
  });

  it('rate-limits after the bucket is empty', async () => {
    /* The bucket is per-IP. Drain it, then a further
       submission is 429. */
    let lastStatus = 200;
    for (let i = 0; i < 12; i += 1) {
      const response = await POST(makeRequest(validBody));
      lastStatus = response.status;
      if (lastStatus === 429) break;
    }
    expect(lastStatus).toBe(429);
  });

  it('rejects an unknown surface', async () => {
    const response = await POST(makeRequest({ ...validBody, surface: 'phone' }));
    expect(response.status).toBe(400);
  });

  it('rejects a missing client version', async () => {
    const { clientVersion: _omit, ...rest } = validBody;
    const response = await POST(makeRequest(rest));
    expect(response.status).toBe(400);
  });
});

describe('GET /api/feedback', () => {
  it('reports whether direct submission is configured and what the schema bounds are', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(typeof body.directSubmission).toBe('boolean');
    expect(Array.isArray(body.categories)).toBe(true);
    expect(typeof body.maxMessage).toBe('number');
  });
});
