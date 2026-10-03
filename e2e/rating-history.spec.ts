import { expect, test } from '@playwright/test';

import type { importGames } from '../src/persistence/import-game';
import type { AppRepositories } from '../src/persistence/types';

/**
 * A player's rating history on the player page: the ratings their games
 * were stored with, per month, and the FIDE performance per year.
 */

const game = (date: string, own: number, opp: number, result: string) => `[Event "History Open"]
[Date "${date}"]
[White "Historia, Hanna"]
[Black "Opponent, ${own}"]
[WhiteElo "${own}"]
[BlackElo "${opp}"]
[Result "${result}"]

1. e4 e5 ${result}
`;

const PGN = [
  game('2024.01.10', 1900, 1900, '1-0'),
  game('2024.01.20', 1920, 1900, '1/2-1/2'),
  game('2024.06.05', 2010, 2100, '1-0'),
  game('2025.02.01', 2105, 2200, '0-1'),
  game('2025.??.??', 2110, 2200, '1-0'),
].join('\n');

test('the player page draws the recorded rating by month and the performance by year', async ({
  page,
}) => {
  await page.goto('/games');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.waitForFunction(() =>
    Boolean((globalThis as { __kingfisher?: unknown }).__kingfisher),
  );
  await page.evaluate(async (text) => {
    const app = (
      globalThis as typeof globalThis & {
        __kingfisher: AppRepositories & { importGames: typeof importGames };
      }
    ).__kingfisher;
    await app.importGames(text, app.games);
  }, PGN);

  await page.goto('/player/historia%2C%20hanna');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  const history = page.locator('[data-rating-history]');
  await expect(history).toBeVisible();
  // Three months plotted; the game with no month is counted, not guessed.
  await expect(history.locator('[data-rating-point]')).toHaveCount(3);
  await expect(history).toContainText('1 game without a month or a rating not plotted');
  await history.locator('[data-rating-point="2024-01"]').hover();
  await expect(history.locator('[data-rating-tooltip]')).toContainText('1910');
  await expect(history.locator('[data-rating-tooltip]')).toContainText('2024-01 · 2 games');
  // 2024: 2.5 / 3 against an average of 1967 → p .83, dp 273 → 2240.
  const years = history.locator('[data-rating-years] tbody tr');
  await expect(years.nth(0)).toContainText('2024');
  await expect(years.nth(0)).toContainText('2½ (83%)');
  await expect(years.nth(0)).toContainText('2240');
  await expect(years.nth(1)).toContainText('2025');
});
