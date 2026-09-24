/**
 * Phase 84: merging games into one tree — ChessBase's preparation-file
 * workflow — from the Library's selection and from the explorer's model
 * games. See `src/chess/tree/merge.ts`.
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

const strip = (page: Page) => page.getByRole('tablist', { name: 'Workspace tabs' });
const tabs = (page: Page) => strip(page).getByRole('tab');
const tree = (page: Page) => page.locator('[data-move-tree]').first();

async function play(page: Page, from: string, to: string) {
  const board = page.getByRole('grid', { name: 'Chessboard' }).first();
  await board.getByRole('gridcell', { name: new RegExp(`^${from},`) }).click();
  await board.getByRole('gridcell', { name: new RegExp(`^${to},`) }).click();
}

const GAMES = [
  `[Event "Candidates"]
[Date "2024.04.10"]
[White "Alpha, A"]
[Black "Beta, B"]
[Result "1-0"]

1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 1-0`,
  `[Event "Norway Chess"]
[Date "2023.06.01"]
[White "Gamma, G"]
[Black "Delta, D"]
[Result "1/2-1/2"]

1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 1/2-1/2`,
  `[Event "Club"]
[Date "2022.01.01"]
[White "Epsilon, E"]
[Black "Zeta, Z"]
[Result "0-1"]

1. e4 c5 2. c3 d5 0-1`,
];

async function seed(page: Page) {
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
}

test.describe('merging games into one tree', () => {
  test('the Library merges the selected games into a new tab and keeps the board’s work', async ({
    page,
  }) => {
    await seed(page);
    // Work already on the board, which the merge must not replace.
    await play(page, 'g1', 'f3');
    await expect(tree(page)).toContainText('Nf3');
    await expect(tabs(page)).toHaveCount(1);

    await page
      .getByRole('navigation', { name: 'Sections' })
      .getByRole('link', { name: 'Library', exact: true })
      .click();
    await expect(page).toHaveURL(/\/games/);
    // Newest game first: the list's order decides which game is the spine.
    await page.getByRole('columnheader', { name: /Date/ }).getByRole('button').click();
    await expect(page.locator('[data-library-row]').first()).toContainText('Alpha, A');
    for (const name of ['Alpha, A', 'Gamma, G', 'Epsilon, E']) {
      await page.getByRole('checkbox', { name: new RegExp(`^Select ${name}`) }).check();
    }
    await page.getByRole('button', { name: 'Merge into one tree' }).click();

    await expect(page).toHaveURL(/\/analysis/);
    await expect(tabs(page)).toHaveCount(2);
    await expect(tabs(page).nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(tree(page)).toContainText(
      'Merged from 3 games: Alpha, A – Beta, B, Candidates 2024, 1-0 (main line); Gamma, G – Delta, D, Norway Chess 2023, ½–½ (from 2...Nc6); Epsilon, E – Zeta, Z, Club 2022, 0-1 (from 2.c3).',
    );

    // Sorted by date, the Candidates game is the spine and each other game is
    // named where it leaves it.
    await expect(tree(page)).toContainText('Nxd4');
    await expect(tree(page)).toContainText('Gamma, G – Delta, D');
    await expect(tree(page)).toContainText('Epsilon, E – Zeta, Z');
    await expect(tree(page)).toContainText('Nc6');
    await expect(tree(page)).toContainText('c3');

    // The merge is a document of its own: the first tab still has 1.Nf3.
    await tabs(page).nth(0).click();
    await expect(tree(page)).toContainText('Nf3');
    await expect(tree(page)).not.toContainText('Nxd4');
  });

  test('the explorer merges its model games from the built-in reference', async ({ page }) => {
    await page.goto(
      `/analysis?fen=${encodeURIComponent('rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2')}`,
    );
    await ready(page);
    const explorerTab = page.getByRole('tab', { name: 'Explorer', exact: true });
    await explorerTab.click();
    const merge = page.getByRole('button', { name: 'Merge into one tree' });
    await expect(merge).toBeVisible({ timeout: 30_000 });
    await merge.click();

    await expect(tabs(page)).toHaveCount(2);
    await expect(tree(page)).toContainText(/Merged from \d+ games: .+ \(main line\)/);
    // A merged file starts from the starting position, so its first move is 1.e4.
    await expect(tree(page)).toContainText('e4');
    await expect(
      page.getByText(/Merged: \d+ games from Kingfisher Starter Reference/).first(),
    ).toBeVisible();
  });
});
