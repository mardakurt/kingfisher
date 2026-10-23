/**
 * Selective import: a PGN imported with "Keep only some games" stores the
 * games that answer the filter and says how many it left out — through the
 * real PGN worker, not the main-thread fallback.
 */

import { expect, test } from '@playwright/test';

const game = (
  white: string,
  black: string,
  whiteElo: string,
  blackElo: string,
  date: string,
  moves: string,
) =>
  `[Event "Filter"]\n[White "${white}"]\n[Black "${black}"]\n${whiteElo ? `[WhiteElo "${whiteElo}"]\n` : ''}${blackElo ? `[BlackElo "${blackElo}"]\n` : ''}[Date "${date}"]\n[Result "*"]\n\n${moves} *`;

const PGN = [
  game('Carlsen, Magnus', 'Nakamura, Hikaru', '2830', '2780', '2024.05.01', '1. e4 e5'),
  game('Carlsen, Magnus', 'Club, Player', '2830', '1800', '2024.05.02', '1. d4 d5'),
  game('Firouzja, Alireza', 'Caruana, Fabiano', '2760', '2800', '2024.05.03', '1. c4 e5'),
  game('Carlsen, Magnus', 'Anand, Viswanathan', '', '', '2024.05.04', '1. Nf3 d5'),
  game('Carlsen, Magnus', 'Caruana, Fabiano', '2860', '2820', '2014.06.01', '1. e4 c5'),
].join('\n\n');

test('a filtered import keeps the games asked for and counts the rest', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/analysis');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByRole('button', { name: 'Import PGN or FEN' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  await dialog.getByRole('textbox').first().fill(PGN);

  await dialog.getByText('Keep only some games').click();
  await dialog.getByLabel('Lowest rating').fill('2700');
  await dialog.getByLabel('Player').fill('Magnus Carlsen');
  await dialog.getByLabel('From year').fill('2020');
  await expect(dialog.locator('[data-import-filter] summary')).toContainText(
    'both players 2700+ · Magnus Carlsen · 2020 onwards',
  );
  await dialog.getByRole('button', { name: 'Import games' }).click();
  await expect(dialog).toBeHidden();

  // Only Carlsen–Nakamura answers all three: the 1800 opponent, the unrated
  // game, the other players and the 2014 game are left out.
  await expect(page.getByText('1 game added to your database.')).toBeVisible();
  await expect(
    page.getByText(
      '4 games left out by the filter (both players 2700+ · Magnus Carlsen · 2020 onwards).',
    ),
  ).toBeVisible();
  await expect(page.locator('[data-game-header]').first()).toContainText('Nakamura, Hikaru');

  // A filter nothing answers says so, rather than that everything was a duplicate.
  await page.getByRole('button', { name: 'Import PGN or FEN' }).click();
  await dialog.getByRole('textbox').first().fill(PGN);
  await dialog.getByText('Keep only some games').click();
  await dialog.getByLabel('Lowest rating').fill('2900');
  await dialog.getByRole('button', { name: 'Import games' }).click();
  await expect(
    page.getByText('No game in that PGN matched the filter (both players 2900+).'),
  ).toBeVisible();
});
