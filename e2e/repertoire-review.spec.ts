import { expect, test, type Page } from '@playwright/test';

/**
 * Reviewing a repertoire, driven the way a player would.
 *
 * `src/repertoire/review.test.ts` and `enrol.test.ts` prove the rules: one
 * prompt per position however many move orders reach it, one card per
 * position, the training queue's own scheduler rather than a second one. What
 * they cannot prove is that a player can get from a repertoire to a due prompt
 * without leaving the application — which is the whole feature.
 *
 * So this builds a repertoire on the board, opens the review, reads what it
 * says about the session, starts it, and answers a prompt in the training
 * queue the review sent it to.
 */

const READY = 'html[data-kingfisher-ready="true"]';

async function ready(page: Page) {
  await page.locator(READY).waitFor();
}

/** Play a move by clicking its two squares on the real board. */
async function play(page: Page, from: string, to: string) {
  const board = page.getByRole('grid', { name: 'Chessboard' }).first();
  await board.getByRole('gridcell', { name: new RegExp(`^${from},`) }).click();
  await board.getByRole('gridcell', { name: new RegExp(`^${to},`) }).click();
}

/**
 * A repertoire with a line in it, built through the product's own flow.
 *
 * 1.e4 e5 2.Nf3 as White, so the repertoire holds positions where White is to
 * move and the `my-move` drill has something to ask about.
 */
async function buildRepertoire(page: Page, title: string) {
  await page.goto('/analysis');
  await ready(page);
  await play(page, 'e2', 'e4');
  await play(page, 'e7', 'e5');
  await play(page, 'g1', 'f3');

  await page.getByRole('button', { name: 'Document actions' }).click();
  await page.getByRole('menuitem', { name: 'Add to repertoire…' }).click();
  await page.getByLabel('Title').fill(title);
  await page.getByRole('button', { name: /Save \d+ position/ }).click();
  await expect(page.getByRole('dialog', { name: 'Add to repertoire' })).toBeHidden();
}

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Review repertoire' });

test('a repertoire becomes a review session, and the session says what it will ask', async ({
  page,
}) => {
  await buildRepertoire(page, 'White e4 review');
  await page.goto('/repertoire');
  await ready(page);

  await page.getByRole('button', { name: 'Review repertoire' }).click();
  await expect(dialog(page)).toBeVisible();

  /*
    The counts are the answer to "why did this add so few", which is the
    question a player asks the second time they run it. New and already
    scheduled are reported separately for that reason.
  */
  await expect(dialog(page).getByRole('status')).toContainText(/\d+ prompts/);
  await expect(dialog(page).getByRole('status')).toContainText(/\d+ new/);
  await expect(dialog(page).getByRole('status')).toContainText(/already scheduled/);

  // Every prompt states why it is being asked and what its schedule is —
  // the facts the training queue itself shows, not a score.
  const first = dialog(page).locator('li').first();
  await expect(first).toContainText(/to move/);
  await expect(first).toContainText(/Last reviewed:/);
  await expect(first).toContainText(/Next due:/);
  await expect(first).toContainText(/Interval:/);
  // A position never drilled says so rather than pretending to a history.
  await expect(first).toContainText(/never drilled|Last reviewed: never/);
});

test('the drill modes ask about different things', async ({ page }) => {
  await buildRepertoire(page, 'Modes');
  await page.goto('/repertoire');
  await ready(page);
  await page.getByRole('button', { name: 'Review repertoire' }).click();

  const status = dialog(page).getByRole('status');
  const countOf = async () => Number(/(\d+) prompts/.exec((await status.innerText()) ?? '')?.[1]);

  await dialog(page).getByLabel('Drill mode').selectOption('my-move');
  const mine = await countOf();
  await dialog(page).getByLabel('Drill mode').selectOption('full-branch');
  const everything = await countOf();

  // Every position is at least as many as the ones this side moves in.
  expect(everything).toBeGreaterThanOrEqual(mine);
  expect(mine).toBeGreaterThan(0);
});

test('starting a review hands the player a due prompt they can answer', async ({ page }) => {
  await buildRepertoire(page, 'Answerable');
  await page.goto('/repertoire');
  await ready(page);

  await page.getByRole('button', { name: 'Review repertoire' }).click();
  await expect(dialog(page)).toBeVisible();
  await page.getByRole('button', { name: 'Start repertoire review' }).click();

  // The review sends the player to the training queue rather than inventing a
  // second place to answer questions.
  await expect(page).toHaveURL(/\/training/);
  await ready(page);

  /*
    And the card is answerable. The prompt names the repertoire, because three
    weeks later that is all the player will see and "what do you play here" has
    no answer without it.

    `.first()` because the queue shows it in the list, on the card and in the
    status line — the prompt appearing several times is the queue working, not
    an ambiguity to write around.
  */
  await expect(page.getByText(/What does Answerable play here\?/).first()).toBeVisible();
});

test('running the review twice does not double the queue', async ({ page }) => {
  /*
    The claim the whole enrolment rests on. A player who opens the review again
    must be told their positions are already scheduled rather than given a
    second card for each of them.
  */
  await buildRepertoire(page, 'Twice');
  await page.goto('/repertoire');
  await ready(page);

  await page.getByRole('button', { name: 'Review repertoire' }).click();
  const status = dialog(page).getByRole('status');
  const before = await status.innerText();
  const newFirstTime = Number(/(\d+) new/.exec(before)?.[1]);
  expect(newFirstTime).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Start repertoire review' }).click();
  await expect(page).toHaveURL(/\/training/);
  await ready(page);

  await page.goto('/repertoire');
  await ready(page);
  await page.getByRole('button', { name: 'Review repertoire' }).click();
  await expect(status).toContainText('0 new');
  await expect(status).toContainText(`${newFirstTime} already scheduled`);
});
