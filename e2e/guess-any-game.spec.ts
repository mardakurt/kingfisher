import { expect, test } from '@playwright/test';

import type { importGames } from '../src/persistence/import-game';
import type { AppRepositories } from '../src/persistence/types';

/**
 * Replay training on any game: Guess the Move is offered on the Analysis
 * board, not only for model games, and judges a guess against the move that
 * was played.
 */

const PGN = `[Event "Replay"]
[White "Replay, White"]
[Black "Replay, Black"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 1-0
`;

test('Guess the Move runs on a game opened in Analysis', async ({ page }) => {
  await page.goto('/games');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.waitForFunction(() =>
    Boolean((globalThis as { __kingfisher?: unknown }).__kingfisher),
  );
  await page.evaluate(async (text) => {
    const app = (
      globalThis as typeof globalThis & {
        __kingfisher: AppRepositories & { importGames: typeof importGames };
      }
    ).__kingfisher;
    await app.importGames(text, app.games);
  }, PGN);
  await page.reload();
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByRole('row', { name: /Replay, White/ }).dblclick();
  await page.waitForURL('**/analysis');
  await page.getByRole('button', { name: /More/ }).first().click();
  await page.getByRole('menuitem', { name: 'Guess the Move' }).click();
  await expect(page.getByText('What did Replay, White play here?')).toBeVisible();
  await expect(page.getByText(/1 of \d+/)).toBeVisible();
});
