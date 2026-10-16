import { expect, test, type Page } from '@playwright/test';

import { selectTool } from './tools';

/**
 * A 1024x720 window shows the board *and* the tools, with or without the
 * navigation sidebar.
 *
 * Below the 1100px board breakpoint the workspace used to stack: board, then
 * every tool under it. Measured 2026-10-16 at 1024x720 the board column was
 * 640px tall and scrolled to 980, so a strong player saw a 570px board and no
 * notation, engine line or explorer row without scrolling the page. The frame
 * now measures its own width and puts the dock beside the board whenever a
 * 400px board and the narrowest dock both fit.
 */

const READY = 'html[data-kingfisher-ready="true"]';
const GAME =
  '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e5 7. Nb3 Be6 8. f3 Be7 9. Qd2 O-O 10. O-O-O Nbd7 *';

async function importGame(page: Page, pgn: string) {
  await page
    .getByRole('button', { name: /^Import( PGN or FEN)?$/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  await dialog.getByRole('textbox').fill(pgn);
  await dialog.getByRole('button', { name: /Import game/ }).click();
  await expect(dialog).toBeHidden();
}

/** Everything the reader needs on screen, measured as a player would see it. */
async function expectReadableWithoutScrolling(page: Page, label: string) {
  const board = await page.getByRole('grid', { name: 'Chessboard' }).boundingBox();
  expect(board, `${label}: board`).not.toBeNull();
  expect(Math.min(board!.width, board!.height), `${label}: board size`).toBeGreaterThanOrEqual(400);
  await expect(page.getByRole('grid', { name: 'Chessboard' })).toBeInViewport({ ratio: 1 });

  // The page itself does not scroll: neither the document nor the workspace.
  const scroll = await page.evaluate(() => {
    const row = document.querySelector('[data-workspace-board-column]')!.parentElement!;
    return {
      document: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      workspace: row.scrollHeight - row.clientHeight,
    };
  });
  expect(scroll, `${label}: scroll`).toEqual({ document: 0, workspace: 0 });

  const dock = page.getByRole('complementary', { name: 'Workspace tools' });
  const notation = dock.getByRole('region', { name: 'Notation' });
  await expect(notation, `${label}: notation`).toBeInViewport({ ratio: 1 });
  await expect(notation.getByRole('button', { name: 'Nbd7', exact: true })).toBeInViewport();

  await selectTool(page, dock, 'Engine');
  await dock.getByRole('button', { name: 'Start analysis (E)' }).click();
  const first = dock.locator('[data-engine-line="1"]');
  await expect(first.locator('button[title="Add this line up to here"]').first()).toBeVisible({
    timeout: 60_000,
  });
  await dock.getByRole('button', { name: 'Stop analysis (E)' }).click();
  await expect(first, `${label}: first engine line`).toBeInViewport({ ratio: 1 });

  await selectTool(page, dock, 'Explorer');
  const row = dock.locator('[data-explorer-table] [data-explorer-move]').first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row, `${label}: first explorer row`).toBeInViewport({ ratio: 1 });
}

test('at 1024x720 the board, notation, an engine line and an explorer row share the screen', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1024, height: 720 });
  await page.goto('/analysis');
  await page.locator(READY).waitFor();
  await importGame(page, GAME);

  await expectReadableWithoutScrolling(page, 'sidebar open');

  await page.getByRole('button', { name: 'Collapse navigation' }).click();
  await expect(page.getByRole('button', { name: 'Expand navigation' })).toBeVisible();
  await expectReadableWithoutScrolling(page, 'sidebar collapsed');
});

test('a portrait tablet keeps the stacked layout it has the height for', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 1366 });
  await page.goto('/analysis');
  await page.locator(READY).waitFor();
  const board = await page.getByRole('grid', { name: 'Chessboard' }).boundingBox();
  const dock = await page.getByRole('complementary', { name: 'Workspace tools' }).boundingBox();
  // The dock is under the board, not beside it.
  expect(dock!.y).toBeGreaterThanOrEqual(board!.y + board!.height);
});
