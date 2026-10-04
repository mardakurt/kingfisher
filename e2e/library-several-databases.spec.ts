/**
 * The Library over several databases, as ChessBase's "Databases 2 of 5":
 * one search, every row naming its database, and any row opens on the board.
 */

import { expect, test } from '@playwright/test';
import { settingsButton } from './support/settings-control';

const game = (white: string, black: string, event: string) =>
  `[Event "${event}"]\n[White "${white}"]\n[Black "${black}"]\n[Result "1-0"]\n\n1. e4 e5 1-0`;

test('one search across My games and a companion database, each row named, each openable', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/games');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  await dialog.getByRole('textbox').fill(game('Carlsen, Local', 'Other, O', 'Home club'));
  await dialog.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByText('1 game added to your database.')).toBeVisible();

  await settingsButton(page).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('tab', { name: 'Companion' }).click();
  await settings.getByLabel('Pairing address').fill('http://127.0.0.1:4338#token=phase8-e2e-token');
  await settings.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(settings.getByText(/Paired with/)).toBeVisible();
  const name = `Across E2E ${Date.now()}`;
  await settings.getByPlaceholder('New collection name').fill(name);
  await settings.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(settings.getByText(name).first()).toBeVisible();
  await settings
    .getByPlaceholder('Paste a PGN collection…')
    .fill(game('Carlsen, Remote', 'Other, R', 'Away club'));
  await settings.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByText(/\b1 games? imported/)).toBeVisible();
  await settings.getByRole('button', { name: 'Close' }).click();

  await page.goto('/games');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page
    .getByRole('searchbox')
    .or(page.getByRole('textbox', { name: 'Search games' }))
    .first()
    .fill('Carlsen');
  await page.locator('[data-library-databases]').click();
  await page.getByRole('group', { name: 'Databases to search' }).getByLabel(name).check();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-library-databases]')).toContainText(/^2 of \d+ databases$/);

  const across = page.locator('[data-library-across]');
  await expect(across.locator('tbody tr')).toHaveCount(2);
  await expect(across).toContainText('My games');
  await expect(across).toContainText(name);
  await expect(page).toHaveURL(/also=sqlite/);

  // The companion's game opens on the board, with its players named.
  await across.locator('tbody tr', { hasText: 'Carlsen, Remote' }).dblclick();
  await expect(page).toHaveURL(/\/analysis/);
  await expect(page.locator('[data-game-header]').first()).toContainText('Carlsen, Remote');
});
