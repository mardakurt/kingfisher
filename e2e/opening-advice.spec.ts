/**
 * Openings to reconsider: the player's own losing choice, and what the
 * built-in reference played there that scored better, with counts.
 */

import { expect, test } from '@playwright/test';

import type { importGames } from '../src/persistence/import-game';
import type { AppRepositories } from '../src/persistence/types';

const READY = 'html[data-kingfisher-ready="true"]';

const losses = Array.from(
  { length: 6 },
  (_, index) => `[White "Player, Me"]
[Black "Opponent ${index}"]
[Result "0-1"]

1. e4 c5 2. Bc4 e6 0-1`,
);

test('Review shows where the player keeps losing and what the reference played instead', async ({
  page,
}) => {
  await page.goto('/review');
  await page.locator(READY).waitFor();
  await page.waitForFunction(() =>
    Boolean((globalThis as { __kingfisher?: unknown }).__kingfisher),
  );
  await page.evaluate(async (games) => {
    const app = (
      globalThis as typeof globalThis & {
        __kingfisher: AppRepositories & { importGames: typeof importGames };
      }
    ).__kingfisher;
    await app.profile.setAliases(['Player, Me']);
    for (const pgn of games) await app.importGames(pgn, app.games);
  }, losses);
  await page.reload();
  await page.locator(READY).waitFor();
  await page.getByRole('tab', { name: 'Improvement' }).click();

  const section = page.getByRole('region', { name: 'Openings to reconsider' });
  const row = section
    .locator('[data-opening-advice-list] li')
    .filter({ hasText: 'after 1.e4 c5: you played 2.Bc4 in 6 games and scored 0%' });
  await expect(row).toHaveCount(1, { timeout: 30_000 });
  // The source is named, and every move it suggests carries its count.
  await expect(row.locator('[data-opening-advice-source]')).toHaveText(
    /^In Kingfisher Starter Reference: 2\.\w+ scored \d+% \([\d,]+ games\)/,
  );

  await row.getByRole('button', { name: 'Open the position' }).click();
  await expect(page).toHaveURL(/\/analysis/);
  await expect(page.getByRole('contentinfo')).toContainText(
    'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
  );
});
