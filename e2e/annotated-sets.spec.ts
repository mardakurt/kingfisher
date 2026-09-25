import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

/**
 * The public-domain annotated set, as a player meets it: offered on the
 * Databases page, added to their own games on a click (and not twice), and
 * opened with the author's notes on the moves they were written about.
 */
test('a public-domain annotated book is added to my games with its notes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/databases');
  await ready(page);

  const panel = page.getByRole('region', { name: 'Annotated classics' });
  const set = panel.locator('[data-annotated-set="capablanca-chess-fundamentals-1921"]');
  await expect(set).toContainText('Chess Fundamentals');
  await expect(set).toContainText('14 games');
  await expect(set).toContainText('public domain');

  await set.getByRole('button', { name: 'Add to my games' }).click();
  await expect(page.getByText('14 games from Chess Fundamentals added to your games.')).toBeVisible(
    {
      timeout: 30_000,
    },
  );
  await set.getByRole('button', { name: 'Add to my games' }).click();
  await expect(
    page.getByText('Every game of Chess Fundamentals is already in your games.'),
  ).toBeVisible({
    timeout: 30_000,
  });

  await page.goto('/games');
  await ready(page);
  const row = page.getByRole('row', { name: /Lasker.*Capablanca/ }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.dblclick();
  // The first note of the game, on the move Capablanca wrote it about (4.Bxc6).
  await expect(page.getByText(/The object of this move is to bring/).first()).toBeVisible({
    timeout: 15_000,
  });
});
