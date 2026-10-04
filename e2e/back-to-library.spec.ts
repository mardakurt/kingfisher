/**
 * An opened game says where it came from, as ChessBase heads one with
 * "‹ Library": back is the same search, with the same game selected.
 */

import { expect, test } from '@playwright/test';

const game = (white: string, black: string, event: string) =>
  `[Event "${event}"]\n[White "${white}"]\n[Black "${black}"]\n[Result "1-0"]\n\n1. e4 e5 1-0`;

test('a game opened from the Library goes back to that search, that game selected', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/games');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  await dialog
    .getByRole('textbox')
    .fill([game('Alpha, A', 'Beta, B', 'One'), game('Gamma, G', 'Delta, D', 'Two')].join('\n\n'));
  await dialog.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByText('2 games added to your database.')).toBeVisible();

  await page
    .getByRole('searchbox')
    .or(page.getByRole('textbox', { name: /search/i }))
    .first()
    .fill('Gamma');
  const list = page.locator('[data-library-list]');
  await expect(list.locator('tbody tr')).toHaveCount(1);
  await list.getByText('Gamma, G').first().dblclick();
  await expect(page).toHaveURL(/\/analysis/);

  const back = page.getByRole('button', { name: /Back to the Library: “Gamma”/ });
  await expect(back).toBeVisible();
  await back.click();
  await expect(page).toHaveURL(/\/games\?.*q=Gamma/);
  await expect(page.locator('[data-library-list] tbody tr')).toHaveCount(1);
  await expect(page.locator('[data-library-list]')).toContainText('Gamma, G');
});
