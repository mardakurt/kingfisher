import { expect, test } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

/**
 * The built-in reference in the Library, searched by player as ChessBase
 * searches Mega Database: the search box finds a player by part of a name,
 * the other filters narrow that player's games, the pack's per-player limit is
 * said rather than hidden, and a game previews and opens as source material.
 * Against the real Kingfisher Starter Reference, offline.
 */
test('the built-in reference is searched by player in the Library', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/games');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();

  const picker = page.getByRole('combobox', { name: 'Database' });
  await expect(picker.locator('option[value="reference:kingfisher-starter"]')).toHaveCount(1, {
    timeout: 120_000,
  });
  await picker.selectOption('reference:kingfisher-starter');
  // Nothing named, nothing listed — and the page says why.
  await expect(page.getByText('Search Kingfisher Starter Reference by player')).toBeVisible();

  await page.getByRole('searchbox', { name: 'Search games' }).fill('Carlsen');
  const rows = page.locator('[data-library-row]');
  await expect(rows.first()).toContainText('Carlsen, Magnus', { timeout: 30_000 });
  // The pack lists a player's newest games and counts the rest; it says so.
  await expect(page.locator('[data-reference-coverage]')).toContainText(
    /newest games only: Carlsen, Magnus, 300 of [\d,]+/,
  );

  await page.getByRole('searchbox', { name: 'Search games' }).fill('');
  await page.getByRole('button', { name: /^Filters/ }).click();
  const filters = page.locator('[data-library-filters]');
  await filters.getByLabel('Player', { exact: true }).fill('Magnus Carlsen');
  await filters.getByLabel('Opponent', { exact: true }).fill('Nakamura, Hikaru');
  await expect(rows.first()).toContainText('Nakamura, Hikaru', { timeout: 30_000 });
  const texts = await rows.allInnerTexts();
  expect(texts.length).toBeGreaterThan(0);
  for (const text of texts) {
    expect(text).toContain('Carlsen, Magnus');
    expect(text).toContain('Nakamura, Hikaru');
  }

  // Preview, then open: the moves are the pack's, on the board as source material.
  // Their games' moves are searched too: every one read, from the pack's own movetext.
  await expect(filters.locator('[data-move-search-source]')).toContainText(
    'Kingfisher Starter Reference',
  );
  await filters.getByLabel('Route', { exact: true }).fill('N g1 f3');
  await page.getByRole('button', { name: 'Search the moves' }).click();
  await expect(page.locator('[data-move-search-status]')).toHaveText(
    new RegExp(`^\\d+ of ${texts.length} games read contain it$`),
    { timeout: 60_000 },
  );
  await filters.getByLabel('Route', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Close filters' }).click();
  // The result cell previews (a player's name opens the game outright).
  await rows.first().locator('td').nth(5).click();
  const preview = page.locator('[data-library-preview]');
  await expect(preview).toContainText('1.', { timeout: 30_000 });
  await preview.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page).toHaveURL(/\/analysis/);
  await expect(page.getByText('From Kingfisher Starter Reference').first()).toBeVisible();
});
