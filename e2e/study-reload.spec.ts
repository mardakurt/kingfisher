/**
 * A move played in a study chapter survives a reload that comes before
 * autosave has written it (Phase 84). Before the fix the move was lost —
 * the `pagehide` flush was skipped while the page was still "visible", the
 * IndexedDB write never finished, and the studies page opened the stored
 * chapter over the restored draft — while the header said "Saved". It now
 * says "Edited" until the write lands, and the reload brings the move back
 * and writes it to the chapter.
 */

import { expect, test, type Locator, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

const play = async (board: Locator, from: string, to: string) => {
  await board.getByRole('gridcell', { name: new RegExp(`^${from},`) }).click();
  await board.getByRole('gridcell', { name: new RegExp(`^${to},`) }).click();
};

test('a chapter keeps a move played a moment before a reload', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/studies');
  await ready(page);
  await page.getByRole('button', { name: 'Start a study' }).first().click();
  const created = page.getByRole('dialog', { name: 'New study' });
  await created.getByLabel('Title').fill('Reload');
  await created.getByRole('button', { name: 'Create study', exact: true }).click();
  const rail = page.locator('[data-workspace-rail]').first();
  await rail.getByRole('button', { name: 'New chapter' }).click();
  const prompt = page.getByRole('dialog', { name: 'New chapter' });
  await prompt.getByLabel('Title').fill('Before the reload');
  await prompt
    .getByRole('button', { name: /Create|Add/ })
    .first()
    .click();
  await expect(page.locator('[data-study-save-status]')).toHaveText('Saved');

  const board = page.getByRole('grid', { name: 'Chessboard' }).first();
  await play(board, 'e2', 'e4');
  await play(board, 'e7', 'e5');
  // Not written yet, and it says so.
  await expect(page.locator('[data-study-save-status]')).toHaveText('Edited');

  await page.reload();
  await ready(page);
  const notation = page.locator('[data-notation-section]').first();
  await expect(notation).toContainText('e4');
  await expect(notation).toContainText('e5');
  // And the chapter record has them, not only the board.
  await expect(rail).toContainText('2 moves', { timeout: 10_000 });
  await expect(page.locator('[data-study-save-status]')).toHaveText('Saved');
});
