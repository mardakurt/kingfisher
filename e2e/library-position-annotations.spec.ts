import { expect, test } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

/**
 * ChessBase's Library filters "Position" and "Annotations", in Kingfisher's
 * search mask.
 *
 * Three games: a Queen's Gambit Declined by the usual order, the same
 * position reached by 1.c4 e6 2.d4 d5, and a Slav that never reaches it. Only
 * the second carries a text comment; the first carries a move symbol, which
 * makes it annotated without being commented.
 */
const PGN = `[Event "Order A"]
[White "Alpha"]
[Black "Beta"]
[Result "1-0"]

1. d4 d5 2. c4 e6 3. Nc3 Nf6 $1 4. Bg5 1-0

[Event "Order B"]
[White "Gamma"]
[Black "Delta"]
[Result "0-1"]

1. c4 e6 2. d4 d5 {The Queen's Gambit Declined, by transposition.} 3. Nf3 0-1

[Event "Slav"]
[White "Epsilon"]
[Black "Zeta"]
[Result "1/2-1/2"]

1. d4 d5 2. c4 c6 3. Nf3 Nf6 1/2-1/2
`;

const QGD = 'rnbqkbnr/ppp2ppp/4p3/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3';

test('the Library finds games by a position, any move order, and by annotations', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/games');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  await dialog.getByRole('textbox').fill(PGN);
  await dialog.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByText('3 games added to your database.')).toBeVisible();

  await page.getByRole('button', { name: 'Filters' }).click();
  const mask = page.locator('[data-search-moves]');
  const events = () =>
    page
      .locator('main table tbody tr')
      .evaluateAll((rows) =>
        rows
          .map((row) => row.textContent ?? '')
          .map((text) => /Order A|Order B|Slav/.exec(text)?.[0]),
      );

  await mask.locator('#search-mask-position').fill(QGD);
  await mask.getByRole('button', { name: 'Search the moves' }).click();
  await expect(page.getByText(/2 of 3 games read contain it/)).toBeVisible();
  expect((await events()).sort()).toEqual(['Order A', 'Order B']);
  await expect(page.locator('main table tbody').getByText('after Black’s move 2')).toHaveCount(2);

  await mask.locator('#search-mask-position').fill('not a position');
  await expect(mask.getByRole('alert')).toContainText('Position:');
  await expect(mask.getByRole('button', { name: 'Search the moves' })).toBeDisabled();
  await mask.locator('#search-mask-position').fill('');

  const annotations = mask
    .locator('label')
    .filter({ hasText: /^Annotations/ })
    .locator('select');
  await annotations.selectOption('commented');
  await mask.getByRole('button', { name: 'Search the moves' }).click();
  await expect(page.getByText(/1 of 3 games read contain it/)).toBeVisible();
  expect(await events()).toEqual(['Order B']);

  await annotations.selectOption('annotated');
  await mask.getByRole('button', { name: 'Search the moves' }).click();
  await expect(page.getByText(/2 of 3 games read contain it/)).toBeVisible();
  expect((await events()).sort()).toEqual(['Order A', 'Order B']);
});
