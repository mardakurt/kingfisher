/**
 * A game's details edited on the board: Document actions → Game details…,
 * saved into the PGN as one change, refused when a date or rating is not
 * one, and undone in one step.
 */

import { expect, test } from '@playwright/test';

const READY = 'html[data-kingfisher-ready="true"]';

test('game details are edited on the board and written into the PGN', async ({ page }) => {
  await page.goto('/analysis');
  await page.locator(READY).waitFor();
  await page.getByRole('button', { name: 'Import PGN or FEN' }).click();
  const importer = page.getByRole('dialog', { name: 'Import a game or position' });
  await importer
    .getByRole('textbox')
    .fill('[Event "Club"]\n[White "Smth, J"]\n[Black "Jones, A"]\n[Result "*"]\n\n1. e4 e5 *');
  await importer.getByRole('button', { name: /Import game/ }).click();
  await expect(importer).toBeHidden();

  await page.getByRole('button', { name: 'Document actions' }).click();
  await page.getByRole('menuitem', { name: 'Game details…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Game details' });
  await expect(dialog.getByLabel('White', { exact: true })).toHaveValue('Smth, J');

  await dialog.getByLabel('White', { exact: true }).fill('Smith, John');
  await dialog.getByLabel('Date').fill('2026.13');
  await expect(dialog.getByRole('alert')).toContainText('Date is written YYYY.MM.DD');
  await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();
  await dialog.getByLabel('Date').fill('2026.10.16');
  await dialog.getByLabel('Result').selectOption('1-0');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();

  // The header card on the notation reads the new values.
  const header = page.locator('[data-game-header]');
  await expect(header).toContainText('Smith, John');
  await expect(header.locator('[data-game-result]')).toHaveText('1-0');
  await expect(header).toContainText('2026.10.16');

  // One change, one undo.
  await page.locator('[data-move-tree]').first().click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(header).toContainText('Smth, J');
  await expect(header.locator('[data-game-result]')).toHaveText('–');
});
