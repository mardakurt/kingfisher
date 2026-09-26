/**
 * Saved queries in the Library (Phase 86): the whole question — a header
 * filter and a move filter — saved in a store backups carry, run through the
 * query model's executor, rerun after an import to show what is new, and put
 * back into the mask. Driven as a person drives it.
 */

import { expect, test, type Page } from '@playwright/test';

import type { importGames } from '../src/persistence/import-game';
import type { AppRepositories } from '../src/persistence/types';

const READY = 'html[data-kingfisher-ready="true"]';

const game = (event: string, elo: number, comment: string) => `[Event "${event}"]
[Date "2025.01.01"]
[White "Query, W"]
[Black "Query, B"]
[Result "1-0"]
[WhiteElo "${elo}"]
[BlackElo "${elo - 20}"]

1. e4 {${comment}} e5 2. Nf3 Nc6 1-0`;

async function seed(page: Page, pgns: readonly string[], clear: boolean) {
  await page.evaluate(
    async ({ pgns: all, clear: wipe }) => {
      const app = (
        globalThis as typeof globalThis & {
          __kingfisher: AppRepositories & { importGames: typeof importGames };
        }
      ).__kingfisher;
      if (wipe) await app.games.clear();
      for (const pgn of all) await app.importGames(pgn, app.games);
    },
    { pgns, clear },
  );
}

test('a saved query keeps the move filter, reruns with what is new, and fills the mask', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/games');
  await page.locator(READY).waitFor();
  await page.waitForFunction(() =>
    Boolean((globalThis as { __kingfisher?: unknown }).__kingfisher),
  );
  await seed(
    page,
    [
      game('Sharp one', 2500, 'a sharp start'),
      game('Sharp two', 2450, 'sharp again'),
      game('Quiet', 2600, 'calm'),
      game('Sharp but low', 2100, 'sharp'),
    ],
    true,
  );
  await page.reload();
  await page.locator(READY).waitFor();

  await page.getByRole('button', { name: 'Filters' }).click();
  const filters = page.locator('[data-library-filters]');
  await filters.getByLabel('Min Elo').fill('2400');
  await filters.getByLabel('Comment').fill('sharp');
  page.once('dialog', (dialog) => dialog.accept('Sharp and strong'));
  await filters.getByRole('button', { name: 'Save query' }).click();
  await expect(page.getByText('Saved query “Sharp and strong”.')).toBeVisible();

  const saved = page.locator('[data-saved-query="Sharp and strong"]');
  // Both halves of the question are in it, in words.
  await expect(saved).toContainText('a rating 2400 or more');
  await expect(saved).toContainText('a comment says "sharp"');
  await expect(saved).toContainText('Games with no rating are outside every rating band.');

  await saved.getByRole('button', { name: 'Run' }).click();
  await expect(saved.locator('[data-saved-query-result]')).toHaveText('2 of 3 games read match');

  // A new game that matches, then a rerun: one new since the last run.
  await seed(page, [game('Sharp three', 2550, 'sharp at last')], false);
  await saved.getByRole('button', { name: 'Run' }).click();
  await expect(saved.locator('[data-saved-query-result]')).toHaveText('3 of 4 games read match');
  await expect(saved.locator('[data-saved-query-diff]')).toContainText('1 new, 0 gone');

  // It survives a reload — it is in the store, not in this page.
  await page.reload();
  await page.locator(READY).waitFor();
  await page.getByRole('button', { name: 'Filters' }).click();
  await filters.getByLabel('Min Elo').fill('');
  await filters.getByLabel('Comment').fill('');
  await expect(saved.locator('[data-saved-query-result]')).toContainText('3 of 4 games');

  // And it goes back into the mask, both halves.
  await saved.getByRole('button', { name: 'Use as filters' }).click();
  await expect(filters.getByLabel('Min Elo')).toHaveValue('2400');
  await expect(filters.getByLabel('Comment')).toHaveValue('sharp');
});
