/**
 * A page with nothing on its board shows no moves in its dock: the notation
 * used to show whatever the analysis board last held — a game from
 * elsewhere, under a study that had no chapter.
 */

import { expect, test } from '@playwright/test';

import { gotoRoute } from './tools';

test('Studies without a chapter shows no game in its notation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoRoute(page, '/analysis?moves=e2e4,c7c5,g1f3');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await expect(page.getByRole('button', { name: 'Nf3', exact: true })).toBeVisible();

  await gotoRoute(page, '/studies');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await expect(page.getByText('No studies yet.').first()).toBeVisible();
  await expect(page.locator('[data-move-tree-absent]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nf3', exact: true })).toHaveCount(0);
});
