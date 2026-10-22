/**
 * Kingfisher with nothing but a browser.
 *
 * No companion is paired in any of these, and nothing outside the page is
 * started for them: they are the person on Windows, Linux, a Chromebook or an
 * iPad, for whom the website is the whole of Kingfisher. Until 2026-10-22 that
 * person had one collection of games (My games): "New collection" needed the
 * companion, an En Croissant database could only be read through it, and a
 * large PGN file failed before its first game.
 */

import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

import { gotoRoute, isNavigationAbortNoise } from './tools';

const READY = 'html[data-kingfisher-ready="true"]';
const EN_CROISSANT = path.resolve('src/database/encroissant/__fixtures__/en-croissant-0.15.db');
const CHESSBASE = ['cbh', 'cbg', 'cba', 'cbp', 'cbt', 'cbc', 'cbs', 'cbe'].map((ext) =>
  path.resolve(`src/database/chessbase/__fixtures__/world-ch/World-ch.${ext}`),
);

const CLUB_PGN = `[Event "Club"]
[White "Alpha, Ann"]
[Black "Beta, Bo"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0

[Event "Club"]
[White "Gamma, Cy"]
[Black "Alpha, Ann"]
[Result "0-1"]

1. e4 c5 2. Nf3 d6 0-1
`;

function collectErrors(page: Page, browserName: string): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    if (!isNavigationAbortNoise(error.message, browserName)) errors.push(error.message);
  });
  // A request this site answers 404 is a feature asking for something that is
  // not there — a companion probe aimed at the site itself was one.
  page.on('response', (response) => {
    if (response.status() === 404 && new URL(response.url()).origin === new URL(page.url()).origin)
      errors.push(`404 ${new URL(response.url()).pathname}`);
  });
  return errors;
}

const collections = (page: Page) => page.getByRole('list', { name: 'Collections' });

async function newCollection(page: Page, name: string) {
  await gotoRoute(page, '/databases');
  await page.locator(READY).waitFor();
  await page.getByRole('button', { name: 'New collection', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New collection' });
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}

test('a collection is made, filled, searched, explored, copied, renamed and deleted in the browser', async ({
  page,
  browserName,
}) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page, browserName);
  await newCollection(page, 'Club games');

  // Import PGN from the collection writes into the collection, not My games.
  await page.getByRole('button', { name: 'Import PGN' }).last().click();
  const importing = page.getByRole('dialog', { name: 'Import games into “Club games”' });
  await importing.locator('textarea').fill(CLUB_PGN);
  await importing.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByText('2 games added to “Club games”.')).toBeVisible({ timeout: 30_000 });

  await gotoRoute(page, '/databases');
  await page.locator(READY).waitFor();
  await expect(collections(page).getByRole('button', { name: /Club games/ })).toContainText(
    '2 games',
  );
  await expect(collections(page).getByRole('button', { name: /My games/ })).toContainText(
    '0 games',
  );

  // The Library lists it as a database, finds its games and opens one.
  await gotoRoute(page, '/games');
  await page.locator(READY).waitFor();
  const database = page.locator('[data-library-database]');
  const club = await database.locator('option', { hasText: 'Club games' }).getAttribute('value');
  await database.selectOption(club!);
  await expect(page.getByText('Gamma, Cy').first()).toBeVisible({ timeout: 30_000 });
  await page.getByText('Gamma, Cy').first().click();

  // The explorer reads it as a source of its own.
  await gotoRoute(page, '/analysis');
  await page.locator(READY).waitFor();
  await page.getByRole('tab', { name: 'Explorer' }).first().click();
  const source = page.getByLabel('Evidence source').first();
  const clubSource = await source
    .locator('option', { hasText: 'Club games' })
    .getAttribute('value');
  await source.selectOption(clubSource!);
  await expect(page.getByText('2 games here').first()).toBeVisible({ timeout: 30_000 });

  // Copy to My games, through the same transfer every collection uses.
  await gotoRoute(page, '/databases');
  await page.locator(READY).waitFor();
  await collections(page)
    .getByRole('button', { name: /Club games/ })
    .click();
  await page.getByRole('button', { name: 'Copy to…' }).click();
  const transfer = page.getByRole('dialog').last();
  const mine = await transfer
    .getByLabel('Destination collection')
    .locator('option', { hasText: 'My games' })
    .getAttribute('value');
  await transfer.getByLabel('Destination collection').selectOption(mine!);
  await transfer.getByRole('button', { name: 'Copy games' }).click();
  // A copy with nothing to warn about closes its dialog when it is done.
  await expect(transfer).toBeHidden({ timeout: 30_000 });
  await gotoRoute(page, '/databases');
  await page.locator(READY).waitFor();
  await expect(collections(page).getByRole('button', { name: /My games/ })).toContainText(
    '2 games',
  );

  // Renamed and deleted, which only a collection of its own can be.
  await collections(page)
    .getByRole('button', { name: /Club games/ })
    .click();
  await page.getByRole('button', { name: 'Rename' }).click();
  const rename = page.getByRole('dialog', { name: 'Rename collection' });
  await rename.getByLabel('Name').fill('Club 2026');
  await rename.getByRole('button', { name: 'Rename' }).click();
  await expect(page.getByRole('heading', { name: 'Club 2026', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete collection' }).click();
  await page
    .getByRole('dialog', { name: 'Delete this collection?' })
    .getByRole('button', { name: 'Delete permanently' })
    .click();
  await gotoRoute(page, '/databases');
  await page.locator(READY).waitFor();
  await expect(collections(page).getByRole('button', { name: /Club 2026/ })).toHaveCount(0);
  // My games keeps the copies.
  await expect(collections(page).getByRole('button', { name: /My games/ })).toContainText(
    '2 games',
  );
  expect(errors).toEqual([]);
});

test('an En Croissant database is chosen and read in the browser', async ({
  page,
  browserName,
}) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page, browserName);
  await gotoRoute(page, '/databases');
  await page.locator(READY).waitFor();
  await page.getByRole('button', { name: 'Import En Croissant', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import En Croissant database', exact: true });
  await dialog.getByLabel('En Croissant database file').setInputFiles(EN_CROISSANT);
  await expect(dialog.getByText('En Croissant database detected', { exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await expect(dialog).toContainText('60 games');
  await dialog.getByLabel('Imported collection name').fill('From En Croissant');
  await dialog.getByRole('button', { name: 'Import as Kingfisher collection' }).click();
  await expect(dialog).toContainText('Import complete.', { timeout: 120_000 });
  await expect(dialog).toContainText('60 / 60 examined · 60 imported · 0 duplicates · 0 rejected');
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await gotoRoute(page, '/databases');
  await page.locator(READY).waitFor();
  await expect(collections(page).getByRole('button', { name: /From En Croissant/ })).toContainText(
    '60 games',
  );
  expect(errors).toEqual([]);
});

test('a ChessBase database goes into a new collection in the browser', async ({
  page,
  browserName,
}) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page, browserName);
  await gotoRoute(page, '/databases');
  await page.locator(READY).waitFor();
  await page.getByRole('button', { name: 'Import ChessBase', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import ChessBase database', exact: true });
  await dialog.getByLabel('ChessBase files').setInputFiles(CHESSBASE);
  await expect(dialog.getByTestId('chessbase-inspection')).toContainText('23 games', {
    timeout: 60_000,
  });
  await dialog.getByLabel('Imported collection name').fill('World championships');
  await dialog.getByLabel('A new collection in this browser, named above').check();
  await dialog.getByRole('button', { name: 'Import 23 games', exact: true }).click();
  await expect(dialog.getByTestId('chessbase-progress')).toContainText('23 imported', {
    timeout: 60_000,
  });
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await gotoRoute(page, '/databases');
  await page.locator(READY).waitFor();
  await expect(
    collections(page).getByRole('button', { name: /World championships/ }),
  ).toContainText('23 games');
  await expect(collections(page).getByRole('button', { name: /My games/ })).toContainText(
    '0 games',
  );
  expect(errors).toEqual([]);
});

test('Import a large file sends a browser to the import that reads any size', async ({ page }) => {
  await gotoRoute(page, '/databases');
  await page.locator(READY).waitFor();
  await page.getByRole('button', { name: 'Import a large file…' }).click();
  await page
    .getByRole('dialog', { name: 'Import a large file' })
    .getByRole('button', { name: 'Choose a PGN file…' })
    .click();
  await expect(page.getByRole('dialog', { name: 'Import a game or position' })).toBeVisible();
});
