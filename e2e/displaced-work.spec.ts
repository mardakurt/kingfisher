import { expect, test, type Page } from '@playwright/test';

/**
 * The "+" beside Save replaced an unsaved analysis with an empty board and
 * said nothing: one misclick and the line was gone, with nothing in Recent
 * or undo to bring it back. Every replacement of unsaved work now says so,
 * and the work opens again in a tab of its own.
 */

async function play(page: Page, from: string, to: string) {
  const board = page.getByRole('grid', { name: 'Chessboard' }).first();
  await board.getByRole('gridcell', { name: new RegExp(`^${from},`) }).click();
  await board.getByRole('gridcell', { name: new RegExp(`^${to},`) }).click();
}

test('an unsaved analysis replaced by "New analysis" can be opened again', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/analysis');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();

  await play(page, 'e2', 'e4');
  await play(page, 'c7', 'c5');
  await play(page, 'g1', 'f3');
  const status = page.getByRole('contentinfo');
  await expect(status).toContainText('3 half-moves');
  const fen = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';
  await expect(status).toContainText(fen);

  await page.getByRole('button', { name: 'New analysis' }).click();
  await expect(status).toContainText('0 half-moves');

  const notice = page
    .getByRole('status')
    .filter({ hasText: 'The unsaved analysis on the board was replaced.' });
  await expect(notice).toBeVisible();
  // Still there after the four seconds a confirmation gets.
  await page.waitForTimeout(4_500);
  await expect(notice).toBeVisible();

  const strip = page.getByRole('tablist', { name: 'Workspace tabs' });
  const before = await strip.getByRole('tab').count();
  await notice.getByRole('button', { name: 'Open it in a new tab' }).click();

  await expect(notice).toHaveCount(0);
  await expect(strip.getByRole('tab')).toHaveCount(before + 1);
  await expect(status).toContainText('3 half-moves');
  await expect(status).toContainText(fen);
  await expect(status).toContainText('unsaved');
});
