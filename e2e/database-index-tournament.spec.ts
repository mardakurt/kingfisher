/**
 * A tournament in a database's index leads to that edition's games and no
 * others. The link was a free-text search for the name, so "Club Open 1"
 * brought "Club Open 10" with it, and every year's edition.
 */

import { expect, test } from '@playwright/test';

const game = (event: string, date: string, white: string, black: string) =>
  `[Event "${event}"]\n[Date "${date}"]\n[White "${white}"]\n[Black "${black}"]\n[Result "1-0"]\n\n1. e4 e5 1-0`;

const PGN = [
  game('Club Open 1', '2026.03.01', 'Alpha, A', 'Beta, B'),
  game('Club Open 1', '2026.03.02', 'Gamma, G', 'Alpha, A'),
  game('Club Open 1', '2025.03.01', 'Delta, D', 'Beta, B'),
  game('Club Open 10', '2026.04.01', 'Epsilon, E', 'Alpha, A'),
].join('\n\n');

test('a tournament row opens exactly that edition’s games', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/games');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  await dialog.getByRole('textbox').fill(PGN);
  await dialog.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByText('4 games added to your database.')).toBeVisible();

  await page.goto('/databases?db=local');
  const index = page.locator('[data-collection-index]');
  await index.getByRole('button', { name: /^Tournaments/ }).click();
  const rows = index.locator('[data-index-tournaments] tbody tr');
  await expect(rows).toHaveCount(3);
  const edition = rows.filter({ hasText: /^Club Open 1\s*2026/ });
  await expect(edition).toHaveCount(1);
  await edition.getByRole('link').click();

  await expect(page).toHaveURL(/event=%22Club\+Open\+1%22/);
  const list = page.locator('[data-library-list]');
  await expect(list).toContainText('Gamma, G');
  await expect(list.locator('tbody tr')).toHaveCount(2);
  await expect(list).not.toContainText('Epsilon, E');
  await expect(list).not.toContainText('Delta, D');
});
