/**
 * Merging games into one tree (Phase 84), through the Library: select games,
 * "Merge into one tree", and the result is on the board as a new analysis —
 * shared moves once, each departure a variation labelled with its game, a
 * game from another starting position left out with the reason.
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

const header = (white: string, black: string, result: string, extra = '') =>
  `[Event "Merge Test"]\n[Site "Riverside"]\n[Date "2026.05.01"]\n[White "${white}"]\n[Black "${black}"]\n[Result "${result}"]\n${extra}`;

const GAMES = [
  `${header('Spanish, Player', 'Classical, Replier', '1-0')}\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0`,
  `${header('Berlin, Player', 'Wall, Builder', '1/2-1/2')}\n1. e4 e5 2. Nf3 Nc6 3. Bb5 Nf6 1/2-1/2`,
  `${header('Open, Sicilian', 'Najdorf, Fan', '0-1')}\n1. e4 c5 2. Nf3 d6 0-1`,
  `${header('Endgame, Grinder', 'Rook, Holder', '1-0', '[SetUp "1"]\n[FEN "3r2k1/8/8/8/8/8/8/3R2K1 w - - 0 1"]\n')}\n1. Rxd8+ Kf7 1-0`,
];

test('merges selected games into one tree and opens it as a new analysis', async ({ page }) => {
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
  await page.goto('/games');
  await ready(page);

  const list = page.locator('[data-library-list]');
  await expect(list.getByText('Spanish, Player').first()).toBeVisible();
  for (const white of ['Spanish, Player', 'Berlin, Player', 'Open, Sicilian', 'Endgame, Grinder']) {
    await list
      .getByRole('checkbox', { name: new RegExp(`^Select ${white}`) })
      .first()
      .check();
  }
  // One game is not a tree: the action is offered from two.
  await page.getByRole('button', { name: 'Merge into one tree' }).click();

  await expect(page).toHaveURL(/\/analysis/);
  const notice = page.getByText(/3 games merged into one tree; the first is the main line\./);
  await expect(notice).toBeVisible();
  await expect(page.getByText(/1 started from another position and was left out\./)).toBeVisible();

  // The notation holds every merged game's moves, and each branch names its game.
  const notation = page.locator('main');
  await expect(notation).toContainText('Bb5');
  await expect(notation).toContainText('c5');
  await expect(notation).toContainText('Nf6');
  await expect(page.getByText('3 games merged').first()).toBeVisible();

  // Nothing stored changed: the Library still holds the four games, unmerged.
  const count = await page.evaluate(async () => {
    const app = (globalThis as typeof globalThis & { __kingfisher: AppRepositories }).__kingfisher;
    return (await app.games.search({ limit: 50 })).total;
  });
  expect(count).toBe(4);
});

test('a merge opens in its own tab and keeps the analysis already on the board', async ({
  page,
}) => {
  await page.goto('/analysis');
  await ready(page);
  await page.evaluate(
    async (games) => {
      const app = (
        globalThis as typeof globalThis & {
          __kingfisher: AppRepositories & { importGames: typeof importGames };
        }
      ).__kingfisher;
      await app.games.clear();
      for (const pgn of games) await app.importGames(pgn, app.games);
    },
    GAMES.slice(0, 2),
  );

  // Unsaved work on the board: 1.d4, played by hand.
  const board = page.getByRole('grid', { name: 'Chessboard' }).first();
  await board.getByRole('gridcell', { name: /^d2,/ }).click();
  await board.getByRole('gridcell', { name: /^d4,/ }).click();
  const notation = page.locator('[data-move-tree]').first();
  await expect(notation).toContainText('d4');

  const tabs = page.getByRole('tablist', { name: 'Workspace tabs' }).getByRole('tab');
  await expect(tabs).toHaveCount(1);
  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('link', { name: 'Library', exact: true })
    .click();
  const list = page.locator('[data-library-list]');
  for (const white of ['Spanish, Player', 'Berlin, Player']) {
    await list
      .getByRole('checkbox', { name: new RegExp(`^Select ${white}`) })
      .first()
      .check();
  }
  await page.getByRole('button', { name: 'Merge into one tree' }).click();

  await expect(tabs).toHaveCount(2);
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(notation).toContainText('Bb5');
  await tabs.nth(0).click();
  await expect(notation).toContainText('d4');
  await expect(notation).not.toContainText('Bb5');
});

test('the explorer merges the model games of the built-in reference', async ({ page }) => {
  await page.goto(
    `/analysis?fen=${encodeURIComponent('rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2')}`,
  );
  await ready(page);
  await page.getByRole('tab', { name: 'Explorer', exact: true }).click();
  const merge = page.getByRole('button', { name: 'Merge into one tree' });
  await expect(merge).toBeVisible({ timeout: 30_000 });
  await merge.click();
  const tabs = page.getByRole('tablist', { name: 'Workspace tabs' }).getByRole('tab');
  await expect(tabs).toHaveCount(2);
  await expect(
    page.getByText(/games merged from Kingfisher Starter Reference/).first(),
  ).toBeVisible();
  await expect(page.locator('[data-move-tree]').first()).toContainText('e4');
});
