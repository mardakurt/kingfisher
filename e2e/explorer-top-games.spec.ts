import { expect, test, type Page } from '@playwright/test';

import { selectTool } from './tools';

test.use({ storageState: { cookies: [], origins: [] } });

/**
 * The Explorer's top games, as ChessBase lists them under the reference
 * moves: the move each game played at this position, the players with their
 * ratings, the date, ECO and length — and a click opens the game here, at the
 * position being explored, not at move one.
 */
async function playMove(page: Page, from: string, to: string) {
  await page.getByRole('gridcell', { name: new RegExp(`^${from},`) }).click();
  await page.getByRole('gridcell', { name: new RegExp(`^${to},`) }).click();
}

test('top games name the move each played here, and open at this position', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/analysis');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  const dock = page.locator('[data-workspace-dock]');
  await selectTool(page, dock, 'Explorer');
  await expect(dock.getByRole('combobox', { name: 'Evidence source' })).toHaveValue(
    'kingfisher-starter',
    { timeout: 120_000 },
  );
  await expect(dock.locator('[data-explorer-row="e4"]')).toBeVisible({ timeout: 60_000 });

  await playMove(page, 'd2', 'd4');
  await playMove(page, 'g8', 'f6');
  const notation = page.locator('[data-move-tree]');
  await expect(notation.locator('[data-current="true"]')).toHaveText(/Nf6/);

  const heading = dock.getByRole('heading', { name: 'Top games' });
  await expect(heading).toBeVisible({ timeout: 60_000 });
  const section = heading.locator('xpath=ancestor::section[1]');
  const first = section.getByRole('button', { name: /^Open / }).first();
  const played = (await first.locator('[data-top-game-move]').innerText()).trim();
  // A real move from this position, one the explorer's own table lists.
  expect(played).toMatch(/^[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](=[QRBN])?[+#]?$|^O-O(-O)?$/);
  await expect(dock.locator(`[data-explorer-row="${played}"]`)).toBeVisible();
  // The table's Last column (shown when the panel is wide) is the source's latest year.
  await expect(
    dock.locator(`[data-explorer-row="${played}"] [data-explorer-last-played]`),
  ).toHaveText(/^(19|20)\d{2}$/);
  // Strongest players: who made the move in the strongest games the pack keeps after
  // it, with their ratings (which side is whose is checked in move-players.test.ts).
  await expect(
    dock.locator(`[data-explorer-row="${played}"] [data-explorer-players]`),
  ).toHaveAttribute('title', /^[^,()]+, [^()]+ \(\d{4}\)/);
  // Ratings and a date beside the names.
  await expect(first).toContainText(/\(\d{4}\)/);
  await expect(first).toContainText(/\b(19|20)\d{2}\b/);

  await first.click();
  await expect(page.getByText('From Kingfisher Starter Reference').first()).toBeVisible();
  // Still after 1...Nf6, and the game's next move is the one the row named.
  await expect(notation.locator('[data-current="true"]')).toHaveText(/Nf6/);
  await page.keyboard.press('ArrowRight');
  await expect(notation.locator('[data-current="true"]')).toHaveText(new RegExp(played));
});
