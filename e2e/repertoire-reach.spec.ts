import { expect, test, type Page } from '@playwright/test';

/**
 * Played against you — a repertoire read in the order it is met.
 *
 * A player with a Ruy Lopez file and three games of their own: two as White
 * (one Spanish, one Queen's Gambit), one as Black. The panel counts the
 * White games only, position by position, beside the bundled population's
 * share; the never-reached view finds the deep line none of the games got
 * to; and the repertoire review says it is ordered by those games.
 */

const READY = 'html[data-kingfisher-ready="true"]';

async function ready(page: Page) {
  await page.locator(READY).waitFor();
  await page.waitForFunction(
    () => Boolean((globalThis as { __kingfisher?: unknown }).__kingfisher),
    undefined,
    { timeout: 30_000 },
  );
}

async function importPgn(page: Page, pgn: string) {
  await page
    .getByRole('button', { name: /^Import( PGN or FEN)?$/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  await dialog.getByRole('textbox').fill(pgn);
  await dialog.getByRole('button', { name: 'Import games' }).click();
  await expect(dialog).toBeHidden();
}

const LINE = `[Event "Repertoire line"]
[White "Line"]
[Black "Line"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Na5 10. Bc2 c5 11. d4 Qc7 *
`;

const GAMES = `[Event "Club Open"]
[White "Kurt, Metin"]
[Black "A"]
[Result "1/2-1/2"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Bb7 1/2-1/2

[Event "Club Open"]
[White "Kurt, Metin"]
[Black "B"]
[Result "1-0"]

1. d4 d5 2. c4 e6 1-0

[Event "Club Open"]
[White "C"]
[Black "Kurt, Metin"]
[Result "0-1"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 0-1
`;

test('the repertoire is read in the order your games reach it', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/analysis');
  await ready(page);
  await page.evaluate(async () => {
    const app = (
      globalThis as typeof globalThis & {
        __kingfisher: { profile: { setAliases(aliases: string[]): Promise<unknown> } };
      }
    ).__kingfisher;
    await app.profile.setAliases(['Kurt, Metin']);
  });

  // The repertoire: the whole line, filed from the board.
  await importPgn(page, LINE);
  await page.getByRole('button', { name: 'End of line (End)' }).click();
  await page.getByRole('button', { name: 'Document actions' }).click();
  await page.getByRole('menuitem', { name: 'Add to repertoire…' }).click();
  await page.getByLabel('Title').fill('Spanish');
  await expect(page.getByRole('button', { name: 'Whole line (22)' })).toBeVisible();
  await page.getByRole('button', { name: /Save \d+ position/ }).click();
  await expect(page.getByRole('dialog', { name: 'Add to repertoire' })).toBeHidden();

  // The games.
  await page.goto('/games');
  await ready(page);
  await importPgn(page, GAMES);

  await page.goto('/repertoire');
  await ready(page);
  const panel = page.locator('[data-played-against-you]');
  await expect(panel).toBeVisible();
  // Only the games the person played as White count — two, not three, not four.
  await expect(panel.locator('[data-played-against-you-status]')).toHaveText('2 of your games', {
    timeout: 60_000,
  });

  const own = (row: ReturnType<typeof panel.locator>) => row.locator('[data-reach-own]');
  const rows = panel.locator('[data-reach-row]');
  // Most met first: the start position (both White games), then the Spanish positions (one).
  await expect(rows.first()).toContainText('d0');
  await expect(own(rows.first())).toHaveText('2');
  await expect(own(rows.nth(1))).toHaveText('1');
  // The population column is a share of the bundled pack, never merged with yours.
  await expect(rows.first().locator('[data-reach-reference]')).toHaveText(/100\.0%/);
  await expect(panel).toContainText('Starter');

  // The other end: the deep Chigorin positions none of the games reached.
  await panel.getByRole('button', { name: 'Never reached' }).click();
  const never = panel.locator('[data-reach-row]');
  await expect(never.first()).toBeVisible();
  await expect(own(never.first())).toHaveText('0');
  await expect(never.first()).toContainText('d21');
  const share = await never.first().locator('[data-reach-reference]').textContent();
  expect(Number.parseFloat(share ?? '1')).toBeLessThan(0.5);
  // A never-reached row still opens on the board.
  await never.first().click();
  await expect(never.first()).toHaveClass(/text-primary/);

  // The review is ordered by the same counts and says so.
  await page.getByRole('button', { name: 'Review repertoire' }).click();
  const review = page.getByRole('dialog', { name: 'Review repertoire' });
  await expect(review.getByRole('status')).toContainText('ordered by your 2 games and', {
    timeout: 60_000,
  });
  await expect(review.getByRole('status')).toContainText('Starter');
  await expect(review.getByText(/reached in 2 of your 2 games/).first()).toBeVisible();
});
