/**
 * The posting index, chosen by a person (Phase 86): a companion collection
 * created with it, one converted to it from its storage section, both
 * answering in the Library as any collection does. Against the real
 * companion Playwright runs.
 */

import { expect, test, type Page } from '@playwright/test';

const READY = 'html[data-kingfisher-ready="true"]';

const PGNS = [
  '[Event "Posting 1"]\n[White "Postings, White"]\n[Black "Postings, Black"]\n[Date "2025.01.01"]\n[Result "1-0"]\n\n1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 1-0',
  '[Event "Posting 2"]\n[White "Rows, White"]\n[Black "Rows, Black"]\n[Date "2025.02.01"]\n[Result "1/2-1/2"]\n\n1. d4 d5 2. c4 c6 3. Nf3 Nf6 1/2-1/2',
].join('\n\n');

async function pairAndCreate(page: Page, collections: readonly (readonly [string, boolean])[]) {
  await page.getByRole('button', { name: 'Settings ⌘,' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('tab', { name: 'Companion' }).click();
  await settings.getByLabel('Pairing address').fill('http://127.0.0.1:4338#token=phase8-e2e-token');
  await settings.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(settings.getByText(/Paired with/)).toBeVisible();
  for (const [name, postings] of collections) {
    await settings.getByPlaceholder('New collection name').fill(name);
    const choice = settings.getByRole('checkbox', { name: /Posting index/ });
    if (postings) await choice.check();
    else await choice.uncheck();
    await settings.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(settings.getByText(name).first()).toBeVisible();
    await settings.getByPlaceholder('Paste a PGN collection…').fill(PGNS);
    await settings.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(settings.getByPlaceholder('Paste a PGN collection…')).toHaveValue('', {
      timeout: 30_000,
    });
  }
  await settings.getByRole('button', { name: 'Close' }).click();
}

async function openCollection(page: Page, name: string) {
  await page.goto('/databases');
  await page.locator(READY).waitFor();
  await page.getByText(name).first().click();
  return page.getByTestId('storage-section');
}

test('a collection keeps the posting index when asked, and another converts to it', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto('/analysis');
  await page.locator(READY).waitFor();
  const stamp = Date.now();
  const compactName = `Postings UI ${stamp}`;
  const rowsName = `Rows UI ${stamp}`;
  await pairAndCreate(page, [
    [compactName, true],
    [rowsName, false],
  ]);

  const compact = await openCollection(page, compactName);
  await expect(compact).toContainText('Posting index', { timeout: 15_000 });
  await expect(compact).toContainText('about a twentieth of the disk');
  await expect(compact.getByRole('button', { name: 'Convert to the posting index' })).toHaveCount(
    0,
  );

  const rows = await openCollection(page, rowsName);
  await expect(rows).not.toContainText('Posting index', { timeout: 15_000 });
  await rows.getByRole('button', { name: 'Convert to the posting index' }).click();
  await page.getByRole('button', { name: 'Convert', exact: true }).click();
  await expect(rows).toContainText('Posting index', { timeout: 60_000 });

  // Both still answer as collections: the Library lists their games.
  for (const name of [compactName, rowsName]) {
    await page.goto('/games');
    await page.locator(READY).waitFor();
    const picker = page.getByRole('combobox', { name: 'Database' });
    const value = await picker.locator('option', { hasText: name }).getAttribute('value');
    await picker.selectOption(value!);
    await expect(page.locator('[data-library-list]')).toContainText('Postings, White');
  }
});
