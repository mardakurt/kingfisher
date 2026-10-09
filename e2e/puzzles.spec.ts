import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

/**
 * Tactics puzzles from the shipped Lichess set: solve one by playing its
 * moves on the board, fail one with a wrong move, and see the attempts kept
 * across a reload with the solver rating moving the right way each time.
 */

type Row = [string, string, string, number, number, number, number, string, string, string];

/** Puzzles in a band whose solution has `solverMoves` moves by the solver. */
function puzzlesWith(band: string, solverMoves: number): Row[] {
  const rows = JSON.parse(readFileSync(`public/data/puzzles/${band}.json`, 'utf8')) as Row[];
  return rows.filter(
    (row) => row[2].split(' ').length / 2 === solverMoves && !row[7].includes('mateIn1'),
  );
}
const puzzleWith = (band: string, solverMoves: number): Row => {
  const found = puzzlesWith(band, solverMoves)[0];
  if (!found) throw new Error(`no ${solverMoves}-move puzzle in ${band}`);
  return found;
};

async function playMove(page: Page, uci: string) {
  const board = page.locator('[data-puzzle-board]');
  await board.getByRole('gridcell', { name: new RegExp(`^${uci.slice(0, 2)},`) }).click();
  await board.getByRole('gridcell', { name: new RegExp(`^${uci.slice(2, 4)},`) }).click();
  if (uci.length > 4) {
    const piece = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' }[uci[4]!]!;
    await page
      .getByRole('button', { name: new RegExp(piece) })
      .first()
      .click();
  }
}

async function open(page: Page, id: string) {
  await page.goto(`/puzzles?puzzle=${id}`);
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await expect(page.locator(`[data-puzzle-id="${id}"]`)).toBeVisible();
  await expect(page.locator('[data-puzzle-hint]')).toBeVisible();
}

test('a puzzle is solved by playing its moves, the reply comes, and the rating rises', async ({
  page,
}) => {
  const [id, , moves] = puzzleWith('r1200', 2);
  const [, first, , third] = moves.split(' ');
  await open(page, id);
  await expect(page.locator('[data-puzzle-rating]')).toHaveText('1500?');
  await playMove(page, first!);
  await expect(page.locator('[data-puzzle-feedback="correct"]')).toContainText('correct');
  // The reply has to arrive before the second move is legal.
  await expect(async () => {
    await playMove(page, third!);
    await expect(page.locator('[data-puzzle-message="solved"]')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await expect(page.locator('[data-puzzle-message="solved"]')).toContainText('Solved');
  await expect(page.locator('[data-puzzle-record]')).toContainText('1 attempt · 1 solved');
  await expect(page.locator('[data-puzzle-delta]')).toContainText('+');
  const rating = Number(
    await page
      .locator('[data-puzzle-rating]')
      .textContent()
      .then((t) => t!.replace('?', '')),
  );
  expect(rating).toBeGreaterThan(1500);

  // Kept across a reload: the attempt is in IndexedDB, the rating replayed from it.
  await page.reload();
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await expect(page.locator('[data-puzzle-record]')).toContainText('1 attempt · 1 solved');
  await expect(page.locator('[data-puzzle-rating]')).toHaveText(`${rating}?`);
});

test('a wrong move gives feedback without the answer, can be retried, and counts only once', async ({
  page,
}) => {
  const board = page.locator('[data-puzzle-board]');
  // The first two-move puzzle whose solving piece has somewhere else to go.
  let wrong: string | null = null;
  let solutionMoves: string[] = [];
  for (const [id, , moves] of puzzlesWith('r1600', 2).slice(0, 8)) {
    solutionMoves = moves.split(' ').slice(1);
    const solution = solutionMoves[0]!;
    await open(page, id);
    await board.getByRole('gridcell', { name: new RegExp(`^${solution.slice(0, 2)},`) }).click();
    // The solution's own destination is always among them, so wait for it.
    await expect(board.locator('[data-target="true"]').first()).toBeVisible();
    const targets = await board
      .locator('[data-target="true"]')
      .evaluateAll((cells) =>
        cells.map((cell) => (cell.getAttribute('aria-label') ?? '').slice(0, 2)),
      );
    wrong = targets.find((square) => square !== solution.slice(2, 4)) ?? null;
    if (wrong) break;
  }
  expect(wrong, 'one of eight puzzles offers a second destination').not.toBeNull();
  await board.getByRole('gridcell', { name: new RegExp(`^${wrong},`) }).click();
  await expect(page.locator('[data-puzzle-feedback="wrong"]')).toContainText(
    'Incorrect move. Try again',
  );
  await expect(page.locator('[data-puzzle-message]')).not.toContainText('Solution:');
  await expect(page.locator('[data-puzzle-record]')).toContainText('1 attempt · 0 solved');
  await expect(page.locator('[data-puzzle-delta]')).toContainText('-');
  const rating = await page.locator('[data-puzzle-rating]').textContent();
  await expect(page.locator('[data-puzzle-message="solving"]')).toBeVisible();
  await playMove(page, solutionMoves[0]!);
  await expect(page.locator('[data-puzzle-feedback="correct"]')).toContainText('correct');
  await expect(page.locator('[data-puzzle-message="solving"]')).toBeVisible();
  await playMove(page, solutionMoves[2]!);
  await expect(page.locator('[data-puzzle-message="solved"]')).toContainText(
    'completed in practice',
  );
  await expect(page.locator('[data-puzzle-record]')).toContainText('1 attempt · 0 solved');
  await expect(page.locator('[data-puzzle-rating]')).toHaveText(rating!);
  await page.reload();
  await expect(page.locator('[data-puzzle-record]')).toContainText('1 attempt · 0 solved');
});

test('revealing a solution allows another interactive practice attempt without another rating', async ({
  page,
}) => {
  const [id, , moves] = puzzleWith('r1200', 2);
  const [, first, , third] = moves.split(' ');
  await open(page, id);
  await page.locator('[data-puzzle-solution]').click();
  await expect(page.locator('[data-puzzle-message="revealed"]')).toContainText('Solution:');
  await page.locator('[data-puzzle-retry]').click();
  await playMove(page, first!);
  await expect(page.locator('[data-puzzle-message="solving"]')).toBeVisible();
  await playMove(page, third!);
  await expect(page.locator('[data-puzzle-message="solved"]')).toContainText(
    'completed in practice',
  );
  await expect(page.locator('[data-puzzle-record]')).toContainText('1 attempt · 0 solved');
});

test('a mistake after the reply preserves earlier progress and allows another try', async ({
  page,
}) => {
  // Published puzzle 7TBMH: ...b4 Qf4+ Kg8 Qxc7. Qh6 is legal but misses the fork.
  await open(page, '7TBMH');
  await playMove(page, 'c1f4');
  await expect(page.locator('[data-puzzle-message="solving"]')).toBeVisible();
  await playMove(page, 'f4h6');
  await expect(page.locator('[data-puzzle-feedback="wrong"]')).toContainText('Incorrect move');
  await expect(page.locator('[data-puzzle-message="solving"]')).toBeVisible();
  await expect(page.getByRole('gridcell', { name: 'f4, White queen', exact: true })).toBeVisible();
  await playMove(page, 'f4c7');
  await expect(page.locator('[data-puzzle-message="solved"]')).toContainText(
    'completed in practice',
  );
  await expect(page.locator('[data-puzzle-record]')).toContainText('1 attempt · 0 solved');
});

test('a hint leaves the puzzle playable while keeping the rated attempt unsolved', async ({
  page,
}) => {
  await open(page, '7TBMH');
  await page.locator('[data-puzzle-hint]').click();
  await expect(page.locator('[data-puzzle-message]')).toContainText('You can still finish it');
  await playMove(page, 'c1f4');
  await expect(page.locator('[data-puzzle-message="solving"]')).toBeVisible();
  await playMove(page, 'f4c7');
  await expect(page.locator('[data-puzzle-message="solved"]')).toContainText(
    'completed in practice',
  );
  await expect(page.locator('[data-puzzle-record]')).toContainText('1 attempt · 0 solved');
});
