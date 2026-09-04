import { describe, expect, it, vi } from 'vitest';

import {
  authorizeUrl,
  codeChallenge,
  exchangeCode,
  LichessAuthError,
  LICHESS_AUTHORIZE_URL,
  LICHESS_SCOPES,
  LICHESS_TOKEN_ENDPOINT,
  lichessClientId,
  randomVerifier,
  readCallback,
  revokeToken,
  type PkceRequest,
} from './lichess-pkce';

/**
 * The whole point of PKCE for a client with no backend is that the security
 * rests on two things: a verifier that never leaves this browser until the
 * exchange, and a `state` that proves the response answers *this* request.
 * Both are checked here, along with every way the authorization server can say
 * no — because an OAuth flow that only works when everything goes right is an
 * OAuth flow that strands people.
 *
 * A live authenticated round trip against lichess.org is not run here and
 * cannot be: it needs a human to approve a consent screen. What is contract-
 * tested is every byte Kingfisher sends and every response shape it accepts.
 */

const REQUEST: PkceRequest = {
  state: 'state-abc',
  codeVerifier: 'verifier-xyz',
  codeChallenge: 'challenge-123',
  redirectUri: 'http://localhost:3210/oauth/lichess',
  clientId: 'http://localhost:3210/',
  createdAt: 1,
};

describe('the PKCE verifier and challenge', () => {
  it('produces a verifier of the length and alphabet RFC 7636 requires', () => {
    for (const length of [43, 64, 128]) {
      const verifier = randomVerifier(length);
      expect(verifier).toHaveLength(length);
      expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
    }
  });

  it('produces a different verifier every time', () => {
    const seen = new Set(Array.from({ length: 50 }, () => randomVerifier()));
    expect(seen.size).toBe(50);
  });

  it('derives an S256 challenge that is base64url with no padding', async () => {
    const challenge = await codeChallenge('verifier-xyz');
    expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/);
    expect(challenge).not.toContain('=');
    // Deterministic: the same verifier must always produce the same challenge,
    // or the exchange would fail after a page reload.
    expect(await codeChallenge('verifier-xyz')).toBe(challenge);
    expect(await codeChallenge('another')).not.toBe(challenge);
  });
});

describe('the authorization request', () => {
  it('goes to Lichess with S256 and no secret', () => {
    const url = new URL(authorizeUrl(REQUEST));
    expect(`${url.origin}${url.pathname}`).toBe(LICHESS_AUTHORIZE_URL);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe(REQUEST.codeChallenge);
    expect(url.searchParams.get('state')).toBe(REQUEST.state);
    expect(url.searchParams.get('redirect_uri')).toBe(REQUEST.redirectUri);
    expect(url.searchParams.get('client_id')).toBe(REQUEST.clientId);
    // A public client has no secret to send, and must never invent one.
    expect(url.search).not.toMatch(/client_secret/);
  });

  it('asks for no scopes, and sends no empty scope parameter', () => {
    expect(LICHESS_SCOPES).toEqual([]);
    expect(new URL(authorizeUrl(REQUEST)).searchParams.has('scope')).toBe(false);
  });

  it('identifies the client by its own origin', () => {
    expect(lichessClientId('https://example.test')).toBe('https://example.test/');
  });
});

describe('reading the callback', () => {
  const params = (query: string) => new URLSearchParams(query);

  it('accepts a matching state', () => {
    const result = readCallback(params('code=abc&state=state-abc'), REQUEST);
    expect(result.code).toBe('abc');
    expect(result.request).toBe(REQUEST);
  });

  it('refuses a mismatched state rather than repairing it', () => {
    expect(() => readCallback(params('code=abc&state=someone-elses'), REQUEST)).toThrow(
      /did not match the request/,
    );
  });

  it('refuses a code when no sign-in is in progress', () => {
    expect(() => readCallback(params('code=abc&state=state-abc'), null)).toThrow(
      /no sign-in in progress/,
    );
  });

  it('reports a cancelled sign-in as cancelled, not as a failure', () => {
    try {
      readCallback(params('error=access_denied'), REQUEST);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(LichessAuthError);
      expect((error as LichessAuthError).message).toMatch(/cancelled/);
      expect((error as LichessAuthError).remedy).toMatch(/Nothing was changed/);
    }
  });

  it('passes on the reason when Lichess refuses for another reason', () => {
    expect(() =>
      readCallback(params('error=invalid_request&error_description=bad+redirect'), REQUEST),
    ).toThrow(/bad redirect/);
  });

  it('says something useful when the page is opened directly', () => {
    expect(() => readCallback(params(''), REQUEST)).toThrow(/without a Lichess authorization code/);
  });
});

describe('exchanging the code', () => {
  it('sends the verifier and no secret, and returns the token', async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body.grant_type).toBe('authorization_code');
      expect(body.code).toBe('the-code');
      expect(body.code_verifier).toBe(REQUEST.codeVerifier);
      expect(body.redirect_uri).toBe(REQUEST.redirectUri);
      expect(body.client_id).toBe(REQUEST.clientId);
      expect(body).not.toHaveProperty('client_secret');
      return new Response(
        JSON.stringify({ access_token: 'lio_token', token_type: 'Bearer', expires_in: 3600 }),
      );
    });

    const token = await exchangeCode('the-code', REQUEST, fetcher as unknown as typeof fetch);
    expect(token.accessToken).toBe('lio_token');
    expect(token.expiresIn).toBe(3600);
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(LICHESS_TOKEN_ENDPOINT);
  });

  it('reports a rate limit as a rate limit', async () => {
    const fetcher = (async () => new Response('', { status: 429 })) as typeof fetch;
    await expect(exchangeCode('c', REQUEST, fetcher)).rejects.toThrow(/rate limiting/);
  });

  it('passes on the reason Lichess gave for refusing', async () => {
    const fetcher = (async () =>
      new Response(
        JSON.stringify({ error: 'invalid_grant', error_description: 'code already used' }),
        { status: 400 },
      )) as typeof fetch;
    await expect(exchangeCode('c', REQUEST, fetcher)).rejects.toThrow(/code already used/);
  });

  it('survives an error body that is not JSON', async () => {
    const fetcher = (async () => new Response('<html>502</html>', { status: 502 })) as typeof fetch;
    await expect(exchangeCode('c', REQUEST, fetcher)).rejects.toThrow(/HTTP 502/);
  });

  it('refuses a 200 that carries no token', async () => {
    const fetcher = (async () => new Response(JSON.stringify({ ok: true }))) as typeof fetch;
    await expect(exchangeCode('c', REQUEST, fetcher)).rejects.toThrow(/no access token/);
  });
});

describe('revoking', () => {
  it('deletes the token at Lichess', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response('', { status: 204 });
    }) as typeof fetch;

    await revokeToken('lio_token', fetcher);
    expect(calls[0]?.url).toBe(LICHESS_TOKEN_ENDPOINT);
    expect(calls[0]?.init.method).toBe('DELETE');
    expect(calls[0]?.init.headers).toMatchObject({ Authorization: 'Bearer lio_token' });
  });

  it('does not throw when Lichess cannot be reached', async () => {
    const fetcher = (async () => {
      throw new Error('offline');
    }) as typeof fetch;
    // The caller has already forgotten the token locally; a failed revoke must
    // not turn "disconnected" into an error dialog.
    await expect(revokeToken('lio_token', fetcher)).resolves.toBeUndefined();
  });
});
