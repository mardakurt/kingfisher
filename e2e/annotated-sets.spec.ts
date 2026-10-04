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
  await expect(
    page
      .getByRole('region', { name: 'Notation' })
      .getByRole('button', { name: /The object of this move is to bring/ }),
  ).toBeVisible({ timeout: 15_000 });
});

test('100 credited classics import once and named games open from Library search', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/databases');
  await ready(page);
  const set = page.locator('[data-annotated-set="famous-games-and-championship-classics"]');
  await expect(set).toContainText('100 games');
  await expect(set).toContainText('CC BY-SA 4.0');
  await expect(set).not.toContainText('public domain');
  await set.getByRole('button', { name: 'Add to my games' }).click();
  await expect(
    page.getByText('100 games from Famous games and championship classics added to your games.'),
  ).toBeVisible({ timeout: 45_000 });
  await set.getByRole('button', { name: 'Add to my games' }).click();
  await expect(
    page.getByText(
      'Every game of Famous games and championship classics is already in your games.',
    ),
  ).toBeVisible({ timeout: 45_000 });
  for (const [name, players, finish] of [
    ['Immortal Game, 1851', /Adolf Anderssen.*Kieseritzky/, 'Be7#'],
    ['Evergreen Game, 1852', /Adolf Anderssen.*Dufresne/, 'Bxe7#'],
    ['Opera Game, 1858', /Paul Morphy.*Duke Karl/, 'Rd8#'],
    ["Kasparov's Immortal", /Garry Kasparov.*Veselin Topalov/, 'Qa7'],
  ] as const) {
    await page.goto('/games');
    await ready(page);
    await page.getByRole('searchbox', { name: 'Search games' }).fill(name);
    const row = page.getByRole('row', { name: players });
    await expect(row).toBeVisible();
    await row.dblclick();
    await expect(page.getByRole('region', { name: 'Notation' })).toContainText(finish);
  }
  await page.reload();
  await ready(page);
  await expect(page.getByRole('region', { name: 'Notation' })).toContainText('e4');
});
