/**
 * Phase 11: linking an online account and syncing its games.
 *
 * Routed rather than live, for the same reason the explorer's contract tests
 * are: CI must not depend on a third party being up, and a test that hits
 * the real Lichess would be a rate-limit incident waiting for a busy day.
 * What is asserted is the part Kingfisher owns — that a linked account's
 * games land in the ordinary local collection, that syncing twice does not
 * duplicate them, and that a failure says what failed instead of showing an
 * empty library.
 */

import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

const game = (white: string, black: string, date: string, time: string, site: string) =>
  `[Event "Rated blitz game"]\n[Site "${site}"]\n[White "${white}"]\n[Black "${black}"]\n[Result "1-0"]\n[UTCDate "${date}"]\n[UTCTime "${time}"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 1-0\n\n`;

const TWO_GAMES =
  game('SyncTestUser', 'Opponent One', '2026.01.02', '10:00:00', 'https://lichess.org/aaaa1111') +
  game('Opponent Two', 'SyncTestUser', '2026.03.04', '17:04:11', 'https://lichess.org/bbbb2222');

async function openAccounts(page: Page) {
  await page.goto('/analysis');
  await ready(page);
  await page.getByRole('button', { name: 'Settings (⌘,)' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('tab', { name: 'Accounts' }).click();
  return dialog;
}

test('§18 a linked Lichess account syncs its games into the local collection', async ({ page }) => {
  let requests = 0;
  await page.route('https://lichess.org/api/games/user/**', async (route) => {
    requests += 1;
    await route.fulfill({ status: 200, contentType: 'application/x-chess-pgn', body: TWO_GAMES });
  });

  const dialog = await openAccounts(page);
  await dialog.getByRole('textbox', { name: 'Account username' }).fill('SyncTestUser');
  await dialog.getByRole('button', { name: 'Link', exact: true }).click();

  // §25: the account reports what happened, not merely that it exists.
  await expect(dialog.getByText(/2 new games/)).toBeVisible();
  expect(requests).toBe(1);

  // The games are in the ordinary collection, reachable the ordinary way.
  await page.keyboard.press('Escape');
  await page.goto('/games');
  await ready(page);
  await expect(page.getByText('SyncTestUser').first()).toBeVisible();
});

test('§23 syncing a second time imports nothing and says so', async ({ page }) => {
  await page.route('https://lichess.org/api/games/user/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/x-chess-pgn', body: TWO_GAMES });
  });

  const dialog = await openAccounts(page);
  await dialog.getByRole('textbox', { name: 'Account username' }).fill('SyncTestUser');
  await dialog.getByRole('button', { name: 'Link', exact: true }).click();
  await expect(dialog.getByText(/2 new games/)).toBeVisible();

  await dialog.getByRole('button', { name: 'Sync now' }).click();

  /*
    The duplicate rule is the fingerprint index, not anything in the sync
    path — so the second run reports "up to date" rather than importing the
    same two games again under new ids.
  */
  await expect(dialog.getByText(/Up to date/)).toBeVisible();
});

test('§25 a rate-limited sync says it was rate limited, not that there are no games', async ({
  page,
}) => {
  await page.route('https://lichess.org/api/games/user/**', async (route) => {
    await route.fulfill({ status: 429, body: '' });
  });

  const dialog = await openAccounts(page);
  await dialog.getByRole('textbox', { name: 'Account username' }).fill('SyncTestUser');
  await dialog.getByRole('button', { name: 'Link', exact: true }).click();

  await expect(dialog.getByText(/rate limiting/i)).toBeVisible();
  await expect(dialog.getByText(/Wait a minute/i)).toBeVisible();
});

test('§25 an account that does not exist is named as such', async ({ page }) => {
  await page.route('https://api.chess.com/pub/player/**', async (route) => {
    await route.fulfill({ status: 404, body: '' });
  });

  const dialog = await openAccounts(page);
  await dialog.getByRole('combobox', { name: 'Account provider' }).selectOption('chess.com');
  await dialog.getByRole('textbox', { name: 'Account username' }).fill('nosuchplayer');
  await dialog.getByRole('button', { name: 'Link', exact: true }).click();

  await expect(dialog.getByText(/no account called "nosuchplayer"/i)).toBeVisible();
});

test('§20 a Chess.com sync walks the published monthly archives', async ({ page }) => {
  const asked: string[] = [];
  await page.route('https://api.chess.com/pub/player/**', async (route) => {
    const url = route.request().url();
    asked.push(url);
    if (url.endsWith('/archives')) {
      await route.fulfill({
        json: {
          archives: [
            'https://api.chess.com/pub/player/synctestuser/games/2026/01',
            'https://api.chess.com/pub/player/synctestuser/games/2026/02',
          ],
        },
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/x-chess-pgn',
      body: url.includes('/2026/01/')
        ? game('SyncTestUser', 'Jan Opponent', '2026.01.05', '09:00:00', 'https://chess.com/g/1')
        : game('Feb Opponent', 'SyncTestUser', '2026.02.06', '09:00:00', 'https://chess.com/g/2'),
    });
  });

  const dialog = await openAccounts(page);
  await dialog.getByRole('combobox', { name: 'Account provider' }).selectOption('chess.com');
  await dialog.getByRole('textbox', { name: 'Account username' }).fill('SyncTestUser');
  await dialog.getByRole('button', { name: 'Link', exact: true }).click();

  await expect(dialog.getByText(/2 new games/)).toBeVisible();
  // The archive list first, then each month — never a month that was not published.
  expect(asked.filter((url) => url.endsWith('/archives'))).toHaveLength(1);
  expect(asked.some((url) => url.includes('/2026/01/pgn'))).toBe(true);
  expect(asked.some((url) => url.includes('/2026/02/pgn'))).toBe(true);
});
