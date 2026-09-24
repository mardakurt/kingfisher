/**
 * Points and a time limit on a chapter question (Phase 85), ChessBase's
 * training annotation: the coach sets them from the move menu, the clock runs
 * only where one was set, an unanswered question runs out, points are all or
 * nothing, and every finished sitting is recorded and listed afterwards.
 */

import { expect, test, type Locator, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

const play = async (board: Locator, from: string, to: string) => {
  await board.getByRole('gridcell', { name: new RegExp(`^${from},`) }).click();
  await board.getByRole('gridcell', { name: new RegExp(`^${to},`) }).click();
};

async function solve(page: Page) {
  const inline = page.getByRole('button', { name: /^Solve \d+ question/ });
  if (await inline.isVisible().catch(() => false)) return inline.click();
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: /^Solve/ }).click();
}

test('a timed question runs out, points count only when found, and each sitting is kept', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/studies');
  await ready(page);
  await page.getByRole('button', { name: 'Start a study' }).first().click();
  const created = page.getByRole('dialog', { name: 'New study' });
  await created.getByLabel('Title').fill('Timed homework');
  await created.getByRole('button', { name: 'Create study', exact: true }).click();
  const rail = page.locator('[data-workspace-rail]').first();
  await rail.getByRole('button', { name: 'New chapter' }).click();
  const chapterPrompt = page.getByRole('dialog', { name: 'New chapter' });
  await chapterPrompt.getByLabel('Title').fill('Against the clock');
  await chapterPrompt
    .getByRole('button', { name: /Create|Add/ })
    .first()
    .click();

  const board = page.getByRole('grid', { name: 'Chessboard' }).first();
  await play(board, 'e2', 'e4');
  await play(board, 'e7', 'e5');
  await play(board, 'g1', 'f3');
  await play(board, 'b8', 'c6');

  const notation = page.locator('[data-virtualized-move-tree], [data-move-tree]').first();
  // Nf3: three points and four seconds. Nc6: two points, untimed.
  for (const [san, points, seconds] of [
    ['Nf3', '3', '4'],
    ['Nc6', '2', ''],
  ] as const) {
    await notation.getByRole('button', { name: san, exact: true }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Ask this move as a question…' }).click();
    const ask = page.getByRole('dialog', { name: new RegExp(`Ask ${san} as a question`) });
    await ask.getByLabel('Points (optional)').fill(points);
    await ask.getByLabel('Time limit in seconds (optional)').fill(seconds);
    await ask.getByRole('button', { name: 'Ask it' }).click();
  }
  // A fraction is refused before anything is written.
  await notation.getByRole('button', { name: 'Nc6', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Edit the question…' }).click();
  const edit = page.getByRole('dialog', { name: /The question at Nc6/ });
  await edit.getByLabel('Points (optional)').fill('1.5');
  await expect(edit.getByRole('alert')).toContainText('whole numbers');
  await expect(edit.getByRole('button', { name: 'Save' })).toBeDisabled();
  await edit.getByLabel('Points (optional)').fill('2');
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible({ timeout: 15_000 });

  for (const sitting of [1, 2]) {
    await solve(page);
    const dialog = page.getByRole('dialog', { name: 'Questions in Against the clock' });
    // The timed question: its points and a clock, left to run out.
    await expect(dialog.locator('[data-question-points]')).toHaveText('3 points');
    await expect(dialog.locator('[data-question-clock]')).toContainText('left');
    await expect(dialog.locator('[data-question-clock]')).toHaveText('Out of time', {
      timeout: 10_000,
    });
    await dialog.getByRole('button', { name: 'Next question' }).click();

    // The untimed one: points, no clock; found.
    await expect(dialog.locator('[data-question-points]')).toHaveText('2 points');
    await expect(dialog.locator('[data-question-clock]')).toHaveCount(0);
    await play(dialog.getByRole('grid', { name: 'Chessboard' }), 'b8', 'c6');
    await dialog.getByRole('button', { name: 'See how it went' }).click();

    const summary = dialog.locator('[data-question-summary]');
    await expect(summary).toContainText('You found 1 of 2.');
    await expect(dialog.locator('[data-question-score]')).toHaveText('2 of 5 points.');
    await expect(summary).toContainText('out of time');
    await expect(summary).toContainText('0/3');
    await expect(summary).toContainText('2/2');
    await expect(dialog.locator('[data-question-sittings]')).toContainText(
      sitting === 1 ? 'This sitting is recorded.' : '2 sittings recorded',
    );
    await dialog.getByRole('button', { name: 'Close' }).first().click();
  }

  // The sittings are stored, not held by the page: a reload finds both.
  await page.reload();
  await ready(page);
  const stored = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('kingfisher');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise<unknown[]>((resolve) => {
      const query = database
        .transaction('questionSessions', 'readonly')
        .objectStore('questionSessions')
        .getAll();
      query.onsuccess = () => resolve(query.result as unknown[]);
    });
    database.close();
    return rows as { answers: { outcome: string; earned?: number; seconds: number }[] }[];
  });
  expect(stored).toHaveLength(2);
  for (const sitting of stored) {
    expect(sitting.answers.map((answer) => answer.outcome)).toEqual(['timed-out', 'found']);
    expect(sitting.answers.map((answer) => answer.earned)).toEqual([0, 2]);
    expect(sitting.answers[0]!.seconds).toBe(4);
  }
});
