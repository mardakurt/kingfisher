import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { isNavigationAbortNoise } from './tools';

const FIXTURES = path.resolve('src/database/chessbase/__fixtures__/world-ch');
const FILES = ['cbh', 'cbg', 'cba', 'cbp', 'cbt', 'cbc', 'cbs', 'cbe'].map((ext) =>
  path.join(FIXTURES, `World-ch.${ext}`),
);

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

/**
 * A club player brings the database they already have: the files of a
 * ChessBase database, chosen together, read in the browser and stored in
 * their own collection with every game still saying where it came from.
 */
test('a ChessBase database is read in the browser into My games, provenance kept', async ({
  page,
  browserName,
}) => {
  const errors: string[] = [];
  // A cancelled load at a navigation is engine noise (e2e/tools.ts), not an error.
  page.on('pageerror', (error) => {
    if (!isNavigationAbortNoise(error.message, browserName)) errors.push(error.message);
  });
  await page.goto('/databases');
  await ready(page);

  await page.getByRole('button', { name: 'Import ChessBase', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import ChessBase database', exact: true });
  await expect(dialog).toBeVisible();

  // Only the header file: refused with the reason, before anything is read.
  await dialog.getByLabel('ChessBase files').setInputFiles([FILES[0]!]);
  await expect(dialog.getByRole('alert')).toContainText('needs at least its .cbh and .cbg files');

  await dialog.getByLabel('ChessBase files').setInputFiles(FILES);
  const inspection = dialog.getByTestId('chessbase-inspection');
  await expect(inspection).toBeVisible({ timeout: 30_000 });
  await expect(inspection).toContainText('ChessBase database: World-ch');
  await expect(inspection).toContainText('23 games');
  await expect(inspection).toContainText('38 players');
  await expect(inspection).toContainText('1886.01.11 – 1927.10.13');
  await expect(inspection).toContainText('Sources named in the database: MainBase');
  await expect(dialog.getByLabel('Imported collection name')).toHaveValue('World-ch');

  await dialog.getByRole('button', { name: 'Import 23 games', exact: true }).click();
  const progress = dialog.getByTestId('chessbase-progress');
  await expect(progress).toContainText('Import complete.', { timeout: 60_000 });
  await expect(progress).toContainText('23 / 23 examined · 23 imported · 0 duplicates · 0 skipped');

  // The loss report: machine-readable, and the same counts (Phase 86, P0.4).
  const download = page.waitForEvent('download');
  await progress.locator('[data-chessbase-loss-report]').click();
  const file = await download;
  const report = JSON.parse(readFileSync((await file.path())!, 'utf8')) as {
    kind: string;
    examined: number;
    imported: number;
    refused: number;
    leftBehind: { what: string; games: number; items: number }[];
    matrix: { field: string }[];
  };
  expect(report.kind).toBe('kingfisher-chessbase-import-loss-report');
  expect(report).toMatchObject({ examined: 23, imported: 23, refused: 0 });
  expect(report.matrix.map((row) => row.field)).toContain('Main line');
  for (const entry of report.leftBehind) expect(entry.items).toBeGreaterThanOrEqual(entry.games);

  // The same files again: nothing is added twice.
  await dialog.getByLabel('ChessBase files').setInputFiles(FILES);
  await expect(inspection).toContainText('23 games', { timeout: 30_000 });
  await dialog.getByRole('button', { name: 'Import 23 games', exact: true }).click();
  await expect(progress).toContainText('Import complete.', { timeout: 60_000 });
  await expect(progress).toContainText('0 imported · 23 duplicates · 0 skipped');
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();

  // The games are in the player's own collection, and one opens with its provenance.
  await page.goto('/games');
  await ready(page);
  await page.getByLabel('Search games').fill('Zukertort');
  const row = page.getByText(/Zukertort, Johannes Hermann/).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.click();
  await expect(page.getByText('World-ch01 Steinitz-Zukertort +10-5=5').first()).toBeVisible({
    timeout: 30_000,
  });
  expect(errors).toEqual([]);
});
