/**
 * The opening families a player uses, by colour, at the top of the
 * Preparation report — ChessBase's Openings tab — and a family as a way into
 * exactly those games. The opponent's second spelling must count: a source
 * that merged two spellings hands the report both.
 */

import { expect, test } from '@playwright/test';

const game = (white: string, black: string, opening: string, result: string, moves: string) =>
  `[Event "Club"]\n[Date "2026.01.01"]\n[White "${white}"]\n[Black "${black}"]\n[Opening "${opening}"]\n[Result "${result}"]\n\n${moves} ${result}`;

const PGN = [
  game('Opponent, O', 'Me, M', 'Sicilian Defense: Najdorf', '1-0', '1. e4 c5'),
  game('Opponent, O', 'Me, M', 'Sicilian Defense: Taimanov', '1/2-1/2', '1. e4 c5'),
  game('Opponent, O', 'Me, M', 'French Defense', '0-1', '1. e4 e6'),
  game('Me, M', 'Opponent, O', "Queen's Gambit Declined", '0-1', '1. d4 d5'),
].join('\n\n');

test('the report lists each colour’s opening families and opens one family’s games', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/games');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  await dialog.getByRole('textbox').fill(PGN);
  await dialog.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByText('4 games added to your database.')).toBeVisible();

  await page.goto('/preparation');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByLabel('Player name').fill('Opponent, O');
  await page.locator('[data-opponent-search]').getByRole('button', { name: 'Prepare' }).click();

  const families = page.locator('[data-opening-families]');
  const white = families.locator('[data-opening-families-side="w"]');
  const black = families.locator('[data-opening-families-side="b"]');
  // "Sicilian Defense" is one family: the variation after the colon is not.
  await expect(white.locator('[data-opening-family]')).toHaveCount(2);
  const sicilian = white.locator('[data-opening-family="Sicilian Defense"]');
  // One win and one draw for the opponent: 2 games, 75%.
  await expect(sicilian).toContainText('2 · 75%');
  await expect(white).toContainText('3 games · 50%');
  await expect(black.locator('[data-opening-family="Queen\'s Gambit Declined"]')).toContainText(
    '1 · 100%',
  );

  await sicilian.click();
  const filter = page.locator('[data-preparation-family-filter]');
  await expect(filter).toContainText('Sicilian Defense · as White · 2 games');
  await expect(page.locator('[data-preparation-games] tbody tr')).toHaveCount(2);
  await filter.getByRole('button', { name: 'All games' }).click();
  await expect(page.locator('[data-preparation-games] tbody tr')).toHaveCount(4);
});

test('an opponent prepared for is offered again under Recent', async ({ page }) => {
  // A player the bundled Starter Reference holds, so the report has a card.
  await page.goto('/preparation');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await expect(page.locator('[data-recent-opponents]')).toHaveCount(0);
  await page.getByLabel('Player name').fill('Carlsen, Magnus');
  await page.locator('[data-opponent-search]').getByRole('button', { name: 'Prepare' }).click();
  await expect(page.locator('[data-player-card]')).toContainText('Carlsen, Magnus');

  await page.goto('/preparation');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  const recent = page.locator('[data-recent-opponents]');
  await recent.getByRole('button', { name: 'Carlsen, Magnus' }).click();
  await expect(page.locator('[data-player-card]')).toContainText('Carlsen, Magnus');
});
