/**
 * A query with "any of" and "not", built in the interface (Phase 86, P0.2):
 * (a B or a C opening) and not a draw, over three games of which one
 * matches. The editor says the query in words as it is built, and the saved
 * query runs through the same executor as every other.
 */

import { expect, test } from '@playwright/test';

import type { importGames } from '../src/persistence/import-game';
import type { AppRepositories } from '../src/persistence/types';

// The moves match the tag: the ECO condition reads Kingfisher's own
// classification of the moves as well as the tag.
const game = (event: string, eco: string, result: string, moves: string) => `[Event "${event}"]
[White "Query, W"]
[Black "Query, B"]
[ECO "${eco}"]
[Result "${result}"]

${moves} ${result}`;

test('a query with any-of and not is built, described, saved and run', async ({ page }) => {
  await page.goto('/games');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.waitForFunction(() =>
    Boolean((globalThis as { __kingfisher?: unknown }).__kingfisher),
  );
  await page.evaluate(
    async (pgns) => {
      const app = (
        globalThis as unknown as {
          __kingfisher: AppRepositories & { importGames: typeof importGames };
        }
      ).__kingfisher;
      await app.games.clear();
      for (const pgn of pgns) await app.importGames(pgn, app.games);
    },
    [
      game('Sicilian won', 'B20', '1-0', '1. e4 c5'),
      game('Italian drawn', 'C50', '1/2-1/2', '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5'),
      game('QGD lost', 'D30', '0-1', '1. d4 d5 2. c4 e6'),
    ],
  );
  await page.reload();
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByRole('button', { name: 'Filters' }).click();
  await page.locator('[data-new-query]').click();
  const editor = page.locator('[data-query-editor]');

  // All of: (any of: ECO B, ECO C), not a draw.
  await editor.getByRole('button', { name: 'Add a group' }).click();
  const group = editor.locator('[data-query-group="or"]');
  await group.getByLabel('Add a condition').selectOption('eco');
  await group.getByLabel('Add a condition').selectOption('eco');
  const ecos = group.getByLabel('ECO starts with');
  await ecos.nth(0).fill('B');
  await ecos.nth(1).fill('C');
  await editor.getByLabel('Add a condition').first().selectOption('result');
  const result = editor.locator('[data-query-condition="result"]');
  await result.getByLabel('Result').selectOption('1/2-1/2');
  await result.getByRole('checkbox', { name: 'not' }).check();

  await expect(editor.locator('[data-query-words]')).toHaveText(
    'Games where (ECO B… or ECO C…) and not drawn.',
  );
  // An empty condition cannot mean anything, and says so.
  await ecos.nth(1).fill('');
  await expect(editor.locator('[data-query-error]')).toContainText('needs a code');
  await ecos.nth(1).fill('C');

  const dialog = page.getByRole('dialog', { name: 'New query' });
  await dialog.getByLabel('Query name').fill('B or C, not drawn');
  await dialog.getByRole('button', { name: 'Save query' }).click();
  await expect(dialog).toBeHidden();
  const saved = page.locator('[data-saved-query="B or C, not drawn"]');
  await expect(saved).toContainText('(ECO B… or ECO C…) and not drawn');
  // Not a plain conjunction: it runs, but does not pretend to fit the mask.
  await expect(saved.getByRole('button', { name: 'Use as filters' })).toHaveCount(0);
  await saved.getByRole('button', { name: 'Run' }).click();
  await expect(saved.locator('[data-saved-query-result]')).toHaveText('1 of 3 games read match');
});
