import { expect, test, type Page } from '@playwright/test';

/**
 * Opening Kingfisher opens a chessboard.
 *
 * The draft — what was on the board — exists so a refresh or a crash does not
 * lose work that was never filed. Restoring it on *every* start went further
 * than that: opening the application on Monday put Sunday's half-played line
 * on the board, and the Mac application, whose every launch is a new window,
 * never once opened on the initial position (Phase 72, reported by the owner
 * for both the web and the Mac build).
 *
 * The rule now (`src/persistence/session-launch.ts`): a *fresh launch* — a new
 * tab, a new window, a relaunch of the Mac application — opens on the initial
 * position and leaves the draft in storage, where Recent offers it as
 * "Continue …". A *reload of a session that has work* brings that work back,
 * which is the crash-safety the draft is for. This spec holds both halves,
 * and the one that must not regress is the second.
 */

const ready = async (page: Page) => {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.waitForTimeout(400);
};

const halfMoves = async (page: Page): Promise<number> => {
  const text = await page.locator('body').innerText();
  return Number.parseInt(/(\d+) half-moves/.exec(text)?.[1] ?? '0', 10);
};

const play = async (page: Page, from: string, to: string) => {
  const board = page.locator('[data-chessboard]').first();
  await board.getByRole('gridcell', { name: new RegExp(`^${from},`) }).click();
  await board.getByRole('gridcell', { name: new RegExp(`^${to},`) }).click();
};

test('a fresh launch opens the initial position; the session that made the work keeps it', async ({
  page,
  context,
}) => {
  await page.goto('/analysis');
  await ready(page);
  await play(page, 'e2', 'e4');
  await play(page, 'e7', 'e5');
  await expect(page.getByText('2 half-moves')).toBeVisible();
  // Autosave is debounced; the draft must be on disk before the next launch.
  await expect(page.getByText(/saved/).first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(2_000);

  // A reload of this session is not a launch: the work comes back.
  await page.reload();
  await ready(page);
  expect(await halfMoves(page)).toBe(2);

  // A new tab is a fresh launch: a chessboard, and the draft still stored.
  const fresh = await context.newPage();
  await fresh.goto('/analysis');
  await ready(fresh);
  await fresh.waitForTimeout(2_000);
  expect(await halfMoves(fresh)).toBe(0);

  // Recent offers it, says whose it is, and puts it back on request.
  await fresh.goto('/recent');
  await ready(fresh);
  const continueButton = fresh.locator('[data-continue]');
  await expect(continueButton).toHaveAttribute('data-continue-held', 'true');
  await continueButton.click();
  await fresh.waitForURL(/\/analysis/);
  await ready(fresh);
  expect(await halfMoves(fresh)).toBe(2);

  // Having continued, this session owns the work: its reload keeps it.
  await fresh.reload();
  await ready(fresh);
  expect(await halfMoves(fresh)).toBe(2);
  await fresh.close();
});

test('a fresh launch that plays its own moves keeps them across a reload', async ({
  page,
  context,
}) => {
  await page.goto('/analysis');
  await ready(page);
  await play(page, 'd2', 'd4');
  await expect(page.getByText('1 half-move')).toBeVisible();
  await page.waitForTimeout(2_500);

  await page.reload();
  await ready(page);
  expect(await halfMoves(page)).toBe(1);

  // And the next launch is still a chessboard.
  const fresh = await context.newPage();
  await fresh.goto('/analysis');
  await ready(fresh);
  await fresh.waitForTimeout(1_500);
  expect(await halfMoves(fresh)).toBe(0);
  await fresh.close();
});
