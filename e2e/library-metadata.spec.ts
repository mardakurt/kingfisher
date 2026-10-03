import { expect, test, type Page } from '@playwright/test';
import { settingsButton } from './support/settings-control';

const PGN = `[Event "Tagged A"]
[White "Alpha"]
[Black "Beta"]
[Annotator "Capablanca"]
[Source "Chess Fundamentals"]
[WhiteTeam "Havana"]
1. e4 e5 *

[Event "Tagged B"]
[White "Gamma"]
[Black "Delta"]
[Annotator "Lasker"]
[Source "Manual"]
[BlackTeam "Havana"]
1. d4 d5 *

[Event "No tags"]
[White "Epsilon"]
[Black "Zeta"]
1. c4 {Capablanca, Fundamentals, Havana: a comment is not a tag.} e5 *`;

async function search(page: Page) {
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  const mask = page.locator('[data-search-moves]');
  await mask.getByLabel('Annotator', { exact: true }).fill('capablanca');
  await mask.getByRole('button', { name: 'Search the moves' }).click();
  await expect(page.getByText(/1 of 3 games read contain it/)).toBeVisible();
  await expect(page.locator('[data-library-list]')).toContainText('Tagged A');
  await expect(page.locator('[data-library-list]')).not.toContainText('No tags');
  await mask.getByLabel('Annotator', { exact: true }).fill('');
  await mask.getByLabel('Team', { exact: true }).fill('Havana');
  await mask.getByRole('button', { name: 'Search the moves' }).click();
  await expect(page.getByText(/2 of 3 games read contain it/)).toBeVisible();
  await mask.getByLabel('PGN source', { exact: true }).fill('Fundamentals');
  await mask.getByRole('button', { name: 'Search the moves' }).click();
  await expect(page.getByText(/1 of 3 games read contain it/)).toBeVisible();
}

test('the Library searches the imported annotator, source and either team', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/games');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  await dialog.getByRole('textbox').fill(PGN);
  await dialog.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByText('3 games added to your database.')).toBeVisible();
  await search(page);
  await page.screenshot({ path: '/tmp/kingfisher-145-metadata-desktop.png' });
  const filters = page.locator('[data-library-filters]');
  await filters.getByLabel('Annotator', { exact: true }).fill('capablanca');
  await filters.getByRole('button', { name: 'Save query' }).click();
  const naming = page.getByRole('dialog', { name: 'Save query', exact: true });
  await naming.getByLabel('Name', { exact: true }).fill('Tagged Havana lesson');
  await naming.getByRole('button', { name: 'Save query', exact: true }).click();
  await expect(page.getByText('Saved query “Tagged Havana lesson”.')).toBeVisible();
  await page.reload();
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  const saved = page.locator('[data-saved-query="Tagged Havana lesson"]');
  await expect(saved).toContainText('PGN annotator contains "capablanca"');
  await saved.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(saved.locator('[data-saved-query-result]')).toHaveText('1 of 3 games read match');
  await saved.getByRole('button', { name: 'Use as filters' }).click();
  await expect(filters.getByLabel('Annotator', { exact: true })).toHaveValue('capablanca');
  await expect(filters.getByLabel('PGN source', { exact: true })).toHaveValue('Fundamentals');
  await expect(filters.getByLabel('Team', { exact: true })).toHaveValue('Havana');
});

test('metadata search reads PGN rather than dropping filters on a companion database', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/analysis');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await settingsButton(page).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('tab', { name: 'Companion' }).click();
  await settings.getByLabel('Pairing address').fill('http://127.0.0.1:4338#token=phase8-e2e-token');
  await settings.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(settings.getByText(/Paired with/)).toBeVisible();
  const name = `Metadata E2E ${Date.now()}`;
  await settings.getByPlaceholder('New collection name').fill(name);
  await settings.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(settings.getByText(name).first()).toBeVisible();
  await settings.getByPlaceholder('Paste a PGN collection…').fill(PGN);
  await settings.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByText(/\b3 games imported/)).toBeVisible();
  await settings.getByRole('button', { name: 'Close' }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/games');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  const picker = page.getByRole('combobox', { name: 'Database' });
  const value = await picker.locator('option', { hasText: name }).getAttribute('value');
  await picker.selectOption(value!);
  await expect(page.locator('[data-library-list]')).toContainText('No tags');
  await search(page);
});
