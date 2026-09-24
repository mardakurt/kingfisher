import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { ChessBaseDatabase, isGame } from '@/database/chessbase/database';

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

/**
 * Handing work to a ChessBase user: a study saved as a new ChessBase
 * database. The download is unpacked with the system's own unzip and read
 * back with Kingfisher's ChessBase reader — the one checked against files
 * ChessBase wrote — so what is asserted is what the recipient opens.
 */
test('a study is saved as a ChessBase database that reads back move for move', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/studies');
  await ready(page);

  await page.getByRole('button', { name: 'Start a study' }).first().click();
  const created = page.getByRole('dialog', { name: 'New study' });
  await created.getByLabel('Title').fill('Open games for the club');
  await created.getByRole('button', { name: 'Create study', exact: true }).click();

  const rail = page.locator('[data-workspace-rail]').first();
  await rail.getByRole('button', { name: 'New chapter' }).click();
  const chapterPrompt = page.getByRole('dialog', { name: 'New chapter' });
  await chapterPrompt.getByLabel('Title').fill('Ruy Lopez');
  await chapterPrompt
    .getByRole('button', { name: /Create|Add/ })
    .first()
    .click();

  const board = page.getByRole('grid', { name: 'Chessboard' }).first();
  const play = async (from: string, to: string) => {
    await board.getByRole('gridcell', { name: new RegExp(`^${from},`) }).click();
    await board.getByRole('gridcell', { name: new RegExp(`^${to},`) }).click();
  };
  await play('e2', 'e4');
  await play('e7', 'e5');
  await play('g1', 'f3');
  await play('b8', 'c6');
  await play('f1', 'b5');

  await page.getByRole('button', { name: 'Publish…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Publish study' });
  await expect(dialog.getByTestId('publish-unsaved')).toBeHidden({ timeout: 30_000 });

  const download = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Save as ChessBase', exact: true }).click(),
  ]).then(([event]) => event);
  expect(download.suggestedFilename()).toBe('Open games for the club.zip');
  await expect(page.getByText(/1 game written as Open games for the club\.cbh\./)).toBeVisible();

  const directory = mkdtempSync(path.join(tmpdir(), 'kf-cbh-'));
  const zip = path.join(directory, 'download.zip');
  await download.saveAs(zip);
  execFileSync('unzip', ['-q', zip, '-d', directory]);
  const files = new Map<string, Uint8Array>();
  for (const name of readdirSync(directory)) {
    const extension = name.split('.').pop()!;
    if (extension !== 'zip')
      files.set(extension, new Uint8Array(readFileSync(path.join(directory, name))));
  }
  expect([...files.keys()].sort()).toEqual(['cba', 'cbc', 'cbg', 'cbh', 'cbp', 'cbs', 'cbt']);

  const database = new ChessBaseDatabase('Open games for the club', files);
  expect(database.inspect()).toMatchObject({ games: 1, tournaments: 1 });
  const game = database.game(1);
  if (!isGame(game)) throw new Error(game.reason);
  // A chapter is a game; its title is the event it belongs to.
  expect(game.pgn).toContain('[Event "Ruy Lopez"]');
  expect(game.pgn).toMatch(/1\. e4 e5 2\. Nf3 Nc6 3\. Bb5/);
});
