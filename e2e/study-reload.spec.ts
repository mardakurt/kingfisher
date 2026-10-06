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

test('a slow reload never highlights a chapter other than the one it restores', async ({
  page,
}) => {
  /*
    Under slowed storage a reload highlighted chapter 1 for up to 0.84 s
    before converging on the chapter actually restored (closure log, reload
    probe): before the restore settled the board was not yet a chapter, and
    the list fell back to the first one.
  */
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/studies');
  await ready(page);
  await page.getByRole('button', { name: 'Start a study' }).first().click();
  const created = page.getByRole('dialog', { name: 'New study' });
  await created.getByLabel('Title').fill('Three chapters');
  await created.getByRole('button', { name: 'Create study', exact: true }).click();
  const rail = page.locator('[data-workspace-rail]').first();
  for (const title of ['Alpha', 'Bravo', 'Charlie']) {
    await rail.getByRole('button', { name: 'New chapter' }).click();
    const prompt = page.getByRole('dialog', { name: 'New chapter' });
    await prompt.getByLabel('Title').fill(title);
    await prompt
      .getByRole('button', { name: /Create|Add/ })
      .first()
      .click();
    await expect(prompt).toBeHidden();
  }
  const current = rail.locator('[aria-current="true"]');
  await expect(current).toContainText('Charlie');
  const board = page.getByRole('grid', { name: 'Chessboard' }).first();
  await play(board, 'g1', 'f3');
  await expect(page.locator('[data-study-save-status]')).toHaveText('Saved');

  // From the next load on: every chapter read takes 0.9 s, and every chapter
  // the list ever marks current is recorded.
  await page.addInitScript(() => {
    const seen: string[] = [];
    (globalThis as unknown as { __kfSelections: string[] }).__kfSelections = seen;
    new MutationObserver(() => {
      for (const row of document.querySelectorAll('[data-workspace-rail] [aria-current="true"]')) {
        const text = (row.textContent ?? '').trim();
        if (seen.at(-1) !== text) seen.push(text);
      }
    }).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-current'],
    });
    let held: unknown;
    Object.defineProperty(globalThis, '__kingfisher', {
      configurable: true,
      get: () => held,
      set(value: { studies: { getChapter: (id: string) => Promise<unknown> } }) {
        const read = value.studies.getChapter.bind(value.studies);
        value.studies.getChapter = async (id) => {
          await new Promise((resolve) => setTimeout(resolve, 900));
          return read(id);
        };
        held = value;
      },
    });
  });
  await page.reload();
  await ready(page);
  await expect(current).toContainText('Charlie', { timeout: 20_000 });
  await expect(page.locator('[data-notation-section]').first()).toContainText('Nf3');
  // Settled; nothing else may have been marked current on the way.
  await page.waitForTimeout(1_500);
  const selections = await page.evaluate(
    () => (globalThis as unknown as { __kfSelections: string[] }).__kfSelections,
  );
  expect(selections.length).toBeGreaterThan(0);
  expect(selections.filter((text) => !text.includes('Charlie'))).toEqual([]);
});
