/**
 * Comparing the position on the board with another: an earlier one on the
 * line, or a pasted FEN. Both diagrams tint the squares that differ, and the
 * structural facts split into only here, only there and true of both.
 */

import { expect, test } from '@playwright/test';

import { selectTool } from './tools';

const READY = 'html[data-kingfisher-ready="true"]';
const CARLSBAD = 'rnbqkbnr/ppp2ppp/8/3p4/3P4/8/PP2PPPP/RNBQKBNR w KQkq - 0 4';

test('Features compares this position with an earlier one and with a pasted FEN', async ({
  page,
}) => {
  await page.goto('/analysis');
  await page.locator(READY).waitFor();
  await page.getByRole('button', { name: 'Import PGN or FEN' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  await dialog.getByRole('textbox').fill('1. d4 d5 2. c4 dxc4 3. e4 *');
  await dialog.getByRole('button', { name: /Import game/ }).click();
  await expect(dialog).toBeHidden();
  await page.keyboard.press('End');

  await selectTool(page, page.locator('main'), 'Features');
  const section = page.getByRole('region', { name: 'Compare positions' });
  const choose = section.getByRole('combobox', { name: 'Position to compare with' });
  // The line's earlier positions, nearest first, then the start.
  await expect(choose.locator('option').nth(1)).toHaveText('After 2...dxc4');
  await choose.selectOption({ label: 'Starting position' });

  await expect(section.locator('[data-compare-summary]')).toHaveText(
    '7 squares differ (tinted); the other side is to move.',
  );
  // The same seven squares on both diagrams.
  await expect(section.locator('[data-marked-square]')).toHaveCount(14);
  await expect(section.locator('[data-marked-square="d7"]')).toHaveCount(2);

  await choose.selectOption({ label: 'Paste a FEN…' });
  const fen = section.getByRole('textbox', { name: 'FEN to compare with' });
  await fen.fill('not a position');
  await expect(section.getByRole('alert')).toHaveText(
    'That is not a position Kingfisher can read.',
  );
  await fen.fill(CARLSBAD);
  await expect(section.locator('[data-compare-facts="only-second"]')).toContainText(
    'Black semi-open e-file',
  );
  await expect(section.locator('[data-compare-facts="only-first"]')).toContainText(
    'Black doubled c-pawns',
  );
  await expect(section.locator('[data-compare-facts="shared"]')).toContainText(
    'White semi-open c-file',
  );
});
