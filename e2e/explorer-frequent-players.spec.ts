import { expect, test } from '@playwright/test';
import { settingsButton } from './support/settings-control';
import { selectTool } from './tools';

test('My games names the frequent mover with distinct game counts, even on a narrow dock', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/games');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  await dialog
    .getByRole('textbox')
    .fill(
      `[Event "Loop"]\n[White "Alpha"]\n[Black "Beta"]\n1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 *\n\n[Event "Second"]\n[White "Alpha"]\n[Black "Gamma"]\n1. Nf3 d5 *`,
    );
  await dialog.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByText('2 games added to your database.')).toBeVisible();
  await page.goto('/analysis');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  const dock = page.locator('[data-workspace-dock]');
  await selectTool(page, dock, 'Explorer');
  await dock.getByRole('combobox', { name: 'Evidence source' }).selectOption('local-collection');
  const row = dock.locator('[data-explorer-row="Nf3"]');
  await expect(row.locator('[data-explorer-frequent-players]')).toHaveText('Alpha (2)');
  await expect(row.getByText('Alpha (2)', { exact: true }).first()).toBeVisible();
  await expect(row.locator('[data-explorer-frequent-players]')).toHaveAttribute(
    'title',
    'Alpha: 2 games',
  );
  await page.screenshot({ path: '/tmp/kingfisher-145-frequent-laptop.png' });
});

test('a companion collection names its frequent movers too, by distinct games', async ({
  page,
}) => {
  /*
    The same loop as above, in a SQLite collection: Alpha plays Nf3 from the
    start in two games, one of which returns to the start and plays it again.
    The companion reads movers from its per-game index (database.mjs
    `#withFrequentPlayers`), so this is the round trip, not the browser's
    own aggregation.
  */
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/analysis');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await settingsButton(page).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('tab', { name: 'Companion' }).click();
  await settings.getByLabel('Pairing address').fill('http://127.0.0.1:4338#token=phase8-e2e-token');
  await settings.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(settings.getByText(/Paired with/)).toBeVisible();
  const name = `Frequent E2E ${Date.now()}`;
  await settings.getByPlaceholder('New collection name').fill(name);
  await settings.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(settings.getByText(name).first()).toBeVisible();
  await settings
    .getByPlaceholder('Paste a PGN collection…')
    .fill(
      `[Event "Loop"]\n[White "Alpha"]\n[Black "Beta"]\n[Result "*"]\n\n1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 *\n\n` +
        `[Event "Second"]\n[White "Alpha"]\n[Black "Gamma"]\n[Result "*"]\n\n1. Nf3 d5 *\n\n` +
        `[Event "Third"]\n[White "Delta"]\n[Black "Gamma"]\n[Result "*"]\n\n1. Nf3 d5 *\n\n` +
        `[Event "Fourth"]\n[White "?"]\n[Black "Gamma"]\n[Result "*"]\n\n1. Nf3 d5 *`,
    );
  await settings.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByText(/\b4 games imported/)).toBeVisible();
  await settings.getByRole('button', { name: 'Close' }).click();

  const dock = page.locator('[data-workspace-dock]');
  await selectTool(page, dock, 'Explorer');
  const picker = dock.getByRole('combobox', { name: 'Evidence source' });
  const value = await picker.locator('option', { hasText: name }).getAttribute('value');
  await picker.selectOption(value!);
  const cell = dock.locator('[data-explorer-row="Nf3"] [data-explorer-frequent-players]');
  // Alpha twice (the loop is one game), Delta once, and "?" is nobody.
  await expect(cell).toHaveText('Alpha (2), Delta (1)');
  await expect(cell).toHaveAttribute('title', 'Alpha: 2 games, Delta: 1 game');
});
