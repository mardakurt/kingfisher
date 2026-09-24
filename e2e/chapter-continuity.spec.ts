/**
 * Regression: an edit to a study chapter survives going to Studies before
 * autosave has written it.
 *
 * Studies opened the stored chapter over the board whenever it loaded one,
 * and an edit made in the last 900 ms — autosave's debounce — was not yet in
 * storage. Comment on a move, click Studies, and the comment was gone from
 * the board and, once autosave ran on the reopened copy, from storage too.
 * Fixed in 65f532b ("keep the chapter the board already holds");
 * `study-reload.spec.ts` covers the reload, this covers the navigation.
 */

import { expect, test, type Page } from '@playwright/test';

import type { AppRepositories } from '../src/persistence/types';

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.waitForFunction(
    () => Boolean((globalThis as { __kingfisher?: unknown }).__kingfisher),
    undefined,
    { timeout: 30_000 },
  );
}

const storedChapterText = (page: Page) =>
  page.evaluate(async () => {
    const app = (globalThis as unknown as { __kingfisher: AppRepositories }).__kingfisher;
    const [study] = await app.studies.list();
    if (!study) return '';
    const full = await app.studies.get(study.id);
    return JSON.stringify(full?.chapters[0]?.tree ?? {});
  });

test('a chapter edit made just before opening Studies is kept', async ({ page }) => {
  await page.goto('/analysis');
  await ready(page);
  await page.getByRole('button', { name: 'Import PGN or FEN' }).click();
  const importer = page.getByRole('dialog', { name: 'Import a game or position' });
  await importer.getByRole('textbox').fill('1. e4 e5 2. Nf3 Nc6 *');
  await importer.getByRole('button', { name: 'Import games' }).click();
  await expect(importer).toBeHidden();

  await page.getByRole('button', { name: 'Save this analysis to a study' }).click();
  const save = page.getByRole('dialog', { name: 'Save to study' });
  await save.getByRole('combobox').selectOption({ label: 'New study…' });
  await save.getByLabel('New study title').fill('Continuity');
  await save.getByLabel('Chapter title').fill('Open game');
  await save.getByRole('button', { name: 'Save chapter' }).click();
  await expect(page.getByText('· saved', { exact: true })).toBeVisible({ timeout: 30_000 });

  const tree = page.locator('[data-move-tree]').first();
  await tree.getByRole('button', { name: 'Nf3', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Add comment/ }).click();
  const comment = page.getByRole('dialog', { name: /^Comment on/ });
  await comment.getByRole('textbox').fill('Written a moment before leaving.');
  await comment.getByRole('button', { name: 'Save comment' }).click();

  // At once — inside autosave's debounce.
  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('link', { name: 'Studies', exact: true })
    .click();
  await expect(page).toHaveURL(/\/studies/);

  await expect(tree).toContainText('Written a moment before leaving.');
  await expect
    .poll(() => storedChapterText(page), { timeout: 15_000 })
    .toContain('Written a moment before leaving.');
});
