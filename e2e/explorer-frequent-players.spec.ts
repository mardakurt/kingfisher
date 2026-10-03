import { expect, test } from '@playwright/test';
import { selectTool } from './tools';

test('My games names the frequent mover with distinct game counts, even on a narrow dock', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/games');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  await dialog
    .getByRole('textbox')
    .fill(
      `[Event "Loop"]\n[White "Alpha"]\n[Black "Beta"]\n1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 *\n\n[Event "Second"]\n[White "Alpha"]\n[Black "Gamma"]\n1. Nf3 d5 *`,
    );
  await dialog.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByText('2 games added to your database.')).toBeVisible();
  await page.goto('/analysis');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  const dock = page.locator('[data-workspace-dock]');
  await selectTool(page, dock, 'Explorer');
  await dock.getByRole('combobox', { name: 'Evidence source' }).selectOption('local-collection');
  const row = dock.locator('[data-explorer-row="Nf3"]');
  await expect(row.locator('[data-explorer-frequent-players]')).toHaveText('Alpha (2)');
  await expect(row.getByText('Alpha (2)', { exact: true }).first()).toBeVisible();
  await expect(row.locator('[data-explorer-frequent-players]')).toHaveAttribute(
    'title',
    'Alpha: 2 games',
  );
  await page.screenshot({ path: '/tmp/kingfisher-145-frequent-laptop.png' });
});
