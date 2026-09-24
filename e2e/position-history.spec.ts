/**
 * The position page's history (Phase 84): from dated games in My games that
 * pass through a position — first played, the span of years, who plays it —
 * with the population named and the reference packs' silence explained.
 */

import { expect, test, type Page } from '@playwright/test';

import type { importGames } from '../src/persistence/import-game';
import type { AppRepositories } from '../src/persistence/types';

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.waitForFunction(() =>
    Boolean((globalThis as { __kingfisher?: unknown }).__kingfisher),
  );
}

const game = (white: string, black: string, date: string, result: string, moves: string) =>
  `[Event "History Test"]\n[Site "Riverside"]\n[Date "${date}"]\n[White "${white}"]\n[Black "${black}"]\n[Result "${result}"]\n\n${moves} ${result}`;

const NAJDORF = '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6';
const GAMES = [
  game('Tal, Mikhail', 'Najdorf, Fan', '1960.03.02', '1-0', `${NAJDORF} 6. Bg5 e6`),
  game('Fischer, Robert', 'Tal, Mikhail', '1962.05.10', '0-1', `${NAJDORF} 6. Bc4 e6`),
  game('Tal, Mikhail', 'Spassky, Boris', '1965.09.01', '1/2-1/2', `${NAJDORF} 6. Be2 e5`),
  game('Carlsen, Magnus', 'Tal, Mikhail', '2024.??.??', '1-0', `${NAJDORF} 6. h3 e5`),
  game('Unrelated, Player', 'Other, Player', '2001.01.01', '1-0', '1. d4 d5 2. c4 e6'),
];

test('the position page tells the position’s history from the dated games', async ({ page }) => {
  await page.goto('/analysis');
  await ready(page);
  await page.evaluate(async (games) => {
    const app = (
      globalThis as typeof globalThis & {
        __kingfisher: AppRepositories & { importGames: typeof importGames };
      }
    ).__kingfisher;
    await app.games.clear();
    for (const pgn of games) await app.importGames(pgn, app.games);
  }, GAMES);

  const fen = 'rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 6';
  await page.goto(`/position?fen=${encodeURIComponent(fen)}`);
  await ready(page);

  const history = page.locator('[data-position-history]');
  await expect(history).toContainText(
    'The reference packs keep one count per position and no dates',
  );
  await expect(history.locator('[data-history-summary]')).toHaveText('4 games, 1960–2024');
  await expect(history.locator('[data-history-first]')).toContainText(
    'Tal, Mikhail – Najdorf, Fan',
  );
  await expect(history.locator('[data-history-years]')).toBeVisible();
  const players = history.locator('[data-history-players]');
  await expect(players.locator('li').first()).toContainText('Tal, Mikhail');
  await expect(players.locator('li').first()).toContainText('4 (2 White, 2 Black)');
  await expect(history).not.toContainText('Unrelated, Player');

  await history.locator('[data-history-first]').click();
  await expect(page).toHaveURL(/\/analysis/);
});
