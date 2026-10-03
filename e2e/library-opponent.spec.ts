import { expect, test, type Page } from '@playwright/test';

import { settingsButton } from './support/settings-control';

test.use({ storageState: { cookies: [], origins: [] } });

/**
 * ChessBase's Library filter "Opponent": with a player, the games between
 * the two, the colour staying the player's. In My games and in a database
 * behind the companion — where a player typed as it is printed,
 * "Carlsen, Magnus", used to match nothing, because the companion compares
 * the lower-cased keys the games were stored under.
 */
const PGN = `[Event "Match 1"]
[White "Carlsen, Magnus"]
[Black "Nakamura, Hikaru"]
[Result "1-0"]

1. e4 e5 1-0

[Event "Match 2"]
[White "Nakamura, Hikaru"]
[Black "Carlsen, Magnus"]
[Result "1/2-1/2"]

1. d4 d5 1/2-1/2

[Event "Other"]
[White "Carlsen, Magnus"]
[Black "Caruana, Fabiano"]
[Result "0-1"]

1. c4 e5 0-1

[Event "Third party"]
[White "Caruana, Fabiano"]
[Black "Nakamura, Hikaru"]
[Result "1-0"]

1. Nf3 d5 1-0
`;

const READY = 'html[data-kingfisher-ready="true"]';

const events = (page: Page) =>
  page
    .locator('[data-library-list] tbody tr')
    .evaluateAll((rows) =>
      rows
        .map((row) => /Match 1|Match 2|Other|Third party/.exec(row.textContent ?? '')?.[0])
        .sort(),
    );

async function filterByPlayers(page: Page) {
  await page.getByRole('button', { name: /^Filters/ }).click();
  const filters = page.locator('[data-library-filters]');
  await filters.getByLabel('Player', { exact: true }).fill('Carlsen, Magnus');
  await filters.getByLabel('Opponent', { exact: true }).fill('Nakamura, Hikaru');
  await expect.poll(() => events(page)).toEqual(['Match 1', 'Match 2']);
  await expect(page.locator('[data-filter-chips]')).toContainText('Nakamura, Hikaru');

  // The colour is the player's: as White, only the game Carlsen had White.
  await filters
    .getByRole('radiogroup', { name: 'Colour' })
    .first()
    .getByRole('radio', { name: 'White' })
    .click();
  await expect.poll(() => events(page)).toEqual(['Match 1']);

  // The opponent alone: every game Nakamura played on the other side of White.
  await filters.getByLabel('Player', { exact: true }).fill('');
  await expect.poll(() => events(page)).toEqual(['Match 1', 'Third party']);
}

test('the Opponent filter finds the games between two players in My games', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/games');
  await page.locator(READY).waitFor();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  await dialog.getByRole('textbox').fill(PGN);
  await dialog.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByText('4 games added to your database.')).toBeVisible();

  await filterByPlayers(page);
  await expect(page).toHaveURL(/opponent=Nakamura/);
});

test('a companion database filters by player and opponent as they are printed', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto('/analysis');
  await page.locator(READY).waitFor();
  await settingsButton(page).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('tab', { name: 'Companion' }).click();
  await settings.getByLabel('Pairing address').fill('http://127.0.0.1:4338#token=phase8-e2e-token');
  await settings.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(settings.getByText(/Paired with/)).toBeVisible();
  const name = `Opponent E2E ${Date.now()}`;
  await settings.getByPlaceholder('New collection name').fill(name);
  await settings.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(settings.getByText(name).first()).toBeVisible();
  await settings.getByPlaceholder('Paste a PGN collection…').fill(PGN);
  await settings.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(settings.getByPlaceholder('Paste a PGN collection…')).toHaveValue('', {
    timeout: 30_000,
  });
  await expect(page.getByText(/\b4 games imported/)).toBeVisible();
  await settings.getByRole('button', { name: 'Close' }).click();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/games');
  await page.locator(READY).waitFor();
  const picker = page.getByRole('combobox', { name: 'Database' });
  const value = await picker.locator('option', { hasText: name }).getAttribute('value');
  await picker.selectOption(value!);
  await expect(page.locator('[data-library-list]')).toContainText('Third party');

  await filterByPlayers(page);
});
