/**
 * Deep analysis (ChessBase's Deep Analysis, as evidence): a tree grown by the
 * browser Stockfish on its own session, reported, and written into the game
 * as one undo step. Runs a real engine, small: two moves a position, four
 * plies, a second each — fifteen positions at most.
 */

import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

// After 1.e4 e5 2.Nf3 Nc6 3.Bb5: an opening position with several good replies.
const SPANISH = 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3';

test('the engine deepens a position into a tree and writes it into the game on request', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto(`/analysis?fen=${encodeURIComponent(SPANISH)}`);
  await ready(page);
  await page.getByRole('tab', { name: 'Engine', exact: true }).click();

  const section = page.getByRole('region', { name: 'Deep analysis' });
  await section.getByRole('button', { name: 'Deepen from here…' }).click();
  const form = section.locator('[data-deepen-form]');
  await form.getByLabel('Moves per position').selectOption('2');
  await form.getByLabel('Plies').selectOption('4');
  await form.getByLabel('Seconds each').selectOption('1');
  await expect(section.locator('[data-deepen-estimate]')).toContainText(
    'Up to 15 positions, about 1 minute.',
  );
  await form.getByRole('button', { name: 'Start' }).click();

  await expect(section).toHaveAttribute('data-deepen', 'running');
  await expect(section.locator('[data-deepen-progress]')).toContainText(/of up to 15 positions/);
  await expect(section).toHaveAttribute('data-deepen', 'done', { timeout: 120_000 });

  const report = section.locator('[data-deepen-report]');
  await expect(report).toContainText(/Finished: \d+ positions? searched by Stockfish/);
  await expect(report.locator('[data-deepen-own]')).toContainText(
    /The start’s own search: [+-−]?\d+\.\d+ at depth \d+\./,
  );
  await expect(report.locator('[data-deepen-tree]')).toContainText(
    /The tree’s backed-up score: .+, along 3\.\.\./,
  );

  const tree = page.locator('[data-move-tree]').first();
  await expect(tree.getByRole('button')).toHaveCount(0);
  await report.getByRole('button', { name: 'Add to the analysis' }).click();
  await expect(page.getByText(/moves? and their evaluations added\. Undo with ⌘Z\./)).toBeVisible();
  // At least one ply of every kept line, and the game's first move is Black's.
  await expect(tree).toContainText('3…');
  const moves = await tree.getByRole('button').count();
  expect(moves).toBeGreaterThanOrEqual(4);

  await page.keyboard.press('ControlOrMeta+z');
  await expect(tree.getByRole('button')).toHaveCount(0);
});
