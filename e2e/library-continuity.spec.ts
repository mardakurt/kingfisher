import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import type { importGames } from '../src/persistence/import-game';
import type { AppRepositories } from '../src/persistence/types';

/**
 * From finding a game to analysing it, without losing the place (Phase 87).
 *
 * The Library's preview lets a player step to the moment they were looking
 * for. Pressing Open then put the board back at move one, so the moment had
 * to be found a second time on the board.
 */

const GAME = `[Event "Continuity Open"]
[White "Continuity, White"]
[Black "Continuity, Black"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 1-0
`;

async function seed(page: Page, pgn = GAME) {
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
  }, pgn);
  await page.reload();
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

test('Open starts the board at the move the preview was stepped to', async ({ page }) => {
  await seed(page);
  await page.getByRole('row', { name: /Continuity, White/ }).click();
  const preview = page.locator('[data-library-preview]');
  await expect(preview).toBeVisible();
  // Step to 3.Bb5 in the preview's notation.
  await preview.getByRole('button', { name: 'Bb5', exact: true }).click();
  await preview.getByRole('button', { name: 'Open', exact: true }).click();
  await page.waitForURL('**/analysis');
  const frame = page.locator('[data-workspace-frame="analysis"]');
  // The current move in the notation is 3.Bb5.
  await expect(frame.locator('[data-current="true"]')).toHaveCount(1);
  await expect(frame.locator('[data-current="true"]')).toHaveText(/Bb5/);
});

test('Open without stepping still opens at the start, as before', async ({ page }) => {
  await seed(page);
  await page.getByRole('row', { name: /Continuity, White/ }).dblclick();
  await page.waitForURL('**/analysis');
  const frame = page.locator('[data-workspace-frame="analysis"]');
  await expect(frame.getByText('Bb5', { exact: true }).first()).toBeVisible();
  await expect(frame.locator('[data-current="true"]')).toHaveCount(0);
});

test('Back from a game returns to the same page, with the same game selected and in view', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 860 });
  // 250 games: three pages of a hundred.
  const pgn = readFileSync('data/fixtures/bench-1k.pgn', 'utf8')
    .split('\n\n[Event')
    .slice(0, 250)
    .join('\n\n[Event');
  await seed(page, pgn);
  const firstOnPageOne = await page.locator('tbody tr').first().getAttribute('data-game-row');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('2/3', { exact: true })).toBeVisible();
  await expect
    .poll(() => page.locator('tbody tr').first().getAttribute('data-game-row'))
    .not.toBe(firstOnPageOne);
  const row = page.locator('tbody tr').nth(60);
  await row.scrollIntoViewIfNeeded();
  await row.click();
  const chosen = await row.getAttribute('data-game-row');

  expect(chosen).toBeTruthy();

  await row.dblclick();
  await page.waitForURL('**/analysis');
  await page.goBack();
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();

  await expect(page.getByText('2/3', { exact: true })).toBeVisible();
  const selected = page.locator(`tbody tr[data-game-row="${chosen}"]`);
  await expect(selected).toHaveAttribute('aria-selected', 'true');
  await expect(selected).toBeInViewport();
  await expect(page.locator(`[data-library-preview="${chosen}"]`)).toBeVisible();
});

test('table keyboard selection reaches both ends and nested checkbox keys stay local', async ({
  page,
}) => {
  const games = readFileSync('data/fixtures/bench-1k.pgn', 'utf8')
    .split('\n\n[Event')
    .slice(0, 3)
    .join('\n\n[Event');
  await seed(page, games);
  const rows = page.locator('[data-library-row]');
  await expect(rows).toHaveCount(3);
  await rows.nth(1).focus();
  await rows.nth(1).press('End');
  await expect(rows.nth(2)).toBeFocused();
  await expect(rows.nth(2)).toHaveAttribute('aria-selected', 'true');
  await rows.nth(2).press('Home');
  await expect(rows.nth(0)).toBeFocused();
  await expect(rows.nth(0)).toHaveAttribute('aria-selected', 'true');
  await rows.nth(0).getByRole('checkbox').press('Enter');
  await expect(page).toHaveURL(/\/games/);
});
