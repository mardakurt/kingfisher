import { test, expect } from '@playwright/test';
import path from 'node:path';

const fixture = path.resolve('src/database/encroissant/__fixtures__/en-croissant-0.15.db');

test('an En Croissant user imports the authentic database and opens its games', async ({
  page,
}, testInfo) => {
  /*
    The matrix runs four browser projects against one companion, whose data
    directory lives for the whole run. A collection named the same way in
    every project makes the second import "0 imported · 60 duplicates" — the
    companion is right, the test was not. One collection per project.
  */
  const collection = `En Croissant field test ${testInfo.project.name}`;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/databases');
  await page.getByRole('button', { name: 'Connections', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await settings.getByRole('tab', { name: 'Companion', exact: true }).click();
  await settings.getByLabel('Pairing address').fill('http://127.0.0.1:4338#token=phase8-e2e-token');
  await settings.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(settings.getByText(/Paired with/)).toBeVisible();
  await settings.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Import En Croissant', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import En Croissant database', exact: true });
  await dialog.getByLabel('En Croissant file path').fill(fixture);
  await dialog.getByRole('button', { name: 'Inspect database', exact: true }).click();
  await expect(dialog.getByText('En Croissant database detected', { exact: true })).toBeVisible();
  await expect(dialog).toContainText('60 games');
  await dialog.getByLabel('Imported collection name').fill(collection);
  await dialog
    .getByRole('button', { name: 'Import as Kingfisher collection', exact: true })
    .click();
  await expect(dialog).toContainText('Import complete.', { timeout: 60_000 });
  await expect(dialog).toContainText('60 imported · 0 duplicates · 0 rejected');
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('button', { name: collection })).toBeVisible();
  await page.getByRole('button', { name: collection }).click();
  await expect(page.getByText('60 games', { exact: false }).first()).toBeVisible();
  expect(errors).toEqual([]);
});
