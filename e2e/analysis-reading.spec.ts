import { expect, test, type Page } from '@playwright/test';

import { selectTool } from './tools';

/**
 * How a strong player reads the analysis surfaces (2026-10-16 pass).
 *
 * Each test here is one friction point found by screenshotting Analysis at
 * 1440x900 and 1024x720, and each was run against the code before its fix
 * and failed there. They measure what a player would see — where a row
 * breaks, how many engine lines are on screen, what the bar draws with no
 * evaluation — rather than which class a component carries.
 */

const READY = 'html[data-kingfisher-ready="true"]';
/*
  The Najdorf game the screenshots were taken with, side line included. At
  1440x900 its first row ended on "5." with "Nc3" starting the second.
*/
const GAME =
  '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e5 (6... e6 7. f3 b5 8. Qd2 Nbd7) 7. Nb3 Be6 8. f3 Be7 9. Qd2 O-O 10. O-O-O Nbd7 11. g4 b5 12. g5 b4 13. Ne2 Ne8 14. f4 a5 15. f5 a4 16. Nbd4 exd4 17. Nxd4 b3 18. Kb1 bxc2+ 19. Nxc2 Bb3 20. axb3 axb3 21. Na3 Ne5 *';

async function importGame(page: Page, pgn: string) {
  await page.goto('/analysis');
  await page.locator(READY).waitFor();
  await page
    .getByRole('button', { name: /^Import( PGN or FEN)?$/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  await dialog.getByRole('textbox').fill(pgn);
  await dialog.getByRole('button', { name: /Import game/ }).click();
  await expect(dialog).toBeHidden();
}

/**
 * Every move whose number is printed on a different row from it, as
 * "number→move". A number is the move button's previous sibling.
 */
async function orphanedNumbers(page: Page, moveSelector: string) {
  return page.locator(moveSelector).evaluateAll((moves) =>
    moves.flatMap((move) => {
      const number = move.previousElementSibling;
      if (!number || !/^\d+(\.|…|\.\.\.)$/.test(number.textContent?.trim() ?? '')) return [];
      const a = number.getBoundingClientRect();
      const b = move.getBoundingClientRect();
      // Same row: the two boxes overlap vertically.
      return a.bottom <= b.top + 1 || b.bottom <= a.top + 1
        ? [`${number.textContent}→${move.textContent}`]
        : [];
    }),
  );
}

test('with no evaluation the bar draws no fill, rather than the picture of 0.00', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/analysis');
  await page.locator(READY).waitFor();
  const bar = page.locator('[data-evaluation-bar]');
  await expect(bar).toHaveAttribute('aria-label', 'No evaluation');
  const drawn = await bar.evaluate((element) => ({
    fill: element.querySelector('[data-evaluation-bar-fill]')!.getBoundingClientRect().height,
    // The top band, the fill and the midline are the bar's three drawn layers.
    layers: [...element.querySelectorAll(':scope > div')].filter(
      (layer) => layer.getBoundingClientRect().height > 0,
    ).length,
  }));
  // Before: a fill half the bar's height over the other band — equality.
  expect(drawn.fill).toBeLessThan(1);
  expect(drawn.layers).toBe(0);
  await expect(bar).toHaveAttribute('data-empty', 'true');
});

test('a move number never ends a row of the notation without its move', async ({ page }) => {
  for (const size of [
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(size);
    await importGame(page, GAME);
    const notation = page.getByRole('region', { name: 'Notation' });
    await expect(notation.getByRole('button', { name: 'Ne5', exact: true })).toBeVisible();
    expect(
      await orphanedNumbers(page, '[data-notation-section] [aria-label="Game notation"] button'),
    ).toEqual([]);
  }
});

test('a short game leaves its room to the tools; a long one scrolls inside its share', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await importGame(page, '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 *');
  const section = page.locator('[data-notation-section]');
  const dock = page.locator('[data-workspace-dock]');
  await expect(section.getByRole('button', { name: 'a6', exact: true })).toBeVisible();
  const short = await section.evaluate((element) => element.getBoundingClientRect().height);
  const dockHeight = await dock.evaluate((element) => element.getBoundingClientRect().height);
  // Two rows of moves: the section's floor, not 38% of the dock (≈312px here).
  expect(short).toBeLessThanOrEqual(170);

  let long = '';
  for (let move = 1; move <= 60; move += 1) long += `${move}. ${move % 2 ? 'Nf3 Nf6' : 'Ng1 Ng8'} `;
  await importGame(page, `${long}*`);
  await expect(section.getByRole('button', { name: 'Ng8', exact: true }).last()).toBeAttached();
  const measured = await section.evaluate((element) => {
    const list = element.querySelector<HTMLElement>('[aria-label="Game notation"]')!;
    return {
      height: element.getBoundingClientRect().height,
      scrolls: list.scrollHeight > list.clientHeight + 1,
    };
  });
  expect(measured.height).toBeLessThanOrEqual(dockHeight * 0.38 + 1);
  expect(measured.scrolls).toBe(true);
});

test('engine lines read candidate first, use the row width, and all three are on screen', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await importGame(page, GAME);
  const dock = page.getByRole('complementary', { name: 'Workspace tools' });
  await dock
    .getByRole('region', { name: 'Notation' })
    .getByRole('button', { name: 'Nbd4', exact: true })
    .click();
  await selectTool(page, dock, 'Engine');
  await dock.getByRole('button', { name: 'Start analysis (E)' }).click();
  const third = dock.locator('[data-engine-line="3"]');
  // A full variation (the panel prints twelve plies), not the first depth.
  await expect(third.locator('button[title="Add this line up to here"]')).toHaveCount(12, {
    timeout: 60_000,
  });
  await dock.getByRole('button', { name: 'Stop analysis (E)' }).click();

  for (const rank of [1, 2, 3]) {
    await expect(dock.locator(`[data-engine-line="${rank}"]`)).toBeInViewport({ ratio: 1 });
  }

  const rows = await dock.locator('[data-engine-line]').evaluateAll((lines) =>
    lines.map((line) => {
      const moves = [
        ...line.querySelectorAll<HTMLElement>('button[title="Add this line up to here"]'),
      ];
      const variation = moves[0]!.closest('div')!;
      const row = line.firstElementChild!.getBoundingClientRect();
      return {
        // What the variation is left after the score chip and its gap.
        spare: row.width - 52 - 8 - variation.getBoundingClientRect().width,
        first: Number(getComputedStyle(moves[0]!).fontWeight),
        rest: Number(getComputedStyle(moves[1]!).fontWeight),
      };
    }),
  );
  for (const row of rows) {
    // Before: the invisible actions kept 72px of every row.
    expect(row.spare).toBeLessThanOrEqual(2);
    expect(row.first).toBeGreaterThanOrEqual(600);
    expect(row.rest).toBeLessThan(600);
  }
  expect(
    await orphanedNumbers(page, '[data-engine-line] button[title="Add this line up to here"]'),
  ).toEqual([]);

  // The actions are still there, on the row the pointer is over.
  const line = dock.locator('[data-engine-line="2"]');
  await line.hover();
  await expect(
    line.getByRole('button', { name: 'Pin this line so it stays visible' }),
  ).toBeVisible();
});

test('the status line names a flipped board and stays quiet about an upright one', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await importGame(page, GAME);
  const strip = page.locator('[data-workspace-board-column]');
  await expect(strip.getByText('White to play')).toBeVisible();
  await expect(strip.getByText(/^(White|Black) view$/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Flip board (F)' }).click();
  await expect(strip.getByText('Black view')).toBeVisible();
});

test("the explorer's tick column says what it is for", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/analysis');
  await page.locator(READY).waitFor();
  const dock = page.getByRole('complementary', { name: 'Workspace tools' });
  await selectTool(page, dock, 'Explorer');
  const table = dock.locator('[data-explorer-table]');
  await expect(table.locator('[data-explorer-move]').first()).toBeVisible({ timeout: 20_000 });
  const header = table.getByRole('columnheader', { name: 'Compare' });
  await expect(header).toHaveCount(1);
  await expect(header).toHaveAttribute('title', /compare/i);
});
