import { expect, test, type Page } from '@playwright/test';
import { selectTool } from './tools';
import { settingsButton } from './support/settings-control';

// Explicit synthetic boundary fixture, never evidence of a real chess population.
const PGN = `[Event "Lower boundary"]
[White "Low"]
[Black "Low opponent"]
[WhiteElo "1600"]
[BlackElo "1600"]
[Result "1-0"]
1. e4 e5 1-0

[Event "Upper boundary"]
[White "High"]
[Black "High opponent"]
[WhiteElo "1800"]
[BlackElo "1800"]
[Result "0-1"]
1. d4 d5 0-1

[Event "Half point boundary"]
[White "Half"]
[Black "Half opponent"]
[WhiteElo "1799"]
[BlackElo "1800"]
[Result "1/2-1/2"]
1. c4 e5 1/2-1/2

[Event "Unrated"]
[White "Unrated"]
[Black "Unrated opponent"]
[Result "*"]
1. Nf3 Nf6 *`;

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

for (const sqlite of [false, true])
  test(`rating class filters ${sqlite ? 'SQLite' : 'My games'} without including an adjacent class or unknown ratings`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    let sourceId = 'local-collection';
    if (sqlite) {
      await page.goto('/analysis');
      await ready(page);
      await settingsButton(page).click();
      const settings = page.getByRole('dialog', { name: 'Settings' });
      await settings.getByRole('tab', { name: 'Companion' }).click();
      await settings
        .getByLabel('Pairing address')
        .fill('http://127.0.0.1:4338#token=phase8-e2e-token');
      await settings.getByRole('button', { name: 'Pair', exact: true }).click();
      await expect(settings.getByText(/Paired with/)).toBeVisible();
      const name = `Rating classes ${Date.now()}`;
      await settings.getByPlaceholder('New collection name').fill(name);
      await settings.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(settings.getByText(name).first()).toBeVisible();
      await settings.getByPlaceholder('Paste a PGN collection…').fill(PGN);
      await settings.getByRole('button', { name: 'Import', exact: true }).click();
      await expect(page.getByText(/\b4 games imported/)).toBeVisible();
      await settings.getByRole('button', { name: 'Close' }).click();
      const dock = page.locator('[data-workspace-dock]');
      await selectTool(page, dock, 'Explorer');
      sourceId = (await dock
        .getByRole('combobox', { name: 'Evidence source' })
        .locator('option', { hasText: name })
        .getAttribute('value'))!;
    } else {
      await page.goto('/games');
      await ready(page);
      await page.getByRole('button', { name: 'Import', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
      await dialog.getByRole('textbox').fill(PGN);
      await dialog.getByRole('button', { name: 'Import games' }).click();
      await expect(page.getByText('4 games added to your database.')).toBeVisible();
      await page.goto('/analysis');
      await ready(page);
    }
    const dock = page.locator('[data-workspace-dock]');
    await selectTool(page, dock, 'Explorer');
    const picker = dock.getByRole('combobox', { name: 'Evidence source' });
    await picker.selectOption(sourceId);
    await dock.getByRole('combobox', { name: 'Rating class', exact: true }).selectOption('1600');
    await expect(dock.locator('[data-explorer-source-line]')).toContainText(
      sqlite ? '1 game here' : '2 games here',
    );
    await expect(dock.locator('[data-explorer-row="e4"]')).toBeVisible();
    await expect(dock.locator('[data-explorer-row="d4"]')).toHaveCount(0);
    await expect(dock.locator('[data-explorer-row="Nf3"]')).toHaveCount(0);
    await expect(dock.locator('[data-explorer-row="c4"]')).toHaveCount(sqlite ? 0 : 1);
    await expect(dock.locator('[data-explorer-rating-class]')).toContainText(
      sqlite ? 'Higher recorded' : 'Mean of the recorded',
    );
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await selectTool(page, dock, 'Explorer');
      await expect(dock.getByRole('combobox', { name: 'Rating class', exact: true })).toHaveValue(
        '1600',
      );
      await expect(dock.locator('[data-explorer-source-line]')).toContainText(
        sqlite ? '1 game here' : '2 games here',
      );
    }
    await picker.selectOption('kingfisher-starter');
    await expect(dock.getByRole('combobox', { name: 'Rating class', exact: true })).toHaveCount(0);
    await expect(dock.locator('[data-rating-classes]')).toBeVisible({ timeout: 60_000 });
    await picker.selectOption('lichess-masters');
    await expect(dock.getByRole('combobox', { name: 'Rating class', exact: true })).toHaveCount(0);
    await expect(dock.getByText(/does not declare rating-class data/)).toBeVisible();
  });
