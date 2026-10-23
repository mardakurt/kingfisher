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

  // Open but no longer focused, T takes the keys back to the field.
  await page.getByRole('grid', { name: 'Chessboard' }).click({ position: { x: 1, y: 1 } });
  await expect(field).not.toBeFocused();
  await page.keyboard.press('t');
  await expect(field).toBeFocused();
  await expect(field).toHaveValue('Qh5');

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
      const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
      // Firefox discards DataTransfer supplied to a synthetic ClipboardEvent.
      // Stub only the clipboard boundary; detection and Import run for real.
      Object.defineProperty(event, 'clipboardData', { value: data });
      document.body.dispatchEvent(event);
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

test('P plays through the line and stops at its end; pressed again it pauses', async ({ page }) => {
  await openAnalysis(page);
  await page.getByRole('button', { name: 'Import PGN or FEN' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  await dialog.getByRole('textbox').fill('[Event "Replay"]\n\n1. e4 e5 2. Nf3 Nc6 *');
  await dialog.getByRole('button', { name: 'Import games' }).click();
  await expect(dialog).toBeHidden();

  // At the end of the line, Play starts again from the beginning.
  await page.keyboard.press('End');
  await page.keyboard.press('p');
  const control = page.locator('[data-autoplay]');
  await expect(control).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('gridcell', { name: 'e4, White pawn' })).toBeVisible();
  await expect(page.getByRole('gridcell', { name: 'c6, Black knight' })).toBeVisible({
    timeout: 10_000,
  });
  await expect(control).toHaveAttribute('aria-pressed', 'false');

  // Paused part-way, it stays where it was.
  await page.keyboard.press('Home');
  await control.click();
  await expect(page.getByRole('gridcell', { name: 'e4, White pawn' })).toBeVisible();
  await control.click();
  await expect(control).toHaveAttribute('aria-pressed', 'false');
  const square = await page.getByRole('gridcell', { name: /^f3,/ }).getAttribute('aria-label');
  await page.waitForTimeout(2_000);
  await expect(page.getByRole('gridcell', { name: /^f3,/ })).toHaveAttribute('aria-label', square!);
});

test('a whole line typed or pasted into the field is played as far as it is legal', async ({
  page,
}) => {
  await openAnalysis(page);
  await page.getByRole('button', { name: 'Type a move (T)' }).click();
  const field = page.getByLabel('Type a move', { exact: true });
  await field.fill('1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6');
  await expect(page.locator('#move-entry-status')).toContainText('Enter plays the line');
  await field.press('Enter');
  await expect(field).toHaveValue('');
  await expect(page.getByRole('gridcell', { name: 'a6, Black pawn' })).toBeVisible();
  await expect(page.getByRole('gridcell', { name: 'c3, White knight' })).toBeVisible();

  // A line that breaks keeps what was not played, from the move that stopped it.
  await field.fill('6.Bg5 e6 7.Ke3 Be7');
  await field.press('Enter');
  await expect(page.locator('#move-entry-status')).toContainText(
    'Played 2 moves; “Ke3” is not a legal move there.',
  );
  await expect(field).toHaveValue('Ke3 Be7');
  await expect(page.getByRole('gridcell', { name: 'g5, White bishop' })).toBeVisible();
});
