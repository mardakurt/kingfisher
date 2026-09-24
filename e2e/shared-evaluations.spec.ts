/**
 * Evaluations handed from one Kingfisher to another as a file (Phase 85) —
 * the owner's choice of ChessBase's Let's Check: nothing leaves a machine
 * unless a person saves the file and gives it on. Two browser profiles that
 * share nothing: one runs a real deep analysis and exports its evaluations;
 * the other imports the file and shows them at the position, labelled with
 * the engine, the depth and who exported them.
 */

import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

const SPANISH = 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3';

test('evaluations exported by one profile appear, labelled, in another that imports the file', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const exporter = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const a = await exporter.newPage();
  await a.goto(`/analysis?fen=${encodeURIComponent(SPANISH)}`);
  await ready(a);
  await a.getByRole('tab', { name: 'Engine', exact: true }).click();
  const deep = a.getByRole('region', { name: 'Deep analysis' });
  await deep.getByRole('button', { name: 'Deepen from here…' }).click();
  const form = deep.locator('[data-deepen-form]');
  await form.getByLabel('Moves per position').selectOption('1');
  await form.getByLabel('Plies').selectOption('4');
  await form.getByLabel('Seconds each').selectOption('1');
  await form.getByRole('button', { name: 'Start' }).click();
  await expect(deep).toHaveAttribute('data-deepen', 'done', { timeout: 120_000 });

  const shared = a.getByRole('region', { name: 'Evaluations from files' });
  await shared.getByRole('button', { name: 'Export mine…' }).click();
  await shared.getByLabel('Your name in the file (optional)').fill('Coach Ana');
  const download = await Promise.all([
    a.waitForEvent('download'),
    shared.getByRole('button', { name: 'Save file' }).click(),
  ]).then(([event]) => event);
  expect(download.suggestedFilename()).toMatch(/^kingfisher-evaluations-\d{4}-\d\d-\d\d\.json$/);
  const path = await download.path();
  const file = JSON.parse(readFileSync(path, 'utf8')) as {
    from: string;
    evaluations: { engine: string; depth: number }[];
  };
  expect(file.from).toBe('Coach Ana');
  expect(file.evaluations.length).toBeGreaterThanOrEqual(3);
  expect(file.evaluations[0]!.engine).toMatch(/Stockfish/);
  await exporter.close();

  // A second profile that has never searched anything.
  const importer = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const b = await importer.newPage();
  await b.goto(`/analysis?fen=${encodeURIComponent(SPANISH)}`);
  await ready(b);
  await b.getByRole('tab', { name: 'Engine', exact: true }).click();
  const received = b.getByRole('region', { name: 'Evaluations from files' });
  await expect(received).toHaveAttribute('data-shared-evaluations', '0');
  await received.locator('[data-shared-evaluations-input]').setInputFiles(path);
  await expect(b.getByText(/evaluations? added from .*, exported by Coach Ana\./)).toBeVisible();
  await expect(received).toHaveAttribute('data-shared-evaluations', /[1-9]/);
  await expect(received.locator('[data-shared-provenance]').first()).toContainText(
    /Stockfish[^·]* · depth \d+ · .+ · from Coach Ana \(kingfisher-evaluations-/,
  );
  // The same file again adds nothing.
  await received.locator('[data-shared-evaluations-input]').setInputFiles(path);
  await expect(b.getByText(/^0 evaluations added/)).toBeVisible();
  await importer.close();
});
