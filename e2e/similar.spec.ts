import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

/**
 * "Games like this one" over every source the player has — and, where a
 * source was never asked to index what is being asked for, that said plainly
 * rather than answered with an empty list.
 */
test('similar games answers per source, and a pack says what it cannot be asked', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  // A position that the bundled pack certainly holds: the Sicilian after 2.Nf3.
  await page.goto('/analysis');
  await ready(page);
  const board = page.getByRole('grid', { name: 'Chessboard' }).first();
  const play = async (from: string, to: string) => {
    await board.getByRole('gridcell', { name: new RegExp(`^${from},`) }).click();
    await board.getByRole('gridcell', { name: new RegExp(`^${to},`) }).click();
  };
  await play('e2', 'e4');
  await play('c7', 'c5');
  await play('g1', 'f3');

  await page.goto('/similar');
  await ready(page);
  const results = page.getByTestId('similar-results');
  await expect(results).toContainText('Nothing searched yet.');

  // Same position: the pack can answer, and names the games it holds.
  await page.getByRole('button', { name: 'Same position', exact: true }).click();
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const pack = page.getByTestId('similar-pack-kingfisher-starter');
  await expect(pack).toBeVisible({ timeout: 30_000 });
  await expect(pack).not.toContainText('cannot answer this');
  await expect(pack.getByRole('button').first()).toBeVisible({ timeout: 30_000 });
  // My games: answered for itself, with its own count.
  await expect(page.getByTestId('similar-mine')).toContainText('My games · 0');

  // Same pawns: the pack was never asked to index structures, and says so.
  await page.getByRole('button', { name: 'Same pawns', exact: true }).click();
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(pack).toContainText('cannot answer this');
  await expect(pack).toContainText('stores positions and their counts, not structures');
  await expect(pack).toContainText('It can answer “the same position”');

  // A pack game opens on the board, with its source named.
  await page.getByRole('button', { name: 'Same position', exact: true }).click();
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await pack.getByRole('button').first().click();
  await expect(page).toHaveURL(/\/analysis/, { timeout: 30_000 });
});
