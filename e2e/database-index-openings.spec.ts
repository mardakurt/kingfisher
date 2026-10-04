/**
 * A database's openings and top games, as ChessBase's database page lists
 * them, each leading to exactly the games it counts.
 */

import { expect, test } from '@playwright/test';

const game = (
  white: string,
  black: string,
  we: number,
  be: number,
  moves: string,
  result: string,
) =>
  `[Event "Club"]\n[Date "2026.01.01"]\n[White "${white}"]\n[Black "${black}"]\n[WhiteElo "${we}"]\n[BlackElo "${be}"]\n[Result "${result}"]\n\n${moves} ${result}`;

const PGN = [
  game('Alpha, A', 'Beta, B', 2400, 2300, '1. e4 c5 2. Nf3 d6', '1-0'),
  game('Gamma, G', 'Delta, D', 2700, 2650, '1. e4 c5 2. Nc3 Nc6', '1/2-1/2'),
  game('Epsilon, E', 'Zeta, Z', 2100, 2000, '1. e4 e6 2. d4 d5', '0-1'),
].join('\n\n');

test('the index lists opening families and top games, and each opens its games', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/games');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  await dialog.getByRole('textbox').fill(PGN);
  await dialog.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByText('3 games added to your database.')).toBeVisible();

  await page.goto('/databases?db=local');
  const index = page.locator('[data-collection-index]');
  // Top games: the highest sum of both ratings first.
  await expect(index.locator('[data-index-top-games] li').first()).toContainText(
    'Gamma, G 2700 – Delta, D 2650',
  );

  await index.getByRole('button', { name: /^Openings/ }).click();
  const sicilian = index.locator('[data-index-openings] tbody tr').first();
  await expect(sicilian).toContainText('Sicilian Defense');
  await expect(sicilian).toContainText('2');
  // White won one and drew one: 75%.
  await expect(sicilian).toContainText('75%');
  await sicilian.getByRole('link').click();

  await expect(page).toHaveURL(/opening=%22Sicilian\+Defense%22/);
  const list = page.locator('[data-library-list]');
  await expect(list.locator('tbody tr')).toHaveCount(2);
  await expect(list).not.toContainText('Epsilon, E');
  // The filter is a chip that removes itself.
  await page.getByRole('button', { name: /Remove Opening/ }).click();
  await expect(list.locator('tbody tr')).toHaveCount(3);
});
