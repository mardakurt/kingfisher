import { expect, test, type Page } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

/**
 * ChessBase's Blunder report, as Kingfisher's Costly moves: the engine reads
 * an opponent's own moves and lists those that gave the game away. The one
 * game here is a Scholar's mate, so the answer does not depend on how deep a
 * browser engine gets in 0.15 s: 3…Nf6 allows mate in one.
 */
const PGN = `[Event "Club"]
[Date "2026.09.01"]
[White "Hunter, Alice"]
[Black "Prey, Bob"]
[Result "1-0"]

1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0
`;

async function runCostlyMoves(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/games');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  await dialog.getByRole('textbox').fill(PGN);
  await dialog.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByText('1 game added to your database.')).toBeVisible();

  await page.goto('/preparation');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByLabel('Player name').fill('Prey, Bob');
  await page.getByRole('button', { name: 'Prepare', exact: true }).click();
  await page.locator('[data-preparation-report]').waitFor({ timeout: 60_000 });
  await page.getByRole('tab', { name: 'Costly moves' }).click();

  const section = page.locator('[data-costly-moves]');
  await section.locator('[data-costly-run]').click();
  await expect(section.locator('[data-costly-progress]')).toContainText('1 game read', {
    timeout: 120_000,
  });
  return section;
}

test('costly moves finds the move that allowed mate, and opens the game there', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/games');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  await dialog.getByRole('textbox').fill(PGN);
  await dialog.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByText('1 game added to your database.')).toBeVisible();

  await page.goto('/preparation');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByLabel('Player name').fill('Prey, Bob');
  await page.getByRole('button', { name: 'Prepare', exact: true }).click();
  await page.locator('[data-preparation-report]').waitFor({ timeout: 60_000 });
  await page.getByRole('tab', { name: 'Costly moves' }).click();

  const section = page.locator('[data-costly-moves]');
  await section.locator('[data-costly-run]').click();
  await expect(section.locator('[data-costly-progress]')).toContainText('1 game read', {
    timeout: 120_000,
  });
  await expect(section.locator('[data-costly-summary]')).toContainText('Their moves read3');
  const rows = section.locator('[data-costly-row]');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('3…Nf6');
  await expect(section.locator('[data-costly-phase="opening"]')).toContainText('3');

  await rows.first().getByRole('button').click();
  await page.waitForURL(/\/analysis/);
  await expect(page.getByText('Black to move, move 3.')).toBeVisible();
});

test('a costly move becomes a drill answered with the engine’s move', async ({ page }) => {
  test.setTimeout(180_000);
  const section = await runCostlyMoves(page);
  await expect(section.locator('[data-costly-row]')).toHaveCount(1);

  await section.locator('[data-costly-train]').getByRole('button').click();
  await page.waitForURL(/\/training\?set=/);

  const items = await page.evaluate(async () => {
    const handle = (
      globalThis as unknown as {
        __kingfisher: { training: { list(): Promise<Record<string, unknown>[]> } };
      }
    ).__kingfisher;
    return (await handle.training.list()).map((item) => ({
      mode: item.mode,
      solutionSan: item.solutionSan,
      answerSource: item.answerSource,
      tags: item.tags,
      fen: item.fen,
    }));
  });
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({
    mode: 'best-move',
    answerSource: 'engine',
    tags: ['costly-move', 'opening'],
    fen: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3',
  });
  // Whatever the browser engine preferred, it is not the move that lost.
  expect(items[0]!.solutionSan).not.toContain('Nf6');

  const sets = await page.evaluate(async () => {
    const handle = (
      globalThis as unknown as {
        __kingfisher: { trainingSets: { list(): Promise<{ name: string; itemIds: string[] }[]> } };
      }
    ).__kingfisher;
    return (await handle.trainingSets.list()).map((set) => [set.name, set.itemIds.length]);
  });
  expect(sets).toContainEqual(['Prey, Bob — costly moves', 1]);
});
