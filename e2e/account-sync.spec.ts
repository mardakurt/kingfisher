import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test';

/**
 * Accounts and cloud sync, in the real application with the real supabase-js.
 *
 * Only the transport is replaced: Supabase's HTTP endpoints are answered by an
 * in-process stub with the same compare-and-swap rule as the migration's
 * `push_user_records`. The SQL, the policies and the engine's handling of
 * conflicts are proved against a real Postgres in `src/sync/cloud/*.test.ts`;
 * this file proves the screens, the triggers and the wiring between a write
 * in the Studio and an upload, and a sign-in on a second browser and a
 * download.
 *
 * The project is named through `window.__kingfisherCloudConfig`, a hook that
 * exists only outside production builds (`supabase-client.ts`).
 */

const READY = 'html[data-kingfisher-ready="true"]';
const CLOUD = 'http://127.0.0.1:54399';
const USER_ID = '00000000-0000-4000-8000-0000000e2e01';
const EMAIL = 'player@example.test';
const PASSWORD = 'correct horse battery';

interface Row {
  store: string;
  record_key: string;
  value: unknown;
  content_hash: string;
  revision: number;
  seq: number;
  device_id: string | null;
  deleted_at: string | null;
}

/** The account's rows, shared by every browser context in a test, as the real project would be. */
class StubCloud {
  rows: Row[] = [];
  seq = 0;
  pushes = 0;

  find(store: string, key: string) {
    return this.rows.find((row) => row.store === store && row.record_key === key);
  }

  push(
    changes: {
      store: string;
      key: string;
      value: unknown;
      hash: string;
      base: number;
      device: string;
    }[],
  ) {
    this.pushes += 1;
    return changes.map((change) => {
      const existing = this.find(change.store, change.key);
      if (!existing) {
        if (change.value === null && change.base === 0)
          return { store: change.store, key: change.key, status: 'absent' };
        const row: Row = {
          store: change.store,
          record_key: change.key,
          value: change.value,
          content_hash: change.hash,
          revision: 1,
          seq: ++this.seq,
          device_id: change.device,
          deleted_at: change.value === null ? new Date().toISOString() : null,
        };
        this.rows.push(row);
        return {
          store: row.store,
          key: row.record_key,
          status: 'applied',
          revision: 1,
          seq: row.seq,
        };
      }
      if (
        existing.content_hash === change.hash &&
        (existing.value === null) === (change.value === null)
      ) {
        return {
          store: existing.store,
          key: existing.record_key,
          status: 'unchanged',
          revision: existing.revision,
          seq: existing.seq,
        };
      }
      if (existing.revision !== change.base) {
        return {
          store: existing.store,
          key: existing.record_key,
          status: 'conflict',
          revision: existing.revision,
          seq: existing.seq,
          hash: existing.content_hash,
          value: existing.value,
          deleted: existing.value === null,
          device: existing.device_id,
        };
      }
      Object.assign(existing, {
        value: change.value,
        content_hash: change.hash,
        revision: existing.revision + 1,
        seq: ++this.seq,
        device_id: change.device,
        deleted_at: change.value === null ? new Date().toISOString() : null,
      });
      return {
        store: existing.store,
        key: existing.record_key,
        status: 'applied',
        revision: existing.revision,
        seq: existing.seq,
      };
    });
  }

  live(store: string) {
    return this.rows.filter((row) => row.store === store && row.value !== null);
  }
}

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
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  identities: [{ id: USER_ID, provider: 'email' }],
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
      email: EMAIL,
    }),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expiresAt,
    refresh_token: 'refresh-token',
    user,
  };
}

const json = (route: Route, status: number, body: unknown, headers: Record<string, string> = {}) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*', ...headers },
    body: JSON.stringify(body),
  });

async function serveCloud(
  context: BrowserContext,
  cloud: StubCloud,
  options: { confirmSignUp?: boolean; google?: boolean } = {},
) {
  await context.addInitScript(
    ([url]) => {
      (window as { __kingfisherCloudConfig?: unknown }).__kingfisherCloudConfig = {
        url,
        key: 'sb_publishable_e2e',
      };
    },
    [CLOUD],
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
    const path = url.pathname;
    if (path === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
      const body = request.postDataJSON() as { email: string; password: string };
      if (body.email !== EMAIL || body.password !== PASSWORD) {
        return json(route, 400, {
          code: 400,
          error_code: 'invalid_credentials',
          msg: 'Invalid login credentials',
        });
      }
      return json(route, 200, session());
    }
    if (path === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token')
      return json(route, 200, session());
    if (path === '/auth/v1/signup') {
      return options.confirmSignUp
        ? json(route, 200, { ...user, email_confirmed_at: null, confirmed_at: null })
        : json(route, 200, session());
    }
    if (path === '/auth/v1/settings') {
      return json(route, 200, { external: { email: true, google: options.google ?? false } });
    }
    if (path === '/auth/v1/user') return json(route, 200, user);
    if (path === '/auth/v1/logout')
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
    if (path === '/rest/v1/rpc/push_user_records') {
      const body = request.postDataJSON() as { changes: Parameters<StubCloud['push']>[0] };
      return json(route, 200, cloud.push(body.changes));
    }
    if (path === '/rest/v1/user_records' && request.method() === 'GET') {
      const seqFilter = url.searchParams.get('seq');
      const after = seqFilter?.startsWith('gt.') ? Number(seqFilter.slice(3)) : -1;
      const storeFilter = url.searchParams.get('store');
      const keyFilter = url.searchParams.get('record_key');
      let rows = [...cloud.rows].sort((a, b) => a.seq - b.seq).filter((row) => row.seq > after);
      if (storeFilter?.startsWith('eq.'))
        rows = rows.filter((row) => row.store === storeFilter.slice(3));
      if (keyFilter?.startsWith('in.(')) {
        const keys = keyFilter
          .slice(4, -1)
          .split(',')
          .map((key) => key.replace(/^"|"$/g, ''));
        rows = rows.filter((row) => keys.includes(row.record_key));
      }
      const range = request.headers()['range'];
      if (range) {
        const [from, to] = range.split('-').map(Number);
        rows = rows.slice(from, (to ?? rows.length) + 1);
      }
      return json(route, 200, rows, { 'content-range': `0-${Math.max(rows.length - 1, 0)}/*` });
    }
    if (path.startsWith('/rest/v1/profiles')) return json(route, 200, []);
    return json(route, 404, { message: `stub has no ${request.method()} ${path}` });
  });
}

async function createStudy(page: Page, title: string): Promise<string> {
  await page.waitForFunction(() =>
    Boolean((globalThis as { __kingfisher?: unknown }).__kingfisher),
  );
  return page.evaluate(async (name) => {
    const handle = (
      globalThis as unknown as {
        __kingfisher: { studies: { create(input: { title: string }): Promise<{ id: string }> } };
      }
    ).__kingfisher;
    return (await handle.studies.create({ title: name })).id;
  }, title);
}

async function signIn(page: Page, next = '/account') {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test.describe('accounts', () => {
  test('a wrong password is refused in plain words', async ({ context, page }) => {
    await serveCloud(context, new StubCloud());
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill(EMAIL);
    await page.getByLabel('Password', { exact: true }).fill('not the password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'do not match' })).toHaveText(
      'That email and password do not match an account.',
    );
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test('Google is offered only when the project has switched it on', async ({ browser }) => {
    for (const google of [false, true]) {
      const context = await browser.newContext();
      await serveCloud(context, new StubCloud(), { google });
      const page = await context.newPage();
      const settings = page.waitForResponse((response) =>
        response.url().endsWith('/auth/v1/settings'),
      );
      await page.goto('/sign-in');
      await expect(page.getByLabel('Email')).toBeVisible();
      const button = page.getByRole('button', { name: 'Continue with Google' });
      // Absence is only meaningful once the settings have answered.
      await settings;
      if (google) await expect(button).toBeVisible();
      else await expect(button).toHaveCount(0);
      await context.close();
    }
  });

  test('the account page sends a signed-out visitor to sign in', async ({ context, page }) => {
    await serveCloud(context, new StubCloud());
    await page.goto('/account');
    await expect(page).toHaveURL(/\/sign-in\?next=%2Faccount|\/sign-in\?next=\/account/);
  });

  test('sign-up with confirmation on says to check the email', async ({ context, page }) => {
    await serveCloud(context, new StubCloud(), { confirmSignUp: true });
    await page.goto('/sign-up');
    await page.getByLabel('Email').fill('new@example.test');
    await page.getByLabel('Password', { exact: true }).fill('a long enough password');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  });

  test('work made before signing in is uploaded only after the person agrees, and later edits follow', async ({
    context,
    page,
  }) => {
    const cloud = new StubCloud();
    await serveCloud(context, cloud);
    await page.goto('/studies');
    await page.locator(READY).waitFor();
    const before = await createStudy(page, 'Prepared before the account');

    await signIn(page);
    const dialog = page.getByRole('dialog', { name: 'Add this device’s work to your account?' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('1 study');
    expect(cloud.pushes).toBe(0);

    await dialog.getByRole('button', { name: 'Add to my account' }).click();
    await expect(page.getByRole('status').filter({ hasText: /^Synced/ })).toBeVisible();
    expect(cloud.live('studies').map((row) => row.record_key)).toEqual([before]);
    // Signed in, /account is a Studio page: its header carries the shared controls.
    const header = page.locator('[data-page-header]');
    await expect(header.getByRole('button', { name: 'Search commands' })).toBeVisible();
    await expect(header.getByRole('button', { name: 'Settings' })).toBeVisible();
    expect(cloud.live('preferences')).toHaveLength(0);

    // A write anywhere in the Studio reaches the account without a save button.
    const after = await createStudy(page, 'Made while signed in');
    await expect
      .poll(() =>
        cloud
          .live('studies')
          .map((row) => row.record_key)
          .sort(),
      )
      .toEqual([before, after].sort());

    // Sign out, keeping this device's copy.
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page
      .getByRole('dialog', { name: 'Sign out' })
      .getByRole('button', { name: 'Sign out' })
      .click();
    await expect(page).toHaveURL(/\/sign-in/);
    await page.goto('/studies');
    await page.locator(READY).waitFor();
    await page.waitForFunction(() =>
      Boolean((globalThis as { __kingfisher?: unknown }).__kingfisher),
    );
    const kept = await page.evaluate(async () => {
      const handle = (
        globalThis as unknown as {
          __kingfisher: { studies: { list(): Promise<{ title: string }[]> } };
        }
      ).__kingfisher;
      return (await handle.studies.list()).map((study) => study.title).sort();
    });
    expect(kept).toEqual(['Made while signed in', 'Prepared before the account']);
  });

  test('a second browser that signs in receives the account’s work', async ({ browser }) => {
    const cloud = new StubCloud();

    const laptop = await browser.newContext();
    await serveCloud(laptop, cloud);
    const first = await laptop.newPage();
    await signIn(first);
    await expect(first.getByRole('status').filter({ hasText: /^Synced/ })).toBeVisible();
    await first.goto('/studies');
    await first.locator(READY).waitFor();
    await createStudy(first, 'Najdorf notes from the laptop');
    await expect.poll(() => cloud.live('studies').length).toBe(1);
    await laptop.close();

    const desktop = await browser.newContext();
    await serveCloud(desktop, cloud);
    const second = await desktop.newPage();
    await signIn(second, '/studies');
    await expect(second).toHaveURL(/\/studies/);
    await expect(
      second.getByRole('heading', { name: 'Najdorf notes from the laptop' }),
    ).toBeVisible();
    await desktop.close();
  });

  test('My games travels only between devices that switched it on', async ({ browser }) => {
    const cloud = new StubCloud();
    const gameCount = (page: Page) =>
      page.evaluate(async () => {
        const handle = (
          globalThis as unknown as { __kingfisher: { games: { count(): Promise<number> } } }
        ).__kingfisher;
        return handle.games.count();
      });

    const laptop = await browser.newContext();
    await serveCloud(laptop, cloud);
    const first = await laptop.newPage();
    await signIn(first);
    await expect(first.getByRole('status').filter({ hasText: /^Synced/ })).toBeVisible();
    const sync = first.getByRole('switch', {
      name: 'Sync My games and collections on this device',
    });
    await expect(sync).toHaveAttribute('aria-checked', 'false');
    await first.waitForFunction(() =>
      Boolean((globalThis as { __kingfisher?: unknown }).__kingfisher),
    );
    await first.evaluate(async () => {
      const handle = (
        globalThis as unknown as {
          __kingfisher: {
            games: unknown;
            importGames(pgn: string, games: unknown): Promise<unknown>;
          };
        }
      ).__kingfisher;
      await handle.importGames(
        '[White "Laptop, L"]\n[Black "Opponent, O"]\n[Result "1-0"]\n\n1. d4 d5 2. c4 1-0',
        handle.games,
      );
    });
    // Off: an imported game stays on the laptop.
    await first.waitForTimeout(2_500);
    expect(cloud.live('myGames')).toHaveLength(0);

    await sync.click();
    await expect(sync).toHaveAttribute('aria-checked', 'true');
    await expect.poll(() => cloud.live('myGames').length, { timeout: 15_000 }).toBe(1);
    await laptop.close();

    const desktop = await browser.newContext();
    await serveCloud(desktop, cloud);
    const second = await desktop.newPage();
    await signIn(second);
    await expect(second.getByRole('status').filter({ hasText: /^Synced/ })).toBeVisible();
    await second.waitForFunction(() =>
      Boolean((globalThis as { __kingfisher?: unknown }).__kingfisher),
    );
    // Not switched on here: the game does not arrive.
    expect(await gameCount(second)).toBe(0);

    await second
      .getByRole('switch', { name: 'Sync My games and collections on this device' })
      .click();
    await expect.poll(() => gameCount(second), { timeout: 15_000 }).toBe(1);
    await desktop.close();
  });

  test('Settings names the Kingfisher account alongside Lichess and Chess.com', async ({
    context,
    page,
  }) => {
    await serveCloud(context, new StubCloud());
    await signIn(page);
    await expect(page.getByRole('status').filter({ hasText: /^Synced/ })).toBeVisible();
    await page.locator('[data-page-header]').getByRole('button', { name: 'Settings' }).click();
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await settings.getByRole('tab', { name: 'Accounts' }).click();
    const account = settings.locator('[data-kingfisher-account]');
    await expect(account).toContainText(`Signed in as ${EMAIL}.`);
    await account.getByRole('link', { name: 'Open your account' }).click();
    await expect(settings).toBeHidden();
    await expect(page).toHaveURL(/\/account$/);
  });
});
