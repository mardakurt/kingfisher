/**
 * The databases in the sidebar, and a database in the address.
 *
 * ChessBase for Mac lists every database under its sidebar, one click from
 * any board. Kingfisher's open database was component state, so nothing could
 * link to one: these tests hold the address (`/databases?db=<id>`) to being
 * the open database, on a click, on Back, on a reload and for an id that names
 * nothing.
 */

import { expect, test, type Page } from '@playwright/test';
import { settingsButton } from './support/settings-control';

const sidebar = (page: Page) => page.locator('nav[aria-label="Sections"]');

test('My games is listed under Databases with its own count, and opens there', async ({ page }) => {
  await page.goto('/analysis');
  const row = sidebar(page).locator('[data-sidebar-database="local"]');
  await expect(row).toBeVisible();
  await expect(row).toContainText('My games');
  // A fresh profile holds no games, and the row says 0 rather than nothing.
  await expect(row).toContainText('0');

  await row.click();
  await expect(page).toHaveURL(/\/databases\?db=local$/);
  // The open database's own tab, not the grid.
  await expect(
    page.getByRole('navigation', { name: 'Database tools' }).getByRole('button', {
      name: 'My games',
    }),
  ).toBeVisible();
  await expect(row).toHaveAttribute('aria-current', 'page');
});

test('Back from a database returns to the grid, and a reload keeps it open', async ({ page }) => {
  await page.goto('/databases');
  const grid = page
    .locator('main')
    .getByRole('button', { name: /My games/ })
    .first();
  await grid.click();
  await expect(page).toHaveURL(/\?db=local$/);

  await page.reload();
  await expect(page).toHaveURL(/\?db=local$/);
  const tools = page.getByRole('navigation', { name: 'Database tools' });
  await expect(tools.getByRole('button', { name: 'My games' })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/databases$/);
  await expect(tools.getByRole('button', { name: 'My games' })).toHaveCount(0);
});

test('an address naming no database returns to the grid instead of keeping it', async ({
  page,
}) => {
  await page.goto('/databases?db=sqlite%3Adoes-not-exist');
  await expect(page).toHaveURL(/\/databases$/);
});

test('New database in the sidebar asks for a name on the Databases page', async ({ page }) => {
  await page.goto('/analysis');
  const nav = sidebar(page);
  await nav.locator('[data-nav-section="databases"]').hover();
  await nav.getByRole('link', { name: 'New database' }).click();
  await expect(page.getByRole('dialog', { name: 'New SQLite collection' })).toBeVisible();
  await expect(page).toHaveURL(/\/databases$/);
});

test('a companion database stays open across a reload, though its list arrives last', async ({
  page,
}) => {
  /*
    The address names a companion database, which the page can only find once
    the companion has answered; a reload must not decide too early that it
    names nothing and send the person back to the grid. (This passes with or
    without the page's wait for the companion — the list's own status call
    already includes it here — so it guards the behaviour, not the race.)
  */
  test.setTimeout(90_000);
  await page.goto('/analysis');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await settingsButton(page).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('tab', { name: 'Companion' }).click();
  await settings.getByLabel('Pairing address').fill('http://127.0.0.1:4338#token=phase8-e2e-token');
  await settings.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(settings.getByText(/Paired with/)).toBeVisible();
  const name = `Sidebar E2E ${Date.now()}`;
  await settings.getByPlaceholder('New collection name').fill(name);
  await settings.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(settings.getByText(name).first()).toBeVisible();
  await settings.getByRole('button', { name: 'Close' }).click();

  const nav = sidebar(page);
  const expand = nav.getByRole('button', { name: /^Show \d+ more$/ });
  if (await expand.isVisible()) await expand.click();
  const row = nav.locator('[data-sidebar-database^="sqlite:"]', { hasText: name });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page).toHaveURL(/\/databases\?db=sqlite/);
  const tools = page.getByRole('navigation', { name: 'Database tools' });
  await expect(tools.getByRole('button', { name })).toBeVisible();

  await page.reload();
  await expect(tools.getByRole('button', { name })).toBeVisible();
  await expect(page).toHaveURL(/\/databases\?db=sqlite/);
});
