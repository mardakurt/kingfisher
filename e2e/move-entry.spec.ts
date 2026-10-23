/**
 * Moves typed rather than dragged: `T` opens a field under the board that
 * takes a move as it is written, plays it through the board's own handler,
 * refuses an illegal one and never guesses between two.
 */

import { expect, test, type Page } from '@playwright/test';

async function openAnalysis(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/analysis');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

async function loadFen(page: Page, fen: string) {
  await page.getByRole('button', { name: 'Import PGN or FEN' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  await dialog.getByRole('textbox').fill(fen);
  await dialog.getByRole('button', { name: 'Load position' }).click();
  await expect(dialog).toBeHidden();
}

test('a line typed into the move field is played, move after move', async ({ page }) => {
  await openAnalysis(page);
  await page.getByRole('grid', { name: 'Chessboard' }).click({ position: { x: 1, y: 1 } });
  await page.keyboard.press('t');
  const field = page.getByLabel('Type a move', { exact: true });
  await expect(field).toBeFocused();
  // The key that opened the field is not typed into it.
  await expect(field).toHaveValue('');

  for (const move of ['e4', 'c5', 'nf3', 'd6', 'd2d4', 'cxd4']) {
    await field.fill(move);
    await field.press('Enter');
    await expect(field).toHaveValue('');
  }
  for (const san of ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4']) {
    await expect(page.getByRole('button', { name: san, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('gridcell', { name: 'd4, Black pawn' })).toBeVisible();

  // Partial input lists what it could become; a listed move plays on click.
  await field.fill('N');
  const status = page.locator('#move-entry-status');
  await expect(status.getByRole('button', { name: 'Nxd4' })).toBeVisible();
  await status.getByRole('button', { name: 'Nxd4' }).click();
  await expect(page.getByRole('gridcell', { name: 'd4, White knight' })).toBeVisible();

  // Illegal input is refused and nothing is played.
  await field.fill('Qh5');
  await field.press('Enter');
  await expect(status).toContainText('“Qh5” is not a legal move here.');
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('gridcell', { name: 'd1, White queen' })).toBeVisible();

  // Escape closes the field and gives the keys back to the board.
  await field.press('Escape');
  await expect(field).toBeHidden();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('gridcell', { name: 'f3, White knight' })).toBeVisible();
});

test('an input two legal moves answer is not guessed', async ({ page }) => {
  await openAnalysis(page);
  await loadFen(page, '4k3/8/8/8/2p5/1P6/8/4KB2 w - - 0 1');
  await page.getByRole('button', { name: 'Type a move (T)' }).click();
  const field = page.getByLabel('Type a move', { exact: true });
  await field.fill('BXC4');
  await field.press('Enter');
  await expect(page.locator('#move-entry-status')).toContainText('“BXC4” could be bxc4 or Bxc4.');
  await expect(page.getByRole('gridcell', { name: 'c4, Black pawn' })).toBeVisible();

  // Case settles it, as it does in SAN.
  await field.fill('bxc4');
  await field.press('Enter');
  await expect(page.getByRole('gridcell', { name: 'c4, White pawn' })).toBeVisible();
});

test('a PGN or FEN pasted on the page, not in a field, opens Import with it', async ({ page }) => {
  await openAnalysis(page);
  const paste = (text: string) =>
    page.evaluate((value) => {
      const data = new DataTransfer();
      data.setData('text/plain', value);
      document.body.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      );
    }, text);

  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  // Text that is neither is left alone.
  await paste('just some words');
  await expect(dialog).toBeHidden();

  await paste('k7/4P3/8/8/8/8/8/4K3 w - - 0 1');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('textbox')).toHaveValue('k7/4P3/8/8/8/8/8/4K3 w - - 0 1');
  await dialog.getByRole('button', { name: 'Load position' }).click();
  await expect(page.getByRole('gridcell', { name: 'e7, White pawn' })).toBeVisible();

  await paste('[Event "Pasted"]\n\n1. d4 d5 2. c4 *');
  await expect(dialog.getByRole('textbox')).toHaveValue('[Event "Pasted"]\n\n1. d4 d5 2. c4 *');
  await expect(dialog.getByText('Detected a PGN game.')).toBeVisible();
  // Closing and reopening Import starts it empty again.
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Import PGN or FEN' }).click();
  await expect(dialog.getByRole('textbox')).toHaveValue('');
});
