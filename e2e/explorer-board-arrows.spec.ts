import { expect, test } from '@playwright/test';

import { selectTool } from './tools';

test.use({ storageState: { cookies: [], origins: [] } });

/**
 * The Explorer's moves on the board, as ChessBase's reference panel draws
 * them: off by default, a hovered row previewed either way, the most played
 * moves drawn when the toggle is on, and nothing left over after a move.
 */
test('the explorer draws its most played moves on the board, and previews a hovered row', async ({
  page,
}) => {
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
  await expect(table.locator('[data-explorer-row="e4"]')).toBeVisible({ timeout: 60_000 });
  const arrows = page.locator('[data-reference-arrow]');

  // Off by default: nothing on the board until a row is hovered.
  await expect(arrows).toHaveCount(0);
  await table.locator('[data-explorer-row="b3"]').hover();
  await expect(arrows).toHaveCount(1);
  await expect(page.locator('[data-reference-arrow="b3"]')).toHaveAttribute(
    'data-reference-arrow-hovered',
    'true',
  );
  await page.mouse.move(5, 5);
  await expect(arrows).toHaveCount(0);

  // On: the moves with at least 5% of the games, most played widest.
  await dock.locator('[data-explorer-board-arrows]').click();
  await expect(page.locator('[data-reference-arrow="e4"]')).toBeVisible();
  await expect(page.locator('[data-reference-arrow="d4"]')).toBeVisible();
  await expect(page.locator('[data-reference-arrow="Nf3"]')).toBeVisible();
  await expect(page.locator('[data-reference-arrow="b3"]')).toHaveCount(0);

  // After a move the arrows are about the new position only.
  await table.getByRole('button', { name: 'e4', exact: true }).click();
  await expect(table.locator('[data-explorer-row="c5"]')).toBeVisible();
  await expect(page.locator('[data-reference-arrow="e4"]')).toHaveCount(0);
  await expect(page.locator('[data-reference-arrow="c5"]')).toBeVisible();

  // The choice is kept.
  await page.reload();
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await selectTool(page, page.locator('[data-workspace-dock]'), 'Explorer');
  await expect(page.locator('[data-reference-arrow]').first()).toBeVisible({ timeout: 60_000 });
});
