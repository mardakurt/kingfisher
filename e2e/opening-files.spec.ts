/**
 * An opening file, organised and revisited (Phase 86): the open chapter is
 * linked from the file, a position is added with the line that reaches it
 * and a reason, the notes are kept as they are typed, a second file does not
 * show the first file's notes, and deleting a file leaves what it linked to.
 */

import { expect, test, type Page } from '@playwright/test';

import type { importGames } from '../src/persistence/import-game';
import type { AppRepositories } from '../src/persistence/types';

const READY = 'html[data-kingfisher-ready="true"]';

async function newFile(page: Page, name: string) {
  await page.getByRole('button', { name: 'New file', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New opening file' });
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByRole('button', { name: 'Create file' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('[data-opening-file-panel]')).toContainText(name);
}

test('an opening file links the open chapter, keeps positions with their line, and its notes', async ({
  page,
}) => {
  await page.goto('/analysis');
  await page.locator(READY).waitFor();
  await page.waitForFunction(() =>
    Boolean((globalThis as { __kingfisher?: unknown }).__kingfisher),
  );
  const ids = await page.evaluate(async () => {
    const app = (
      globalThis as unknown as {
        __kingfisher: AppRepositories & { importGames: typeof importGames };
      }
    ).__kingfisher;
    await app.importGames('[White "File"]\n[Black "Line"]\n\n1. e4 c5 2. Nf3 d6 *', app.games);
    const source = (await app.games.search({ player: 'File' })).games[0]!;
    const game = (await app.games.get(source.id))!;
    const study = await app.studies.create({ title: 'Sicilian work' });
    const chapter = await app.studies.createChapter({
      studyId: study.id,
      title: 'Open Sicilian',
      tree: game.tree,
    });
    return { study: study.id, chapter: chapter.id };
  });

  await page.goto(`/studies?study=${ids.study}&chapter=${ids.chapter}`);
  await page.locator(READY).waitFor();
  await expect(page.locator('[data-workspace-frame="studies"]')).toContainText('Open Sicilian');
  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('link', { name: 'Opening Files', exact: true })
    .click();
  const frame = page.locator('[data-workspace-frame="opening-files"]');
  await expect(frame).toBeVisible();

  await newFile(page, 'Black vs 1.e4');
  const panel = page.locator('[data-opening-file-panel]');

  // The chapter on the board is linked from here, and opens from here.
  await panel.getByRole('button', { name: 'Link the open chapter, “Open Sicilian”' }).click();
  await expect(panel.locator('[data-opening-file-linked="chapter"]')).toContainText(
    'Open Sicilian',
  );
  await expect(page.getByText('Linked Open Sicilian.')).toBeVisible();

  // A position is added with the moves that reach it, and the reason.
  await frame
    .locator('[data-board-surface]')
    .first()
    .click({ position: { x: 2, y: 2 } });
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  const positions = page.locator('[data-opening-file-positions]');
  await positions.getByLabel('Why this position (optional)').fill('The Sicilian itself');
  await positions.getByRole('button', { name: 'Add this position' }).click();
  const row = positions.locator('[data-opening-file-position]');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('1.e4 c5');
  await expect(row).toContainText('The Sicilian itself');
  await expect(
    positions.getByRole('button', { name: 'This position is in the file' }),
  ).toBeDisabled();

  // Notes are kept as they are typed, without leaving the box.
  const notes = panel.getByRole('textbox', { name: /Notes/ });
  await notes.fill('Najdorf first; the Dragon later.');
  await expect(panel.locator('[data-opening-file-notes-state]')).toHaveAttribute(
    'data-opening-file-notes-state',
    'saved',
  );

  // A second file starts with its own, empty notes — not the first file's.
  await newFile(page, 'White vs the French');
  await expect(panel.getByRole('textbox', { name: /Notes/ })).toHaveValue('');
  await page
    .locator('[data-opening-files]')
    .getByRole('button', { name: /Black vs 1\.e4/ })
    .click();
  await expect(panel.getByRole('textbox', { name: /Notes/ })).toHaveValue(
    'Najdorf first; the Dragon later.',
  );

  // And after a reload, still there.
  await page.reload();
  await page.locator(READY).waitFor();
  await page
    .locator('[data-opening-files]')
    .getByRole('button', { name: /Black vs 1\.e4/ })
    .click();
  await expect(panel.getByRole('textbox', { name: /Notes/ })).toHaveValue(
    'Najdorf first; the Dragon later.',
  );
  await expect(positions.locator('[data-opening-file-position]')).toContainText('1.e4 c5');

  // Deleting a file leaves the chapter it linked to.
  await page.getByRole('button', { name: 'Delete file', exact: true }).first().click();
  const confirm = page.getByRole('dialog', { name: 'Delete Black vs 1.e4?' });
  await confirm.getByRole('button', { name: 'Delete file' }).click();
  await expect(page.locator('[data-opening-files]')).not.toContainText('Black vs 1.e4');
  const chapterStill = await page.evaluate(
    async (id) =>
      Boolean(
        await (
          globalThis as unknown as { __kingfisher: AppRepositories }
        ).__kingfisher.studies.getChapter(id),
      ),
    ids.chapter,
  );
  expect(chapterStill).toBe(true);
});
