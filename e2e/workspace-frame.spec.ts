import { expect, test, type Page } from '@playwright/test';

/**
 * The frame every board route renders, and the three things the owner found
 * broken about the pages before it existed:
 *
 *  - "Open this position in Explorer" navigated with `?fen=` that no route
 *    ever read, so the Openings library opened instead of the position;
 *  - adding and removing pieces was reachable from Analysis only;
 *  - pressing More on the tool dock showed one clipped item and scrolled the
 *    pinned tabs out of sight.
 *
 * Each assertion here fails on the page as it was.
 */

const READY = 'html[data-kingfisher-ready="true"]';
const SICILIAN = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';

async function ready(page: Page) {
  await page.locator(READY).waitFor();
}

test('a ?fen= in the address puts that position on the board, in Explorer mode', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/openings?fen=${encodeURIComponent(SICILIAN)}`);
  await ready(page);
  // The library is the default mode; a position in the address means the board.
  const board = page.getByRole('grid', { name: 'Chessboard' }).first();
  await expect(board).toBeVisible();
  await expect(board.getByRole('gridcell', { name: /^c5, Black pawn/ })).toBeVisible();
  await expect(board.getByRole('gridcell', { name: /^e4, White pawn/ })).toBeVisible();
  // And the parameter is consumed, so a reload does not re-apply it over later work.
  await expect(page).not.toHaveURL(/fen=/);
});

test('every board route offers position setup from its header', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const route of [
    '/analysis',
    '/endgame',
    '/opening-files',
    '/repertoire',
    '/review',
    '/team',
  ]) {
    await page.goto(route);
    await ready(page);
    const setup = page.getByRole('button', { name: /^Set up position/ });
    await expect(setup, route).toBeVisible();
  }
  await page.getByRole('button', { name: /^Set up position/ }).click();
  await expect(page.getByRole('dialog', { name: /Set up/ })).toBeVisible();
});

test('More lists every remaining tool and leaves the pinned tabs where they were', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/analysis');
  await ready(page);
  const dock = page.getByRole('complementary', { name: 'Workspace tools' });
  const engine = dock.getByRole('tab', { name: 'Engine' });
  await expect(engine).toBeVisible();
  await dock.getByRole('button', { name: /More/ }).click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  const items = menu.getByRole('menuitem');
  expect(await items.count()).toBeGreaterThan(8);
  /*
    Every item is actually on screen — the menu used to be clipped to one.
    A bounding box is not enough to know: Phase 72's one-row strip put
    `overflow: hidden` on the row and the menu still *had* boxes below it,
    it was just painted over. So each item is hit-tested at its own centre:
    the element the browser would deliver a click to must be the item.
  */
  const reachable = await items.evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      if (rect.height === 0 || rect.bottom > window.innerHeight) return false;
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return hit === node || node.contains(hit);
    }),
  );
  expect(
    reachable.every(Boolean),
    `unreachable menu items: ${reachable
      .map((r, i) => (r ? '' : i))
      .filter((x) => x !== '')
      .join(',')}`,
  ).toBe(true);
  await menu.getByRole('menuitem', { name: 'Calculation' }).click();
  await expect(dock.getByRole('tab', { name: 'Calculation' })).toBeVisible();
  // The pinned tab did not scroll away; one click returns.
  await expect(engine).toBeVisible();
  await engine.click();
  await expect(dock.getByRole('button', { name: 'Analyse this position' })).toBeVisible();
});
