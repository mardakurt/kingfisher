import { createServer } from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import {
  CALLBACK_PREFIX,
  callbackPage,
  createBrowserSignIn,
  isAccountAuthorizeUrl,
  readCallback,
} from './browser-sign-in.mjs';

/**
 * The shell's decisions about a Google sign-in in the person's browser: which
 * URL it will open on the renderer's word, which request to its listener ends
 * the sign-in, and what the renderer is told. The round trip at the bottom
 * runs a real listener on loopback, with `fetch` standing in for the browser.
 */

const REDIRECT = `http://127.0.0.1:50123${CALLBACK_PREFIX}abc123`;

function authorize(overrides = {}) {
  const params = new URLSearchParams({
    provider: 'google',
    redirect_to: REDIRECT,
    code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    code_challenge_method: 's256',
    skip_http_redirect: 'true',
    ...overrides,
  });
  for (const [key, value] of Object.entries(overrides)) if (value === null) params.delete(key);
  return `https://abcdefgh.supabase.co/auth/v1/authorize?${params}`;
}

describe('which authorize URL the shell opens', () => {
  it('opens a Supabase Google authorize request that returns to this listener', () => {
    expect(isAccountAuthorizeUrl(authorize(), REDIRECT)).toBe(true);
    expect(isAccountAuthorizeUrl(authorize({ code_challenge_method: 'S256' }), REDIRECT)).toBe(
      true,
    );
    // A Supabase on this machine, in development.
    const local = authorize().replace('https://abcdefgh.supabase.co', 'http://127.0.0.1:54321');
    expect(isAccountAuthorizeUrl(local, REDIRECT)).toBe(true);
  });

  it('refuses everything else', () => {
    // Returns somewhere other than this sign-in's listener.
    expect(
      isAccountAuthorizeUrl(authorize({ redirect_to: 'https://evil.example/' }), REDIRECT),
    ).toBe(false);
    expect(
      isAccountAuthorizeUrl(
        authorize({ redirect_to: REDIRECT.replace('50123', '50124') }),
        REDIRECT,
      ),
    ).toBe(false);
    expect(
      isAccountAuthorizeUrl(
        authorize({ redirect_to: REDIRECT.replace('abc123', 'abc124') }),
        REDIRECT,
      ),
    ).toBe(false);
    expect(isAccountAuthorizeUrl(authorize({ redirect_to: null }), REDIRECT)).toBe(false);
    // Not Google, not PKCE.
    expect(isAccountAuthorizeUrl(authorize({ provider: 'github' }), REDIRECT)).toBe(false);
    expect(isAccountAuthorizeUrl(authorize({ code_challenge: null }), REDIRECT)).toBe(false);
    expect(isAccountAuthorizeUrl(authorize({ code_challenge_method: 'plain' }), REDIRECT)).toBe(
      false,
    );
    // Not the authorize endpoint, not HTTPS, not a URL.
    expect(
      isAccountAuthorizeUrl(authorize().replace('/auth/v1/authorize', '/auth/v1/verify'), REDIRECT),
    ).toBe(false);
    expect(isAccountAuthorizeUrl(authorize().replace('https:', 'http:'), REDIRECT)).toBe(false);
    expect(isAccountAuthorizeUrl(authorize().replace('https:', 'file:'), REDIRECT)).toBe(false);
    expect(
      isAccountAuthorizeUrl(authorize().replace('https://', 'https://user:pw@'), REDIRECT),
    ).toBe(false);
    expect(isAccountAuthorizeUrl('not a url', REDIRECT)).toBe(false);
  });
});

describe('which request to the listener ends the sign-in', () => {
  const expected = { host: '127.0.0.1:50123', path: `${CALLBACK_PREFIX}abc123` };
  const get = (url, host = expected.host) => readCallback({ method: 'GET', url, host }, expected);

  it('takes the code from its own path', () => {
    expect(get(`${expected.path}?code=34e770dd-9ff9-416c`)).toEqual({
      kind: 'code',
      code: '34e770dd-9ff9-416c',
    });
  });

  it('reports the provider error in Supabase’s words', () => {
    expect(get(`${expected.path}?error=access_denied&error_description=User+cancelled`)).toEqual({
      kind: 'error',
      message: 'User cancelled',
    });
    expect(get(`${expected.path}?error=server_error`)).toEqual({
      kind: 'error',
      message: 'server_error',
    });
    expect(get(`${expected.path}?code=${encodeURIComponent('<script>')}`).kind).toBe('error');
  });

  it('waits on its own path with nothing in the query', () => {
    expect(get(expected.path)).toEqual({ kind: 'pending' });
  });

  it('ignores another path, another nonce, another host and another method', () => {
    expect(get('/favicon.ico')).toEqual({ kind: 'ignore' });
    expect(get(`${CALLBACK_PREFIX}abc124?code=x`)).toEqual({ kind: 'ignore' });
    expect(get(`${expected.path}?code=x`, 'attacker.example:50123')).toEqual({ kind: 'ignore' });
    expect(get(`${expected.path}?code=x`, '127.0.0.1:50124')).toEqual({ kind: 'ignore' });
    expect(
      readCallback(
        { method: 'POST', url: `${expected.path}?code=x`, host: expected.host },
        expected,
      ),
    ).toEqual({ kind: 'ignore' });
  });

  it('escapes an error before writing it into the page', () => {
    expect(callbackPage('error', '<img src=x onerror=alert(1)>')).not.toContain('<img');
  });
});

describe('a sign-in, end to end on loopback', () => {
  let signIn;
  afterEach(() => signIn?.cancel());

  const make = (options = {}) => {
    const opened = [];
    let returned = 0;
    signIn = createBrowserSignIn({
      createServer,
      openExternal: async (url) => void opened.push(url),
      onReturn: () => (returned += 1),
      ...options,
    });
    return { opened, returns: () => returned };
  };

  it('opens the browser and hands the code to the renderer', async () => {
    const { opened, returns } = make();
    const { redirectUri } = await signIn.begin();
    expect(redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/auth\/desktop\/[0-9a-f]{48}$/);

    const url = authorize({ redirect_to: redirectUri });
    const outcome = signIn.open(url);
    expect(opened).toEqual([url]);

    // Another nonce on the same port is not this sign-in.
    const wrong = await fetch(
      `${redirectUri.replace(/[0-9a-f]{48}$/, 'f'.repeat(48))}?code=stolen`,
    );
    expect(wrong.status).toBe(404);
    expect(signIn.active).toBe(true);

    const page = await fetch(`${redirectUri}?code=the-code`);
    expect(page.status).toBe(200);
    expect(page.headers.get('referrer-policy')).toBe('no-referrer');
    expect(await page.text()).toContain('You can close this tab');

    await expect(outcome).resolves.toEqual({ status: 'code', code: 'the-code' });
    expect(returns()).toBe(1);
    expect(signIn.active).toBe(false);
    // The listener is gone once the sign-in has returned.
    await expect(fetch(`${redirectUri}?code=again`)).rejects.toThrow();
  });

  it('passes on a provider error', async () => {
    make();
    const { redirectUri } = await signIn.begin();
    const outcome = signIn.open(authorize({ redirect_to: redirectUri }));
    await fetch(`${redirectUri}?error=access_denied&error_description=Denied+by+user`);
    await expect(outcome).resolves.toEqual({ status: 'error', message: 'Denied by user' });
  });

  it('refuses a URL that is not this sign-in, and opens nothing', async () => {
    const { opened } = make();
    await signIn.begin();
    await expect(signIn.open('https://evil.example/phish')).resolves.toEqual({
      status: 'refused',
    });
    expect(opened).toEqual([]);
    expect(signIn.active).toBe(false);
    // And with no sign-in begun, there is nothing to open.
    await expect(signIn.open(authorize())).resolves.toEqual({ status: 'refused' });
  });

  it('opens a sign-in once', async () => {
    const { opened } = make();
    const { redirectUri } = await signIn.begin();
    const url = authorize({ redirect_to: redirectUri });
    void signIn.open(url);
    await expect(signIn.open(url)).resolves.toEqual({ status: 'refused' });
    expect(opened).toHaveLength(1);
  });

  it('a newer sign-in cancels the older one and closes its listener', async () => {
    make();
    const first = await signIn.begin();
    const outcome = signIn.open(authorize({ redirect_to: first.redirectUri }));
    const second = await signIn.begin();
    expect(second.redirectUri).not.toBe(first.redirectUri);
    await expect(outcome).resolves.toEqual({ status: 'canceled' });
    await expect(fetch(`${first.redirectUri}?code=late`)).rejects.toThrow();
  });

  it('cancels and times out', async () => {
    make({ timeoutMs: 50 });
    const { redirectUri } = await signIn.begin();
    await expect(signIn.open(authorize({ redirect_to: redirectUri }))).resolves.toEqual({
      status: 'timeout',
    });

    make();
    const again = await signIn.begin();
    const outcome = signIn.open(authorize({ redirect_to: again.redirectUri }));
    signIn.cancel();
    await expect(outcome).resolves.toEqual({ status: 'canceled' });
  });

  it('reports a browser that could not be opened', async () => {
    make({
      openExternal: async () => {
        throw new Error('no handler');
      },
    });
    const { redirectUri } = await signIn.begin();
    await expect(signIn.open(authorize({ redirect_to: redirectUri }))).resolves.toEqual({
      status: 'error',
      message: 'Kingfisher could not open your browser: no handler',
    });
  });
});
