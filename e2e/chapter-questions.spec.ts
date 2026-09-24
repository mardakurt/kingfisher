/**
 * Questions inside a study chapter (Phase 84): a coach marks a move as a
 * question from the notation; the chapter asks it at the position before,
 * with Training's own answering control; the summary names what was found
 * and what was missed, and the missed questions go to Training on request.
 */

import { expect, test, type Locator, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

const play = async (board: Locator, from: string, to: string) => {
  await board.getByRole('gridcell', { name: new RegExp(`^${from},`) }).click();
  await board.getByRole('gridcell', { name: new RegExp(`^${to},`) }).click();
};

async function solveButton(page: Page) {
  const inline = page.getByRole('button', { name: /^Solve \d+ question/ });
  if (await inline.isVisible().catch(() => false)) return inline.click();
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: /^Solve/ }).click();
}

test('a chapter asks its questions, and the missed ones go to Training', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/studies');
  await ready(page);
  await page.getByRole('button', { name: 'Start a study' }).first().click();
  const created = page.getByRole('dialog', { name: 'New study' });
  await created.getByLabel('Title').fill('Homework');
  await created.getByRole('button', { name: 'Create study', exact: true }).click();
  const rail = page.locator('[data-workspace-rail]').first();
  await rail.getByRole('button', { name: 'New chapter' }).click();
  const chapterPrompt = page.getByRole('dialog', { name: 'New chapter' });
  await chapterPrompt.getByLabel('Title').fill('Open game basics');
  await chapterPrompt
    .getByRole('button', { name: /Create|Add/ })
    .first()
    .click();

  const board = page.getByRole('grid', { name: 'Chessboard' }).first();
  await play(board, 'e2', 'e4');
  await play(board, 'e7', 'e5');
  await play(board, 'g1', 'f3');
  await play(board, 'b8', 'c6');

  // Two questions, marked from the notation's move menu.
  for (const [san, prompt] of [
    ['Nf3', 'Develop with a threat.'],
    ['Nc6', 'Defend the pawn.'],
  ] as const) {
    await page
      .locator('[data-virtualized-move-tree], [data-move-tree]')
      .first()
      .getByRole('button', { name: san, exact: true })
      .click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Ask this move as a question…' }).click();
    const ask = page.getByRole('dialog', { name: new RegExp(`Ask ${san} as a question`) });
    await ask.getByLabel('Question').fill(prompt);
    await ask.getByRole('button', { name: 'Ask it' }).click();
  }
  await expect(page.locator('[data-question-marker]')).toHaveCount(2);
  // Stored with the chapter, not only on the board.
  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await ready(page);
  await expect(page.locator('[data-question-marker]')).toHaveCount(2);

  // The same questions, handed out on paper: a worksheet with solutions last.
  await page.getByRole('button', { name: 'Publish…', exact: true }).click();
  const publish = page.getByRole('dialog', { name: 'Publish study' });
  await expect(publish.getByText('(2 questions)')).toBeVisible();
  await publish.getByRole('checkbox', { name: /As a worksheet/ }).check();
  const download = await Promise.all([
    page.waitForEvent('download'),
    publish.getByRole('button', { name: 'Save as HTML', exact: true }).click(),
  ]).then(([event]) => event);
  const sheet = await new Promise<string>((resolve, reject) => {
    void download.createReadStream().then((stream) => {
      let text = '';
      stream.setEncoding('utf8');
      stream.on('data', (chunk) => (text += chunk));
      stream.on('end', () => resolve(text));
      stream.on('error', reject);
    });
  });
  expect(sheet).toContain('Worksheet · 2 questions');
  expect(sheet).toContain('White to play. Develop with a threat.');
  expect(sheet).toContain('Black to play. Defend the pawn.');
  expect(sheet.split('Solutions')[1]).toContain('2… Nc6');
  await publish
    .getByRole('button', { name: /Close|Cancel/ })
    .first()
    .click();

  await solveButton(page);
  const dialog = page.getByRole('dialog', { name: 'Questions in Open game basics' });
  await expect(dialog.locator('[data-question-prompt]')).toHaveText('Develop with a threat.');
  const answerBoard = dialog.getByRole('grid', { name: 'Chessboard' });
  await play(answerBoard, 'g1', 'f3');
  await dialog.getByRole('button', { name: 'Next question' }).click();

  await expect(dialog.locator('[data-question-prompt]')).toHaveText('Defend the pawn.');
  await play(dialog.getByRole('grid', { name: 'Chessboard' }), 'f7', 'f6');
  await dialog.getByRole('button', { name: 'See how it went' }).click();

  const summary = dialog.locator('[data-question-summary]');
  await expect(summary).toContainText('You found 1 of 2.');
  await expect(summary).toContainText('2. Nf3');
  await expect(summary).toContainText('found');
  await expect(summary).toContainText('2... Nc6');
  await expect(summary).toContainText('missed');

  await dialog.getByRole('button', { name: 'Add 1 to Training' }).click();
  await expect(page.getByText('1 question is in Training now.')).toBeVisible();

  await page.goto('/training');
  await ready(page);
  await expect(page.getByText('Defend the pawn.').first()).toBeVisible();
});
