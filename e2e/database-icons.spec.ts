/** A database's own icon, chosen from its tile's menu, on the grid and in the sidebar. */

import { expect, test } from '@playwright/test';

test('a chosen icon shows on the tile and in the sidebar, and survives a reload', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/databases');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  const tile = page
    .locator('main')
    .getByRole('button', { name: /My games/ })
    .first();
  await expect(tile.locator('[data-database-icon]')).toHaveAttribute(
    'data-database-icon',
    'library:blue',
  );

  await tile.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Change icon…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Change icon' });
  await dialog.getByRole('radio', { name: 'Tactics' }).click();
  await dialog.getByRole('radio', { name: 'Gold' }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();

  await expect(tile.locator('[data-database-icon]')).toHaveAttribute(
    'data-database-icon',
    'tactics:gold',
  );
  const sidebar = page.locator('nav[aria-label="Sections"] [data-sidebar-database="local"]');
  await expect(sidebar.locator('[data-database-glyph]')).toHaveAttribute(
    'data-database-glyph',
    'tactics:gold',
  );

  await page.reload();
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await expect(tile.locator('[data-database-icon]')).toHaveAttribute(
    'data-database-icon',
    'tactics:gold',
  );

  await tile.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Change icon…' }).click();
  await page
    .getByRole('dialog', { name: 'Change icon' })
    .getByRole('button', { name: 'Use the default' })
    .click();
  await expect(tile.locator('[data-database-icon]')).toHaveAttribute(
    'data-database-icon',
    'library:blue',
  );
});
