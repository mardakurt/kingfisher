import { expect, test } from '@playwright/test';

import { selectTool } from './tools';

test.use({ storageState: { cookies: [], origins: [] } });

/**
 * ChessBase for Mac's "which move scores best at your rating", from a pack.
 *
 * The built-in pack keeps one count per move and cannot filter them by
 * rating, so the explorer's Min Elo is disabled for it (it used to be
 * accepted and ignored). What the pack does keep is each position's games by
 * rating band; the section under the move table re-reads the moves through
 * them. After 1.e4 c5, b3 has games in the 2200–2399 class and none at 2600+
 * in the starter pack, so switching class must move it.
 */
test('switching rating class re-reads the moves from the pack’s own bands', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/analysis');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  const dock = page.locator('[data-workspace-dock]');
  await selectTool(page, dock, 'Explorer');
  await expect(dock.getByRole('combobox', { name: 'Evidence source' })).toHaveValue(
    'kingfisher-starter',
    { timeout: 120_000 },
  );

  const table = dock.locator('[data-explorer-table]');
  await table.getByRole('button', { name: 'e4', exact: true }).click();
  await table.getByRole('button', { name: 'c5', exact: true }).click();
  await expect(dock.getByText('Sicilian Defense').first()).toBeVisible();

  const section = dock.locator('[data-rating-classes]');
  const rows = section.locator('[data-rating-class-moves] tbody tr');
  await expect(rows.first()).toBeVisible({ timeout: 60_000 });

  // The pack is elite broadcast play: no class below 2200 is offered.
  await expect(section.getByRole('button', { name: '2600+' })).toBeVisible();
  await expect(section.getByRole('button', { name: '<2000' })).toHaveCount(0);
  await expect(section).toContainText('No games here rated <2000, 2000–2199.');

  const b3 = section.locator('[data-rating-class-row="b3"]');
  await expect(b3.locator('td').nth(1)).toHaveText('0');
  await section.getByRole('button', { name: '2200–2399' }).click();
  await expect(b3.locator('td').nth(1)).not.toHaveText('0');
  await expect(rows.first()).toHaveAttribute('data-rating-class-row', 'Nf3');

  // Playing a move from the section plays it on the board.
  await section.locator('[data-rating-class-row="c3"]').getByRole('button', { name: 'c3' }).click();
  await expect(dock.getByText('Alapin', { exact: false }).first()).toBeVisible();

  // And the filter the pack cannot apply says so instead of being ignored.
  await dock.getByRole('button', { name: 'Explorer filters' }).click();
  await expect(dock.getByLabel('Min Elo')).toBeDisabled();
  await expect(dock.locator('[data-explorer-filter-limits]')).toContainText(
    'cannot be filtered by rating or by year',
  );
});
