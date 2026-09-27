import { expect, test, type Page } from '@playwright/test';

import type { importGames } from '../src/persistence/import-game';
import type { AppRepositories } from '../src/persistence/types';

/**
 * From finding a game to analysing it, without losing the place (Phase 87).
 *
 * The Library's preview lets a player step to the moment they were looking
 * for. Pressing Open then put the board back at move one, so the moment had
 * to be found a second time on the board.
 */

const GAME = `[Event "Continuity Open"]
[White "Continuity, White"]
[Black "Continuity, Black"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 1-0
`;

async function seed(page: Page) {
  await page.goto('/games');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.waitForFunction(() =>
    Boolean((globalThis as { __kingfisher?: unknown }).__kingfisher),
  );
  await page.evaluate(async (pgn) => {
    const app = (
      globalThis as typeof globalThis & {
        __kingfisher: AppRepositories & { importGames: typeof importGames };
      }
    ).__kingfisher;
    await app.importGames(pgn, app.games);
  }, GAME);
  await page.reload();
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

test('Open starts the board at the move the preview was stepped to', async ({ page }) => {
  await seed(page);
  await page.getByRole('row', { name: /Continuity, White/ }).click();
  const preview = page.locator('[data-library-preview]');
  await expect(preview).toBeVisible();
  // Step to 3.Bb5 in the preview's notation.
  await preview.getByRole('button', { name: 'Bb5', exact: true }).click();
  await preview.getByRole('button', { name: 'Open', exact: true }).click();
  await page.waitForURL('**/analysis');
  const frame = page.locator('[data-workspace-frame="analysis"]');
  // The current move in the notation is 3.Bb5.
  await expect(frame.locator('[data-current="true"]')).toHaveCount(1);
  await expect(frame.locator('[data-current="true"]')).toHaveText(/Bb5/);
});

test('Open without stepping still opens at the start, as before', async ({ page }) => {
  await seed(page);
  await page.getByRole('row', { name: /Continuity, White/ }).dblclick();
  await page.waitForURL('**/analysis');
  const frame = page.locator('[data-workspace-frame="analysis"]');
  await expect(frame.getByText('Bb5', { exact: true }).first()).toBeVisible();
  await expect(frame.locator('[data-current="true"]')).toHaveCount(0);
});
