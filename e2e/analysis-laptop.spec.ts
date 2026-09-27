import { expect, test } from '@playwright/test';

import { selectTool } from './tools';

/**
 * Analysis on the window most people have (Phase 87).
 *
 * A browser on a 1440x900 display leaves about 790px of page; a 13-inch
 * laptop with the dock showing, about 720. Measured before this phase at
 * 1440x790 with a 42-ply game: the notation under the board was 63px tall
 * (two lines), the board 530px, and the explorer's table was 650px wide in a
 * 380px panel — its result columns behind a sideways scroll.
 */

const READY = 'html[data-kingfisher-ready="true"]';
const GAME =
  '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e5 7. Nb3 Be6 8. f3 Be7 9. Qd2 O-O 10. O-O-O Nbd7 11. g4 b5 12. g5 b4 13. Ne2 Ne8 14. f4 a5 15. f5 a4 16. Nbd4 exd4 17. Nxd4 b3 18. Kb1 bxc2+ 19. Nxc2 Bb3 20. axb3 axb3 21. Na3 Ne5 *';

test('at 1280x720 the whole game is beside the board and the explorer needs no sideways scroll', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/analysis');
  await page.locator(READY).waitFor();
  await page
    .getByRole('button', { name: /^Import( PGN or FEN)?$/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  await dialog.getByRole('textbox').fill(GAME);
  await dialog.getByRole('button', { name: /Import game/ }).click();
  await expect(dialog).toBeHidden();

  const dock = page.getByRole('complementary', { name: 'Workspace tools' });
  const notation = dock.getByRole('region', { name: 'Notation' });
  await expect(notation).toBeVisible();
  // Every move of the game is on screen in the notation, not scrolled away.
  const last = notation.getByText('Ne5', { exact: true }).last();
  await expect(last).toBeInViewport();
  const board = await page.locator('[data-board-frame]').first().boundingBox();
  expect(Math.min(board!.width, board!.height)).toBeGreaterThanOrEqual(540);

  await selectTool(page, dock, 'Explorer');
  const table = dock.locator('[data-explorer-table]');
  await expect(table.locator('[data-explorer-move]').first()).toBeVisible({ timeout: 20_000 });
  const overflow = await table.evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  // The W/D/B counts step aside for a bar that still carries them.
  await expect(table.getByRole('columnheader', { name: 'W', exact: true })).toBeHidden();
  await expect(table.getByRole('img', { name: /^White won [\d,]+, drawn/ }).first()).toBeVisible();
  // At least five candidate moves are readable without scrolling the panel.
  const visibleRows = await table.locator('[data-explorer-move]').evaluateAll(
    (moves) =>
      moves.filter((move) => {
        const box = move.getBoundingClientRect();
        return box.bottom <= window.innerHeight - 24;
      }).length,
  );
  expect(visibleRows).toBeGreaterThanOrEqual(5);
});
