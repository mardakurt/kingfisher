import { expect, test, type Page } from '@playwright/test';

/**
 * Comparing populations without merging them.
 *
 * The unit tests in `src/features/explorer/source-comparison.test.ts` prove the
 * arithmetic. These prove the panel: that two sources really are queried
 * separately, that each column is labelled with the source and game count it
 * came from, and — the invariant the whole feature turns on — that there is no
 * combined figure anywhere on it.
 *
 * Deliberately run against the sources a fresh profile already has, so the
 * gate does not depend on an 82 MB download.
 */

const READY = 'html[data-kingfisher-ready="true"]';

async function openComparison(page: Page) {
  await page.goto('/analysis');
  await page.locator(READY).waitFor();
  await page.getByRole('button', { name: 'Import PGN or FEN' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  await dialog.getByRole('textbox').fill('1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6 *');
  await dialog.getByRole('button', { name: 'Import games' }).click();
  await expect(dialog).toBeHidden();
  await page.keyboard.press('End');
  await page.getByRole('tab', { name: 'Explorer' }).click();
  // Wait for the explorer to have answered once, so the source it is reading
  // is settled before the comparison takes its default from it.
  await page.locator('[data-explorer-move]').first().waitFor();
  await page.getByRole('button', { name: 'Compare sources' }).click();
  const panel = page.locator('[data-source-comparison]');
  await panel.waitFor();
  return panel;
}

test('two sources answer side by side, each labelled with its own games', async ({ page }) => {
  const panel = await openComparison(page);

  const columns = panel.locator('[data-comparison-column]');
  await expect(columns).toHaveCount(2);
  // The bundled reference is one of them, and it says how many games it has.
  await expect(columns.first()).toContainText('games');

  const rows = panel.locator('[data-comparison-row]');
  await expect(rows.first()).toBeVisible();
  // Every row has exactly one cell per column and no extra.
  const cells = await rows.first().locator('td').count();
  expect(cells).toBe(3); // move + two sources
});

test('there is no combined column, and the panel says so', async ({ page }) => {
  /*
    The invariant. Averaging elite over-the-board play with 2400+ blitz would
    destroy the disagreement that is the entire reason to look at both.
  */
  const panel = await openComparison(page);
  await expect(panel).toContainText('Populations are never merged');

  const headers = await panel.locator('[data-comparison-column]').allInnerTexts();
  for (const header of headers) {
    expect(header.toLowerCase()).not.toContain('total');
    expect(header.toLowerCase()).not.toContain('combined');
    expect(header.toLowerCase()).not.toContain('overall');
  }
});

test('a source with nothing here says which kind of nothing it has', async ({ page }) => {
  /*
    A fresh profile's "My games" is empty. "This source has no games in this
    position" is a different fact from "this move is not played" and from
    "this source could not answer", and a reader is entitled to tell them
    apart rather than seeing three identical zeroes.
  */
  const panel = await openComparison(page);
  // A fresh profile compares the bundled reference against the user's own
  // games, and the second of those is empty.
  await expect(panel.locator('[data-comparison-column]')).toHaveCount(2);
  await expect(panel).toContainText('no games');

  /*
    And it is a different mark from the one an unreachable source gets. Masters
    needs a token, so it can be asked and cannot answer.
  */
  await panel.locator('[data-comparison-source="lichess-masters"]').click();
  await expect(panel.locator('[data-comparison-column]')).toHaveCount(3);
  await expect(panel.locator('[data-comparison-column]').last()).toContainText('unavailable');
});

test('choosing one source is not a comparison, and the panel asks for another', async ({
  page,
}) => {
  const panel = await openComparison(page);
  const chosen = panel.locator('[aria-pressed="true"]');
  await expect(chosen).toHaveCount(2);
  await chosen.first().click();
  await expect(panel).toContainText('Choose two or more sources');
  await expect(panel.locator('[data-comparison-table]')).toHaveCount(0);
});

test('a move in the comparison can be played onto the board', async ({ page }) => {
  const panel = await openComparison(page);
  const first = panel.locator('[data-comparison-row]').first();
  const san = (await first.locator('td').first().innerText()).trim();
  await first.getByRole('button', { name: san }).click();
  // The board advanced: the move is now in the game.
  await expect(page.getByRole('button', { name: san }).first()).toBeVisible();
});

/**
 * The actions act on the position, not on the evidence.
 *
 * "To repertoire" and "To training" used to live inside the branch that
 * renders the move table, so they disappeared at exactly the positions a
 * player most wants them: eighteen moves into a Najdorf, or in a line rare
 * enough that the reference has never seen it. Preparing an unusual line is
 * the case for adding it to a repertoire, not the case against.
 */
test('a position can be added to a repertoire even where no source has games', async ({ page }) => {
  await page.goto('/analysis');
  await page.locator(READY).waitFor();
  await page.getByRole('button', { name: 'Import PGN or FEN' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  await dialog
    .getByRole('textbox')
    .fill(
      '1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6 6.Be3 e5 7.Nb3 Be6 8.f3 Be7 9.Qd2 O-O 10.O-O-O Nbd7 11.g4 b5 12.g5 b4 13.Ne2 Ne8 14.f4 a5 15.f5 a4 16.Nbd4 exd4 17.Nxd4 b3 18.Kb1 *',
    );
  await dialog.getByRole('button', { name: 'Import games' }).click();
  await expect(dialog).toBeHidden();
  await page.keyboard.press('End');

  await page.getByRole('tab', { name: 'Explorer' }).click();
  // The bundled reference has nothing this deep — that is the point of the test.
  await expect(page.locator('[data-explorer-move]')).toHaveCount(0);

  await expect(page.getByRole('button', { name: 'To repertoire' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'To training' })).toBeVisible();

  await page.getByRole('button', { name: 'To repertoire' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});
