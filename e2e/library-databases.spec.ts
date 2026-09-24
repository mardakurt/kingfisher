/**
 * The Library shows any database (Phase 84), not only My games: a SQLite
 * collection behind the companion is chosen in the toolbar, its games are
 * listed and filtered by the companion's own matcher, a filter it cannot
 * apply is named on screen, a game previews with its moves, and it opens on
 * the board as a new analysis. Against the real companion Playwright runs.
 */

import { expect, test } from '@playwright/test';

const READY = 'html[data-kingfisher-ready="true"]';

const PGNS = [
  '[Event "Library DB 1"]\n[White "Sicilian, Keeper"]\n[Black "Najdorf, Fan"]\n[Date "2025.01.01"]\n[Result "1-0"]\n\n1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e5 1-0',
  '[Event "Library DB 2"]\n[White "Queen, Gambiteer"]\n[Black "Slav, Wall"]\n[Date "2025.02.01"]\n[Result "1/2-1/2"]\n\n1. d4 d5 2. c4 c6 3. Nf3 Nf6 1/2-1/2',
].join('\n\n');

test('lists, filters, previews and opens the games of a companion database', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/analysis');
  await page.locator(READY).waitFor();
  await page.getByRole('button', { name: 'Settings ⌘,' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('tab', { name: 'Companion' }).click();
  await settings.getByLabel('Pairing address').fill('http://127.0.0.1:4338#token=phase8-e2e-token');
  await settings.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(settings.getByText(/Paired with/)).toBeVisible();
  const name = `Library E2E ${Date.now()}`;
  await settings.getByPlaceholder('New collection name').fill(name);
  await settings.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(settings.getByText(name).first()).toBeVisible();
  await settings.getByPlaceholder('Paste a PGN collection…').fill(PGNS);
  await settings.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(settings.getByText(/2 games/).first()).toBeVisible({ timeout: 30_000 });
  await settings.getByRole('button', { name: 'Close' }).click();

  await page.goto('/games');
  await page.locator(READY).waitFor();
  const picker = page.getByRole('combobox', { name: 'Database' });
  await expect(picker.locator('option', { hasText: name })).toHaveCount(1);
  const value = await picker.locator('option', { hasText: name }).getAttribute('value');
  await picker.selectOption(value!);

  const list = page.locator('[data-library-list]');
  await expect(list).toContainText('Sicilian, Keeper');
  await expect(list).toContainText('Queen, Gambiteer');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Library');
  await expect(page.getByText(`2 games in ${name}`)).toBeVisible();
  await expect(page).toHaveURL(/db=sqlite%3A|db=sqlite:/);

  // The companion filters by player itself.
  await page.getByRole('searchbox', { name: 'Search games' }).fill('Slav');
  await expect(list).not.toContainText('Sicilian, Keeper');
  await expect(list).toContainText('Queen, Gambiteer');
  await page.getByRole('searchbox', { name: 'Search games' }).fill('');

  // Selecting (delete, merge, queue) works in My games only, and says so by being off.
  await expect(list.getByRole('checkbox').first()).toBeDisabled();

  // Preview reads the moves from the companion; Open puts them on the board.
  // A single click on the row previews (the player's name is a link that opens).
  await list
    .locator('[data-library-row]')
    .filter({ hasText: 'Sicilian, Keeper' })
    .getByText('Library DB 1')
    .click();
  const preview = page.locator('[data-library-preview]');
  await expect(preview).toContainText('Nxd4');
  await preview.getByRole('button', { name: 'Open' }).click();
  await expect(page).toHaveURL(/\/analysis/);
  await expect(page.getByText(`(${name})`).first()).toBeVisible();
});
