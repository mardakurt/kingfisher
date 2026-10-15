import { createHash } from 'node:crypto';

import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test';

/**
 * "Continue with Google" in the Mac application, from the renderer's side.
 *
 * Google refuses OAuth in an embedded window, so the shell opens the authorize
 * URL in the person's browser and returns the code over a loopback listener
 * (`desktop/src/browser-sign-in.mjs`, tested on a real listener in its own
 * suite and in the packaged application by `desktop:smoke`). This file runs
 * the other half with the real supabase-js: the renderer must generate the
 * PKCE pair itself, hand the shell an authorize URL that returns to the
 * listener the shell named, and exchange the code with the verifier that
 * matches the challenge it sent — which the stubbed token endpoint checks, so
 * a renderer that sent a different verifier cannot pass.
 *
 * The bridge is a stub with the shape of `window.kingfisher`; only the
 * transport to Supabase is replaced, as in `account-sync.spec.ts`.
 */

const CLOUD = 'http://127.0.0.1:54398';
const REDIRECT =
  'http://127.0.0.1:59999/auth/desktop/0123456789abcdef0123456789abcdef0123456789abcdef';
const USER_ID = '00000000-0000-4000-8000-0000000e2e02';
const EMAIL = 'google-player@example.test';
const CODE = 'e2e-auth-code';

function jwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`;
}

const user = {
  id: USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: EMAIL,
  email_confirmed_at: '2026-10-15T00:00:00Z',
  confirmed_at: '2026-10-15T00:00:00Z',
  app_metadata: { provider: 'google', providers: ['google'] },
  user_metadata: { full_name: 'Google Player' },
  identities: [{ id: USER_ID, provider: 'google' }],
  created_at: '2026-10-15T00:00:00Z',
  updated_at: '2026-10-15T00:00:00Z',
};

function session() {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: jwt({
      sub: USER_ID,
      role: 'authenticated',
      aud: 'authenticated',
      exp: expiresAt,
    }),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expiresAt,
    refresh_token: 'refresh-token',
    user,
  };
}

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*', 'content-range': '0-0/*' },
    body: JSON.stringify(body),
  });

interface Exchange {
  authCode: string;
  verifierMatchesChallenge: boolean;
}

/** The Supabase endpoints this flow touches, plus a bridge stub that records what the shell is asked. */
async function setUp(context: BrowserContext, challenges: string[], exchanges: Exchange[]) {
  await context.addInitScript(
    ([cloud, redirect]) => {
      (window as { __kingfisherCloudConfig?: unknown }).__kingfisherCloudConfig = {
        url: cloud,
        key: 'sb_publishable_e2e',
      };
      const shell = {
        opened: [] as string[],
        canceled: 0,
        settle: null as null | ((outcome: unknown) => void),
      };
      (window as unknown as { __shell: typeof shell }).__shell = shell;
      const stub = new Proxy(
        {
          platform: 'desktop',
          os: 'darwin',
          version: null,
          windowChrome: null,
          companion: { url: null, token: null },
          browserSignIn: {
            begin: async () => ({ redirectUri: redirect }),
            open: (url: string) =>
              new Promise((resolve) => {
                shell.opened.push(url);
                shell.settle = resolve;
              }),
            cancel: () => {
              shell.canceled += 1;
              shell.settle?.({ status: 'canceled' });
            },
          },
        } as Record<string, unknown>,
        // Every other bridge method is a subscription that is never fired.
        { get: (target, key) => (key in target ? target[key as string] : () => () => {}) },
      );
      Object.defineProperty(window, 'kingfisher', { configurable: true, get: () => stub });
    },
    [CLOUD, REDIRECT],
  );
  await context.route(`${CLOUD}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        },
      });
    }
    if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'pkce') {
      const body = request.postDataJSON() as { auth_code: string; code_verifier: string };
      const challenge = createHash('sha256').update(body.code_verifier).digest('base64url');
      const matches = challenges.includes(challenge);
      exchanges.push({ authCode: body.auth_code, verifierMatchesChallenge: matches });
      if (body.auth_code !== CODE || !matches) {
        return json(route, 400, {
          code: 400,
          error_code: 'bad_code_verifier',
          msg: 'code challenge does not match previously saved code verifier',
        });
      }
      return json(route, 200, session());
    }
    if (url.pathname === '/auth/v1/token') return json(route, 200, session());
    if (url.pathname === '/auth/v1/settings')
      return json(route, 200, { external: { email: true, google: true } });
    if (url.pathname === '/auth/v1/user') return json(route, 200, user);
    if (url.pathname === '/auth/v1/logout')
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
    if (url.pathname === '/rest/v1/rpc/push_user_records') return json(route, 200, []);
    if (url.pathname.startsWith('/rest/v1/')) return json(route, 200, []);
    return json(route, 404, { message: `stub has no ${request.method()} ${url.pathname}` });
  });
}

const opened = (page: Page) =>
  page.evaluate(() => (window as unknown as { __shell: { opened: string[] } }).__shell.opened);

const returnFromBrowser = (page: Page, outcome: unknown) =>
  page.evaluate((value) => {
    (window as unknown as { __shell: { settle: (o: unknown) => void } }).__shell.settle(value);
  }, outcome);

test.describe('Google sign-in in the Mac application', () => {
  test('opens Google in the browser and signs in with the code it returns', async ({
    context,
    page,
  }) => {
    const challenges: string[] = [];
    const exchanges: Exchange[] = [];
    await setUp(context, challenges, exchanges);
    await page.goto('/sign-in?next=%2Faccount');

    const google = page.getByRole('button', { name: 'Continue with Google' });
    await expect(google).toBeEnabled();
    await google.click();
    await expect(page.getByRole('status').filter({ hasText: 'in your browser' })).toBeVisible();

    // The shell was asked to open exactly one Supabase authorize URL, for
    // Google, carrying a PKCE challenge and returning to the shell's listener.
    await expect.poll(() => opened(page).then((urls) => urls.length)).toBe(1);
    const authorize = new URL((await opened(page))[0]!);
    expect(authorize.origin + authorize.pathname).toBe(`${CLOUD}/auth/v1/authorize`);
    expect(authorize.searchParams.get('provider')).toBe('google');
    expect(authorize.searchParams.get('redirect_to')).toBe(REDIRECT);
    expect(authorize.searchParams.get('code_challenge_method')).toBe('s256');
    challenges.push(authorize.searchParams.get('code_challenge')!);

    await returnFromBrowser(page, { status: 'code', code: CODE });
    await expect(page).toHaveURL(/\/account$/);
    expect(exchanges).toEqual([{ authCode: CODE, verifierMatchesChallenge: true }]);
  });

  test('cancelling the wait leaves the person signed out, in plain words', async ({
    context,
    page,
  }) => {
    await setUp(context, [], []);
    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'cancelled' })).toHaveText(
      'Google sign-in was cancelled.',
    );
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test('a provider error from the browser is shown, and nothing is exchanged', async ({
    context,
    page,
  }) => {
    const exchanges: Exchange[] = [];
    await setUp(context, [], exchanges);
    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await expect.poll(() => opened(page).then((urls) => urls.length)).toBe(1);
    await returnFromBrowser(page, { status: 'error', message: 'Access was denied.' });
    await expect(page.getByRole('alert').filter({ hasText: 'denied' })).toHaveText(
      'Access was denied.',
    );
    expect(exchanges).toEqual([]);
  });
});
