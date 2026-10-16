/**
 * A position analysed with the engine is kept in the analysis history and
 * listed on Recent, where it reopens on the board. A real search with the
 * browser Stockfish, stopped by hand once it is deep enough to count.
 */

import { expect, test } from '@playwright/test';

const READY = 'html[data-kingfisher-ready="true"]';
const AFTER_D4 = 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1';

test('an analysed position is listed on Recent and reopens on the board', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/recent');
  await page.locator(READY).waitFor();
  const section = page.getByRole('region', { name: 'Analysed positions' });
  await expect(section.locator('[data-analysed-empty]')).toBeVisible();

  await page.goto('/analysis');
  await page.locator(READY).waitFor();
  const board = page.getByRole('grid', { name: 'Chessboard' }).first();
  await board.getByRole('gridcell', { name: /^d2,/ }).click();
  await board.getByRole('gridcell', { name: /^d4,/ }).click();
  await page.getByRole('tab', { name: 'Engine', exact: true }).click();
  const panel = page.locator('[data-engine-panel-fen]');
  await panel.getByRole('button', { name: 'Start analysis (E)', exact: true }).click();
  // Deep enough to be a position somebody analysed, not one walked past.
  await expect(panel).toContainText(/depth (1[2-9]|[2-9]\d)\//, { timeout: 60_000 });
  await panel.getByRole('button', { name: 'Stop analysis (E)', exact: true }).click();

  await page.goto('/recent');
  await page.locator(READY).waitFor();
  const row = section.getByRole('button', { name: /depth \d+, Stockfish/ });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Untitled analysis');

  // Back on the board, at that position and nothing before it.
  await row.click();
  await expect(page).toHaveURL(/\/analysis/);
  await expect(page.getByRole('contentinfo')).toContainText(AFTER_D4);
  await expect(page.getByRole('contentinfo')).toContainText('0 half-moves');
});

test('a position is kept when the person leaves for Recent without stopping the engine', async ({
  page,
}) => {
  // Written only when a search settled, the history missed the commonest
  // case: analyse, then go somewhere else. The workspace unmounted before the
  // engine acknowledged any stop, and nothing was noted.
  test.setTimeout(120_000);
  await page.goto('/analysis');
  await page.locator(READY).waitFor();
  const board = page.getByRole('grid', { name: 'Chessboard' }).first();
  await board.getByRole('gridcell', { name: /^d2,/ }).click();
  await board.getByRole('gridcell', { name: /^d4,/ }).click();
  await page.getByRole('tab', { name: 'Engine', exact: true }).click();
  const panel = page.locator('[data-engine-panel-fen]');
  await panel.getByRole('button', { name: 'Start analysis (E)', exact: true }).click();
  await expect(panel).toContainText(/depth (1[2-9]|[2-9]\d)\//, { timeout: 60_000 });

  // Still running: leave by the sidebar, as a person would.
  await page.getByRole('link', { name: 'Recent', exact: true }).first().click();
  await expect(page).toHaveURL(/\/recent/);
  const section = page.getByRole('region', { name: 'Analysed positions' });
  await expect(section.getByRole('button', { name: /depth \d+, Stockfish/ })).toHaveCount(1);
});
