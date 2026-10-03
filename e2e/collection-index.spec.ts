import { expect, test } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

/**
 * A collection's players and tournaments (ChessBase's database overview),
 * counted from the games' own headers, each row leading into the Library.
 */
const PGN = `[Event "Spring Open"]
[Date "2025.04.01"]
[White "Ivanova, Anna"]
[Black "Berg, Bo"]
[Result "1-0"]

1. e4 e5 1-0

[Event "Spring Open"]
[Date "2025.04.02"]
[White "Berg, Bo"]
[Black "Chen, Cai"]
[Result "1/2-1/2"]

1. d4 d5 1/2-1/2

[Event "Spring Open"]
[Date "2025.04.03"]
[White "Chen, Cai"]
[Black "Ivanova, Anna"]
[Result "0-1"]

1. c4 c5 0-1

[Event "?"]
[Date "2024.??.??"]
[White "Ivanova, Anna"]
[Black "Dahl, Dag"]
[Result "*"]

1. Nf3 *
`;

test('a collection counts its players and tournaments, and each row opens the Library', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/games');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  await dialog.getByRole('textbox').fill(PGN);
  await dialog.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByText('4 games added to your database.')).toBeVisible();

  await page.goto('/databases');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByText('My games', { exact: true }).first().click();
  const index = page.locator('[data-collection-index]');
  const tiles = index.locator('[data-index-tiles]');
  await expect(tiles).toContainText('Games4');
  await expect(tiles).toContainText('Players4');
  await expect(tiles).toContainText('Tournaments1');
  await expect(tiles).toContainText('2024–2025');
  await expect(index).toContainText('1 game names no event and is in no tournament.');

  const anna = index.locator('[data-index-players] tbody tr').first();
  // Two wins, one unfinished game that scores for nobody.
  await expect(anna).toContainText('Ivanova, Anna');
  await expect(anna).toContainText('+2 =0 −0');
  await expect(anna).toContainText('100%');

  await index.getByRole('button', { name: /Tournaments/ }).click();
  const spring = index.locator('[data-index-tournaments] tbody tr').first();
  await expect(spring).toContainText('Spring Open');
  await expect(spring).toContainText('2025-04-03');
  await spring.getByRole('link', { name: 'Spring Open' }).click();
  await page.waitForURL(/\/games\?.*q=Spring/);
  await expect(page.locator('main table tbody tr')).toHaveCount(3);
});
