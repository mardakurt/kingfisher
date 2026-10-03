import { expect, test } from '@playwright/test';

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
