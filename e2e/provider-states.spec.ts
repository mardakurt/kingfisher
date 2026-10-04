import { expect, test, type Page, type Route } from '@playwright/test';

import { isNavigationAbortNoise, selectTool } from './tools';
import { settingsButton } from './support/settings-control';

/**
 * What the explorer says when an authenticated provider fails, one failure
 * class at a time, in the real panel.
 *
 * The provider's unit tests prove each HTTP answer becomes the right
 * `DatabaseError`. They cannot prove the panel then tells a person which of
 * these happened: unauthorized, rate limited, down, unreadable, slow, or
 * simply empty. Those call for different actions — reconnect, wait, retry,
 * or accept that nothing was played — and a panel that rendered all of them
 * as "no evidence" would send a player the wrong way. Nor can they prove a
 * late answer for the position just left stays off the position now shown.
 *
 * Faults are injected at the network boundary only; the provider, the query
 * cache and the panel are the shipped ones. The token is a fake, so nothing
 * reaches Lichess.
 */

type Mode =
  | 'ok'
  | 'empty'
  | 'malformed'
  | 'schema'
  | 'revoked'
  | 'denied'
  | 'rate-limited'
  | 'down'
  | 'unreachable'
  | 'hang';

const OK_BODY = (san: string, uci: string) => ({
  white: 30,
  draws: 20,
  black: 10,
  moves: [
    {
      uci,
      san,
      white: 30,
      draws: 20,
      black: 10,
      averageRating: 2600,
      opening: null,
    },
  ],
  topGames: [],
});

function watchConsole(page: Page, browserName: string) {
  const failures: string[] = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    /*
      A refused request is the point of this test, and each browser logs it in
      its own words: Chrome "Failed to load resource", Firefox "CORS request did
      not succeed" (its name for a cross-origin request that never got an HTTP
      answer), WebKit "Load failed".
    */
    if (
      /Failed to load resource|status of (401|403|429|503)|ERR_FAILED|NetworkError|CORS request did not succeed|Load failed|Could not connect to the server/.test(
        text,
      )
    )
      return;
    if (!isNavigationAbortNoise(text, browserName)) failures.push(text);
  });
  page.on('pageerror', (error) => {
    // A reload cancels in-flight fetches; WebKit raises those as page errors.
    if (!isNavigationAbortNoise(error.message, browserName))
      failures.push(`pageerror: ${error.message}`);
  });
  return failures;
}

async function play(page: Page, from: string, to: string) {
  await page.getByRole('gridcell', { name: new RegExp(`^${from},`) }).click();
  await page.getByRole('gridcell', { name: new RegExp(`^${to},`) }).click();
}

async function connectFakeToken(page: Page, { remember = false } = {}) {
  await page.route('https://lichess.org/api/account', (route) =>
    route.fulfill({ json: { id: 'e2e-user', username: 'E2EUser' } }),
  );
  await settingsButton(page).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('tab', { name: 'Accounts' }).click();
  await settings.getByRole('button', { name: /personal access token/ }).click();
  await settings.getByLabel('Lichess personal access token').fill('e2e-token');
  // A pasted token is kept across a reload only when asked; a sign-in always asks.
  if (remember) await settings.getByLabel('Remember this token on this device').check();
  await settings.getByRole('button', { name: 'Test connection' }).click();
  await expect(settings.getByText('Connected as E2EUser')).toBeVisible();
  await settings.getByRole('button', { name: 'Close' }).click();
}

test('each Lichess failure class is named in the panel, and the source recovers', async ({
  page,
  browserName,
}) => {
  test.setTimeout(120_000);
  const consoleFailures = watchConsole(page, browserName);
  let mode: Mode = 'ok';
  const requests: { fen: string; mode: Mode }[] = [];
  await page.route('https://explorer.lichess.org/masters**', async (route: Route) => {
    const fen = new URL(route.request().url()).searchParams.get('fen') ?? '';
    const current = mode;
    requests.push({ fen, mode: current });
    switch (current) {
      case 'ok':
        return route.fulfill({ json: OK_BODY('h3', 'h2h3') });
      case 'empty':
        return route.fulfill({ json: { white: 0, draws: 0, black: 0, moves: [], topGames: [] } });
      case 'malformed':
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: '{"white": 3,',
        });
      case 'schema':
        return route.fulfill({ json: { totally: 'different' } });
      case 'revoked':
        return route.fulfill({ status: 401, body: '' });
      case 'denied':
        return route.fulfill({ status: 403, body: '' });
      case 'rate-limited':
        return route.fulfill({ status: 429, headers: { 'retry-after': '60' }, body: '' });
      case 'down':
        return route.fulfill({ status: 503, body: '' });
      case 'unreachable':
        return route.abort('connectionrefused');
      case 'hang':
        return; // never answered: the provider's own deadline must end it
    }
  });

  await page.goto('/analysis');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByRole('button', { name: 'New analysis' }).first().click();
  await connectFakeToken(page);
  await selectTool(page, page.getByRole('complementary', { name: 'Workspace tools' }), 'Explorer');
  const source = page.getByLabel('Evidence source');
  await source.selectOption('lichess-masters');
  const panel = page.locator('[data-explorer-table]');
  await expect(panel.getByRole('button', { name: 'h3', exact: true })).toBeVisible();

  /*
    One fresh position per failure class: each answer is cached under its
    position, so revisiting would show the cache rather than the panel's
    handling of a new answer. The moves are a Ruy Lopez, and none of them is
    the `h3` the healthy answer suggests, so a prefetch of `h3` warms a
    position this walk never enters.
  */
  const steps: { mode: Mode; move: [string, string]; expectText: RegExp }[] = [
    { mode: 'empty', move: ['e2', 'e4'], expectText: /No games reach this position\./ },
    { mode: 'malformed', move: ['e7', 'e5'], expectText: /could not read/ },
    { mode: 'schema', move: ['g1', 'f3'], expectText: /unexpected explorer response/ },
    { mode: 'revoked', move: ['b8', 'c6'], expectText: /rejected the configured API token/ },
    { mode: 'denied', move: ['f1', 'b5'], expectText: /denied this explorer request/ },
    { mode: 'rate-limited', move: ['a7', 'a6'], expectText: /rate limiting this session/ },
    { mode: 'down', move: ['b5', 'a4'], expectText: /returned HTTP 503/ },
    { mode: 'unreachable', move: ['g8', 'f6'], expectText: /could not be reached/ },
    { mode: 'hang', move: ['e1', 'g1'], expectText: /did not respond/ },
  ];

  for (const step of steps) {
    mode = step.mode;
    const before = requests.length;
    await play(page, step.move[0], step.move[1]);
    await expect.poll(() => requests.length, { message: step.mode }).toBeGreaterThan(before);
    if (step.mode === 'hang') {
      // While it waits it says what it is waiting for, rather than "no games".
      await expect(page.getByText('Reading Lichess Masters…')).toBeVisible();
    }
    /*
      A stalled connection is a network-class failure, which the provider
      retries exactly once (`database/retry.ts`): two 8-second deadlines and a
      2-second backoff, about 18 seconds of an honest "Reading…", then the
      error. Bounded, and never a spinner that waits for ever.
    */
    await expect(page.getByText(step.expectText).first(), step.mode).toBeVisible({
      timeout: step.mode === 'hang' ? 25_000 : 10_000,
    });
    if (step.mode === 'hang') {
      const fen = requests[requests.length - 1]!.fen;
      expect(requests.filter((entry) => entry.fen === fen && entry.mode === 'hang')).toHaveLength(
        2,
      );
    }
    // Never quietly answered by another population, and never a healthy table.
    await expect(source).toHaveValue('lichess-masters');
    await expect(panel, step.mode).toHaveCount(0);
    // The failure is not dressed up as an empty result, nor the reverse.
    if (step.mode !== 'empty')
      await expect(page.getByText('No games reach this position.')).toHaveCount(0);
  }

  // Recovery: the next position, with the service healthy again, answers.
  mode = 'ok';
  await play(page, 'f8', 'e7');
  await expect(panel.getByRole('button', { name: 'h3', exact: true })).toBeVisible();
  expect(consoleFailures).toEqual([]);
});

test('a slow answer for the position just left never appears under the new one', async ({
  page,
  browserName,
}) => {
  const consoleFailures = watchConsole(page, browserName);
  const held: Route[] = [];
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  await page.route('https://explorer.lichess.org/masters**', async (route) => {
    const fen = new URL(route.request().url()).searchParams.get('fen') ?? '';
    if (fen === START) return route.fulfill({ json: OK_BODY('e4', 'e2e4') });
    if (fen.startsWith('rnbqkbnr/pppppppp/8/8/4P3/')) {
      // After 1.e4: hold it, as a slow connection would.
      held.push(route);
      return;
    }
    // After 1.e4 e5: the position the user ends on.
    return route.fulfill({ json: OK_BODY('Nf3', 'g1f3') });
  });

  await page.goto('/analysis');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByRole('button', { name: 'New analysis' }).first().click();
  await connectFakeToken(page);
  await selectTool(page, page.getByRole('complementary', { name: 'Workspace tools' }), 'Explorer');
  await page.getByLabel('Evidence source').selectOption('lichess-masters');
  const panel = page.locator('[data-explorer-table]');
  await expect(panel.getByRole('button', { name: 'e4', exact: true })).toBeVisible();

  await play(page, 'e2', 'e4');
  await expect.poll(() => held.length).toBeGreaterThan(0);
  await play(page, 'e7', 'e5');
  await expect(panel.getByRole('button', { name: 'Nf3', exact: true })).toBeVisible();

  // Now the answer for 1.e4 arrives, carrying a move that is illegal here.
  for (const route of held.splice(0))
    await route.fulfill({ json: OK_BODY('Qh5', 'd8h4') }).catch(() => undefined);
  await page.waitForTimeout(500);
  await expect(panel.getByRole('button', { name: 'Nf3', exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Qh5', exact: true })).toHaveCount(0);
  expect(consoleFailures).toEqual([]);
});

test('a connected player reopening on Lichess Masters is answered, not asked to connect', async ({
  page,
  browserName,
}) => {
  const consoleFailures = watchConsole(page, browserName);
  const authorization: string[] = [];
  await page.route('https://explorer.lichess.org/masters**', async (route) => {
    authorization.push(route.request().headers().authorization ?? '');
    await route.fulfill({ json: OK_BODY('e4', 'e2e4') });
  });
  await page.goto('/analysis');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByRole('button', { name: 'New analysis' }).first().click();
  await connectFakeToken(page, { remember: true });
  await selectTool(page, page.getByRole('complementary', { name: 'Workspace tools' }), 'Explorer');
  await page.getByLabel('Evidence source').selectOption('lichess-masters');
  await expect(
    page.locator('[data-explorer-table]').getByRole('button', { name: 'e4', exact: true }),
  ).toBeVisible();

  /*
    Start-up is the case: the Explorer opens on Masters and asks at once. The
    token used to reach the provider in a parent effect, after that first
    request, which went without it and was cached as "requires an API token".
  */
  authorization.length = 0;
  await page.reload();
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await expect(
    page.locator('[data-explorer-table]').getByRole('button', { name: 'e4', exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/requires an API token/)).toHaveCount(0);
  expect(authorization.length).toBeGreaterThan(0);
  expect(authorization.every((value) => value === 'Bearer e2e-token')).toBe(true);
  expect(consoleFailures).toEqual([]);
});
