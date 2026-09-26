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
  // At the searched position, not at the start (Phase 86: it opened at move 0):
  // after 1.e4 c5 2.Nf3 a knight stands on f3 and c5 holds Black's pawn.
  const analysis = page.getByRole('grid', { name: 'Chessboard' }).first();
  await expect(analysis.getByRole('gridcell', { name: /^f3, .*knight/i })).toBeVisible();
  await expect(analysis.getByRole('gridcell', { name: /^c5, .*pawn/i })).toBeVisible();
});

test('similar games shows the board, lets facts be chosen, and says when results are stale', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/analysis');
  await ready(page);
  const board = page.getByRole('grid', { name: 'Chessboard' }).first();
  const play = async (from: string, to: string) => {
    await board.getByRole('gridcell', { name: new RegExp(`^${from},`) }).click();
    await board.getByRole('gridcell', { name: new RegExp(`^${to},`) }).click();
  };
  // 1.e4 d5 2.exd5: pawns have come off, so there are structural facts to choose.
  await play('e2', 'e4');
  await play('d7', 'd5');
  await play('e4', 'd5');

  await page.goto('/similar');
  await ready(page);
  const frame = page.locator('[data-workspace-frame="similar"]');
  // The searched position is on a board, and described in words, not a code.
  await expect(frame.getByRole('grid', { name: 'Chessboard' })).toBeVisible();
  await expect(frame.getByText(/^On the board: /)).toBeVisible();

  // Chosen facts: every fact of the position is listed and ticked; with none
  // ticked there is nothing to search.
  await frame.getByRole('button', { name: 'Chosen facts', exact: true }).click();
  const facts = frame.locator('[data-similar-claims] input[type="checkbox"]');
  expect(await facts.count()).toBeGreaterThan(0);
  for (const box of await facts.all()) await expect(box).toBeChecked();
  for (const box of await facts.all()) await box.uncheck();
  await expect(frame.locator('[data-similar-search]')).toBeDisabled();
  await facts.first().check();
  await frame.locator('[data-similar-search]').click();
  await expect(frame.getByTestId('similar-mine')).toBeVisible();

  // Move the board: the results are for the earlier position, and it says so.
  await play('d8', 'd5');
  await expect(frame.getByText('The board has moved since this search.')).toBeVisible();
  await expect(frame.locator('[data-similar-search]')).toHaveText('Search this position');
});
