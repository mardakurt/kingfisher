import { expect, test, type Page } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

/**
 * The bar under the notation annotates the move the board shows, as
 * ChessBase's notation toolbar does: a glyph appears in the notation and in
 * the PGN, a second click removes it, a move-quality glyph replaces another,
 * and at the start position there is nothing to annotate.
 */

async function playMove(page: Page, from: string, to: string) {
  await page.getByRole('gridcell', { name: new RegExp(`^${from},`) }).click();
  await page.getByRole('gridcell', { name: new RegExp(`^${to},`) }).click();
}

test('glyphs, comments and deletion from the bar under the notation', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/analysis');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();

  const bar = page.getByRole('toolbar', { name: 'Annotate the current move' });
  const notation = page.locator('[data-move-tree]');
  await expect(bar).toBeVisible();
  // The start position is not a move.
  await expect(bar.getByRole('button', { name: 'Good move' })).toBeDisabled();

  await playMove(page, 'e2', 'e4');
  await expect(notation).toContainText('e4');
  await playMove(page, 'e7', 'e5');
  await expect(notation).toContainText('e5');
  await playMove(page, 'g1', 'f3');
  await expect(notation).toContainText('Nf3');

  const good = bar.getByRole('button', { name: 'Good move', exact: true });
  await good.click();
  await expect(good).toHaveAttribute('aria-pressed', 'true');
  await expect(notation).toContainText('Nf3!');

  // A quality glyph replaces the other; a judgement of the position sits beside it.
  await bar.getByRole('button', { name: 'Interesting move' }).click();
  await expect(good).toHaveAttribute('aria-pressed', 'false');
  await bar.getByRole('button', { name: 'White is slightly better' }).click();
  await expect(notation).toContainText('Nf3!?');
  await expect(notation).toContainText('⩲');

  // The second click takes it off again.
  await bar.getByRole('button', { name: 'Interesting move' }).click();
  await expect(notation).not.toContainText('!?');

  await bar.getByRole('button', { name: 'Add comment' }).click();
  const comment = page.getByRole('dialog').getByRole('textbox');
  await comment.fill('Developing with tempo.');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(notation).toContainText('Developing with tempo.');

  // Back to 1...e5, then delete from there: only 1.e4 is left.
  await page.keyboard.press('ArrowLeft');
  await bar.getByRole('button', { name: 'Delete from this move' }).click();
  await expect(notation).toContainText('e4');
  await expect(notation).not.toContainText('e5');
  await expect(notation).not.toContainText('Nf3');
});
