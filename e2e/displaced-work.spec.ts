import { expect, test, type Page } from '@playwright/test';

/**
 * The "+" beside Save replaced an unsaved analysis with an empty board and
 * said nothing: one misclick and the line was gone, with nothing in Recent
 * or undo to bring it back. Every replacement of unsaved work now keeps it
 * in a tab of its own, and says so.
 */

async function play(page: Page, from: string, to: string) {
  const board = page.getByRole('grid', { name: 'Chessboard' }).first();
  await board.getByRole('gridcell', { name: new RegExp(`^${from},`) }).click();
  await board.getByRole('gridcell', { name: new RegExp(`^${to},`) }).click();
}

test('an unsaved analysis replaced by "New analysis" is kept in a tab of its own', async ({
  page,
}) => {
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

  const strip = page.getByRole('tablist', { name: 'Workspace tabs' });
  const before = await strip.getByRole('tab').count();
  await page.getByRole('button', { name: 'New analysis' }).click();
  await expect(status).toContainText('0 half-moves');

  // Kept as a tab of its own, said once, and the notice gets out of the way:
  // a notice that waited for a click covered the controls under it.
  const notice = page.getByRole('status').filter({ hasText: 'kept in a tab of its own' });
  await expect(notice).toBeVisible();
  await expect(strip.getByRole('tab')).toHaveCount(before + 1);
  await expect(notice).toHaveCount(0, { timeout: 8_000 });

  const kept = strip.getByRole('tab', { name: /Unsaved analysis/ });
  await kept.click();
  await expect(status).toContainText('3 half-moves');
  await expect(status).toContainText(fen);
  await expect(status).toContainText('unsaved');

  // It survives a reload like any other tab's work.
  await page.reload();
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await expect(status).toContainText(fen);
});
