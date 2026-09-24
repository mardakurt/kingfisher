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

/*
  Phase 85: a run survives the page. It is saved after every position, and the
  next page to open picks it up from its checkpoint — here after a reload in
  the middle of the run; the Mac's suspend and restart harnesses do the same
  across a sleep and a quit.
*/
test('a deep analysis interrupted by a reload is picked up where it stopped', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto(`/analysis?fen=${encodeURIComponent(SPANISH)}`);
  await ready(page);
  await page.getByRole('tab', { name: 'Engine', exact: true }).click();

  const section = page.getByRole('region', { name: 'Deep analysis' });
  await section.getByRole('button', { name: 'Deepen from here…' }).click();
  const form = section.locator('[data-deepen-form]');
  await form.getByLabel('Moves per position').selectOption('2');
  await form.getByLabel('Plies').selectOption('4');
  await form.getByLabel('Seconds each').selectOption('1');
  await form.getByRole('button', { name: 'Start' }).click();
  await expect(section.locator('[data-deepen-progress]')).toContainText(/^[3-9]\d* of up to 15/, {
    timeout: 60_000,
  });

  const saved = () =>
    page.evaluate(async () => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('kingfisher');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const rows = await new Promise<{ status: string; searched: number; resumed: number }[]>(
        (resolve) => {
          const query = database
            .transaction('deepAnalysisJobs', 'readonly')
            .objectStore('deepAnalysisJobs')
            .getAll();
          query.onsuccess = () => resolve(query.result as never);
        },
      );
      database.close();
      return rows;
    });
  const before = await saved();
  expect(before).toHaveLength(1);
  expect(before[0]!.status).toBe('running');
  expect(before[0]!.searched).toBeGreaterThanOrEqual(3);

  await page.reload();
  await ready(page);
  await expect(page.getByText('Deep analysis picked up where it stopped.')).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('tab', { name: 'Engine', exact: true }).click();
  const again = page.getByRole('region', { name: 'Deep analysis' });
  await expect(again).toHaveAttribute('data-deepen', /running|done/);
  await expect(again).toHaveAttribute('data-deepen', 'done', { timeout: 120_000 });
  await expect(again.locator('[data-deepen-report]')).toContainText(
    'Picked up again once after the page running it went away.',
  );
  const after = await saved();
  expect(after[0]).toMatchObject({ status: 'done', resumed: 1 });
  // Nothing was searched twice: the resumed run continued the count.
  expect(after[0]!.searched).toBeGreaterThanOrEqual(before[0]!.searched);
  expect(after[0]!.searched).toBeLessThanOrEqual(15);
});
