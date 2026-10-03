import { expect, test, type Page } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Folders on the Databases grid, as ChessBase for Mac's New Folder: a folder
 * holds database tiles (no games move), a tile goes in by its menu or by
 * dragging it onto the folder, a search finds a database wherever it is
 * filed, the arrangement survives a reload, and removing the folder puts its
 * databases back at the top level.
 */
const grid = (page: Page) => page.locator('[data-database-grid]');
const myGamesTile = (page: Page) => grid(page).getByRole('button', { name: /^My games/ });

test('folders hold database tiles, by menu or by drag, and survive a reload', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/databases');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await expect(myGamesTile(page)).toBeVisible({ timeout: 30_000 });

  await grid(page).getByRole('button', { name: 'New folder' }).click();
  const prompt = page.getByRole('dialog', { name: 'New folder' });
  await prompt.getByRole('textbox').fill('Openings');
  await prompt.getByRole('button', { name: 'Create folder' }).click();
  const folder = grid(page).locator('[data-folder-tile="Openings"]');
  await expect(folder).toContainText('0 databases');

  // By the tile's menu — the keyboard's route.
  await grid(page).locator('[data-move-to-folder="local"]').click();
  await page.getByRole('menuitem', { name: /Move to “Openings”/ }).click();
  await expect(folder).toContainText('1 database');
  await expect(myGamesTile(page)).toHaveCount(0);

  // A search looks inside folders.
  await page.getByRole('searchbox', { name: 'Search databases' }).fill('My');
  await expect(myGamesTile(page)).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search databases' }).fill('');

  // Inside the folder, and still there after a reload.
  await page.reload();
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await folder.click();
  await expect(grid(page).locator('[data-open-folder]')).toHaveText('Openings');
  await expect(myGamesTile(page)).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('inside-folder.png') });

  // Out again, then in by dragging the tile onto the folder.
  await grid(page).locator('[data-move-to-folder="local"]').click();
  await page.getByRole('menuitem', { name: /Take out of “Openings”/ }).click();
  await expect(grid(page).locator('[data-empty-folder]')).toBeVisible();
  await grid(page).getByRole('button', { name: 'All databases' }).click();
  await expect(folder).toContainText('0 databases');
  await myGamesTile(page).dragTo(folder.getByRole('button'));
  await expect(folder).toContainText('1 database');
  await page.screenshot({ path: test.info().outputPath('top-level.png') });

  // Removing the folder returns its database to the top level.
  await folder.click();
  await grid(page).getByRole('button', { name: 'Remove folder' }).click();
  await expect(folder).toHaveCount(0);
  await expect(myGamesTile(page)).toBeVisible();
});
