/**
 * The opening map: three plies of the explorer's source as nested blocks,
 * drawn on request, and a click that plays the line. Runs against the
 * built-in reference, which answers without a network.
 */

import { expect, test, type Page } from '@playwright/test';

import { settingsButton } from './support/settings-control';
import { selectTool } from './tools';

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

test('the map draws the source three moves deep, and a block plays its line', async ({ page }) => {
  await page.goto('/analysis');
  await ready(page);
  const dock = page.locator('main');
  await selectTool(page, dock, 'Explorer');

  const section = page.getByRole('region', { name: 'Opening map' });
  await expect(section).toContainText('Kingfisher Starter Reference');
  // Nothing is asked of the source until the person wants the picture.
  await expect(section.locator('[data-opening-map-block]')).toHaveCount(0);
  await section.getByRole('button', { name: 'Show map' }).click();

  const map = section.getByRole('group', { name: /^Opening map of / });
  const e4 = map.locator('[data-opening-map-block="e4"]');
  await expect(e4).toBeVisible({ timeout: 30_000 });
  // Three rows: a first move, a reply, and White's next.
  await expect(map.locator('[data-opening-map-block="e4 c5"]')).toBeVisible();
  const third = map.locator('[data-opening-map-block^="e4 c5 "]');
  expect(await third.count()).toBeGreaterThan(0);

  // Each block names its line, its count and its denominator, in words.
  await expect(e4).toHaveAttribute(
    'aria-label',
    /^Play 1\.e4: [\d,]+ games, \d+% of [\d,]+ at this position; White scored \d+%$/,
  );
  // The key states the source, what width and shade mean, and what is left out.
  await expect(section.locator('[data-opening-map-key]')).toContainText(
    /[\d,]+ games in Kingfisher Starter Reference\. Width is each move’s share/,
  );

  // A child sits inside its parent's width.
  const parent = (await e4.boundingBox())!;
  const child = (await map.locator('[data-opening-map-block="e4 c5"]').boundingBox())!;
  expect(child.x).toBeGreaterThanOrEqual(parent.x - 1);
  expect(child.x + child.width).toBeLessThanOrEqual(parent.x + parent.width + 1);

  await map.locator('[data-opening-map-block="e4 c5"]').click();
  const tree = page.locator('[data-move-tree]').first();
  await expect(tree).toContainText('e4');
  await expect(tree).toContainText('c5');
  await expect(page.getByRole('contentinfo')).toContainText('2 half-moves');
});

test('a remote source is not asked thirty times for one picture', async ({ page }) => {
  // Lichess's explorer is answered here with one move, so the test needs no
  // network and the table draws; every request is counted.
  let asked = 0;
  await page.route('https://explorer.lichess.org/**', (route) => {
    asked += 1;
    return route.fulfill({
      json: {
        white: 30,
        draws: 20,
        black: 10,
        moves: [{ uci: 'e2e4', san: 'e4', white: 30, draws: 20, black: 10, averageRating: 2600 }],
        topGames: [],
      },
    });
  });
  await page.goto('/analysis');
  await ready(page);
  // Lichess asks for a token before its explorer answers: a fake one, with
  // the account check answered here (as `provider-states.spec.ts` does).
  await page.route('https://lichess.org/api/account', (route) =>
    route.fulfill({ json: { id: 'e2e-user', username: 'E2EUser' } }),
  );
  await settingsButton(page).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('tab', { name: 'Accounts' }).click();
  await settings.getByRole('button', { name: /personal access token/ }).click();
  await settings.getByLabel('Lichess personal access token').fill('e2e-token');
  await settings.getByRole('button', { name: 'Test connection' }).click();
  await expect(settings.getByText('Connected as E2EUser')).toBeVisible();
  await settings.getByRole('button', { name: 'Close' }).click();

  const dock = page.locator('main');
  await selectTool(page, dock, 'Explorer');
  await dock.getByRole('combobox', { name: 'Evidence source' }).selectOption('lichess-masters');
  await expect(dock).toContainText('60 games');

  const section = page.getByRole('region', { name: 'Opening map' });
  await page.waitForTimeout(1_500);
  const before = asked;
  await section.getByRole('button', { name: 'Show map' }).click();
  await expect(section.locator('[data-opening-map-remote]')).toContainText(
    'offered for sources on this machine',
  );
  await page.waitForTimeout(1_500);
  expect(asked).toBe(before);
  await expect(section.locator('[data-opening-map-block]')).toHaveCount(0);
});
