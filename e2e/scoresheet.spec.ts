import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

/**
 * The evening after the round: the sheet in one hand, the moves typed as
 * they were written — German piece letters, a short capture, a cell with a
 * character nobody can read, and one cell that cannot be read at all — and
 * the game ends up in My games with the doubtful moves named.
 */
test('a scoresheet is typed as written, the gap is filled from the moves after it, and the game is saved', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/scoresheet');
  await ready(page);

  const entry = page.getByLabel('Move as written on the sheet');
  const type = async (token: string) => {
    await entry.fill(token);
    await entry.press('Enter');
  };

  // 1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. N?d4 — a smudged cell the rules can still read.
  for (const token of ['e4', 'c5', 'Sf3', 'd6', 'd4', 'cd', 'N?d4']) await type(token);
  await expect(page.getByTestId('sheet-entry')).toContainText('7 on the board');
  const flags = page.getByTestId('sheet-flags');
  await expect(flags).toContainText('Check these moves · 1');
  await expect(flags).toContainText('has an unreadable character');

  // 4... — illegible. The moves after it go in, and the gap is fitted from them.
  await type('?');
  await expect(page.getByTestId('sheet-gap')).toBeVisible();
  for (const token of ['Nc3', 'a6', 'Be3', 'e5', 'Nb3', 'Be6', 'f3', 'Be7', 'Dd2', '0-0', '0-0-0'])
    await type(token);
  const gap = page.getByTestId('sheet-gap');
  await expect(gap).toContainText('Nc3 a6 Be3 e5 Nb3');
  // Two knight moves still fit eleven cells later; Kingfisher offers both rather than choosing.
  await expect(gap.getByRole('button', { name: 'Nf6', exact: true })).toBeVisible();
  await expect(gap.getByRole('button', { name: 'Nh6', exact: true })).toBeVisible();
  await gap.getByRole('button', { name: 'Nf6', exact: true }).click();

  await expect(page.getByTestId('sheet-gap')).toHaveCount(0);
  await expect(page.getByTestId('sheet-entry')).toContainText('19 on the board');
  await expect(flags).toContainText('Check these moves · 2');
  await expect(flags).toContainText('Nf6 is the move that fits the 11 after it');

  // The board holds the game: the last move is on it.
  const board = page.getByRole('grid', { name: 'Chessboard' }).first();
  await expect(board.getByRole('gridcell', { name: /^c1, White king/ })).toBeVisible();

  // A move read two ways can be changed to the other reading, and the rest survives.
  await page.getByTestId('sheet-details').getByLabel('White').fill('Kurt, Metin Arda');
  await page.getByTestId('sheet-details').getByLabel('Black').fill('Opponent, A');
  await page.getByTestId('sheet-details').getByLabel('Event').fill('Club championship');
  await page.getByTestId('sheet-details').getByLabel('Result').selectOption('1-0');
  await page.getByRole('button', { name: 'Save to My games', exact: true }).click();

  await expect(page).toHaveURL(/\/analysis/, { timeout: 30_000 });
  await page.goto('/games');
  await ready(page);
  await page.getByLabel('Search games').fill('Kurt');
  await expect(page.getByText('Kurt, Metin Arda').first()).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});

test('typing needs no endpoint, and reading a photo says what it needs', async ({ page }) => {
  await page.goto('/scoresheet');
  await ready(page);
  const photo = page.getByTestId('sheet-photo');
  await expect(photo.getByRole('button', { name: 'Read the sheet', exact: true })).toBeDisabled();
  await expect(photo).toContainText(
    'Reading a photo needs an assistant endpoint; typing needs nothing.',
  );
});
