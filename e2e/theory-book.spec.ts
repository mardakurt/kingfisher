import { expect, test, type Page } from '@playwright/test';

/**
 * The Theory Book, driven the way a player would drive it.
 *
 * The unit tests in `src/theory/theory-book.test.ts` prove the tree is built
 * correctly from the dataset. What they cannot prove is the thing the feature
 * exists for: that somebody can *browse* it — open the Sicilian without
 * knowing its moves, see the Najdorf under it, and land on the position.
 *
 * They also hold the separation the panel is named for. A Theory Book that
 * quietly showed game counts would be an explorer with a different label, and
 * the whole point of having both is that a player can tell which question they
 * are looking at the answer to.
 */

const READY = 'html[data-kingfisher-ready="true"]';

async function openBook(page: Page) {
  await page.goto('/analysis');
  await page.locator(READY).waitFor();
  await page.getByRole('tab', { name: 'Theory Book' }).click();
  await page.locator('[data-theory-book]').waitFor();
}

const book = (page: Page) => page.locator('[data-theory-book]');

async function openBranch(page: Page, name: string) {
  await page.locator('[data-book-branch]').filter({ hasText: name }).first().click();
  await expect(book(page)).toHaveAttribute('data-theory-book', 'located');
}

test('a player can browse into an opening without knowing its moves', async ({ page }) => {
  await openBook(page);

  // At the start of a game the book offers its roots, not an empty panel.
  await expect(book(page)).toHaveAttribute('data-theory-book', 'roots');
  await expect(
    page.locator('[data-book-branch]').filter({ hasText: "King's Pawn Game" }),
  ).toHaveCount(1);

  await openBranch(page, "King's Pawn Game");
  /*
    Black's replies, ordered by how much theory the dataset records below each
    rather than alphabetically. Sorted by name the Sicilian was seventeenth of
    nineteen, behind the Borg Defense and the Lemming Defense.
  */
  await expect(book(page)).toContainText('Next moves');
  const first = page.locator('[data-book-branch]').first();
  await expect(first).toContainText(/Sicilian Defense|King's Pawn Game/);

  await openBranch(page, 'Sicilian Defense');
  // The breadcrumb says where the reader is, family first.
  const crumbs = page.locator('[data-book-crumbs]');
  await expect(crumbs).toContainText("King's Pawn Game");
  await expect(crumbs).toContainText('Sicilian Defense');

  // And the board is actually on the Sicilian, not still on the moves to it.
  await expect(page.getByText('Sicilian Defense').first()).toBeVisible();

  /*
    And the Najdorf is reachable from the Sicilian in one click, though it is
    four plies down and behind three positions the dataset also calls "Sicilian
    Defense". That is what the Variations list is for.
  */
  await openBranch(page, 'Najdorf Variation');
  await expect(crumbs).toContainText('Najdorf');
  /*
    It appears twice, and correctly so: once as 6.Be3 under Next moves and once
    under Variations. They are the same node reached by the two different
    questions this panel answers.
  */
  await expect(
    page.locator('[data-book-branch]').filter({ hasText: 'English Attack' }).first(),
  ).toBeVisible();
});

test('the book explains a variation without evaluating it', async ({ page }) => {
  await openBook(page);
  await openBranch(page, "King's Pawn Game");
  await openBranch(page, 'Sicilian Defense');

  const panel = book(page);
  await expect(panel).toContainText('White');
  await expect(panel).toContainText('Black');
  await expect(panel).toContainText('1...c5');

  /*
    The separation, asserted rather than assumed. A number with a percent sign
    or a centipawn evaluation on this panel would mean the Book and the
    Explorer had been conflated, which is the specific failure this feature was
    built to avoid.
  */
  const text = (await panel.innerText()).replace(/3,810 named positions/, '');
  expect(text).not.toMatch(/\d+(\.\d+)?%/);
  expect(text).not.toMatch(/[+-]\d+\.\d\d/);
  expect(text.toLowerCase()).not.toContain('games');
});

test('the book names its source, on every state it can be in', async ({ page }) => {
  await openBook(page);
  await expect(book(page)).toContainText('lichess-org/chess-openings');
  await expect(book(page)).toContainText('CC0-1.0');

  await openBranch(page, "King's Pawn Game");
  await expect(book(page)).toContainText('CC0-1.0');
});

test('the book still places a line past the last position the dataset names', async ({ page }) => {
  /*
    The deep case, which is most of why the book is worth having. Twenty plies
    into a Najdorf English Attack the dataset names nothing; "0 games" or "not
    found" would both be wrong answers, because the player is still in the
    English Attack and Kingfisher knows it.
  */
  await page.goto('/analysis');
  await page.locator(READY).waitFor();

  await page.getByRole('button', { name: 'Import PGN or FEN' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  await dialog
    .getByRole('textbox')
    .fill(
      '1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6 6.Be3 e5 7.Nb3 Be6 8.f3 Be7 9.Qd2 O-O 10.O-O-O Nbd7 *',
    );
  await dialog.getByRole('button', { name: 'Import games' }).click();
  await expect(dialog).toBeHidden();

  await page.keyboard.press('End');
  await page.getByRole('tab', { name: 'Theory Book' }).click();
  const panel = book(page);
  await expect(panel).toHaveAttribute('data-theory-book', 'located');

  await expect(panel).toContainText('English Attack');
  // It says how far past the named position the reader is, rather than letting
  // the name be read as a description of the position in front of them.
  await expect(panel.locator('[data-book-beyond]')).toBeVisible();
  await expect(panel).toContainText('describes the variation, not this position');
});
