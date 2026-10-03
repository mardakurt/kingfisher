/**
 * The game on the board, named above its moves: both players with their
 * ratings, the result, and where and when — and nothing over a board that is
 * not a game.
 */

import { expect, test, type Page } from '@playwright/test';

const PGN = `[Event "Norway Chess"]
[Site "Stavanger"]
[Date "2026.05.30"]
[White "Carlsen, Magnus"]
[Black "Nakamura, Hikaru"]
[WhiteElo "2840"]
[BlackElo "2800"]
[Result "1-0"]

1. e4 e5 1-0

[Event "Norway Chess"]
[Site "Stavanger"]
[Date "2026.06.02"]
[White "Nakamura, Hikaru"]
[Black "Carlsen, Magnus"]
[WhiteElo "2790"]
[BlackElo "2860"]
[Result "1/2-1/2"]

1. d4 d5 1/2-1/2

[Event "Tata Steel"]
[Site "Wijk aan Zee"]
[Date "2025.01.20"]
[White "Carlsen, Magnus"]
[Black "Firouzja, Alireza"]
[Result "0-1"]

1. c4 e5 0-1

[Event "?"]
[White "Firouzja, Alireza"]
[Black "?"]
[Result "*"]

1. Nf3 *`;

async function importGames(page: Page) {
  await page.goto('/games');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  await dialog.getByRole('textbox').fill(PGN);
  await dialog.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByText('4 games added to your database.')).toBeVisible();
}

test('an opened game names its players above the moves; a blank board does not', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/analysis');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await expect(page.locator('[data-game-header]')).toHaveCount(0);

  await importGames(page);
  await page.goto('/games?q=Tata');
  await page.locator('[data-library-list]').getByText('Tata Steel').first().dblclick();
  const header = page.locator('[data-game-header]').first();
  await expect(header).toBeVisible();
  await expect(header).toContainText('Carlsen, Magnus');
  await expect(header).toContainText('Firouzja, Alireza');
  await expect(header.locator('[data-game-result]')).toHaveText('0-1');
  await expect(header).toContainText('Tata Steel · Wijk aan Zee · 2025.01.20');
});
