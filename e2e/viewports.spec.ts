/**
 * Every route, every supported width.
 *
 * The existing board matrix checks that Analysis stays square. This checks the
 * cheaper and more easily broken property across the whole product: that no
 * page ever makes the document scroll sideways. A single un-wrapped table or a
 * fixed-width panel is enough to do it, and it is the kind of regression that
 * survives review because nobody resizes to 1366 by hand.
 *
 * 1280x720 and 1366x768 are in the list deliberately. Applications tend to be
 * built on large displays and to fall apart on ordinary laptops, which is
 * where Kingfisher is meant to be used.
 */

import { expect, test, type Page } from '@playwright/test';

const VIEWPORTS = [
  [320, 568],
  [390, 844],
  [768, 1024],
  [1024, 768],
  [1280, 720],
  [1366, 768],
  [1440, 900],
  [1728, 1117],
  [1920, 1080],
  [2560, 1440],
] as const;

const ROUTES = [
  '/recent',
  '/players',
  '/analysis',
  '/openings',
  '/games',
  '/preparation',
  '/databases',
  '/repertoire',
  '/studies',
  '/training',
  '/review',
  '/model-game',
  '/endgame',
  '/opening-files',
] as const;

async function waitForApp(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

test('no route scrolls sideways at any supported width', async ({ page }) => {
  test.setTimeout(300_000);
  const problems: string[] = [];
  const consoleProblems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      consoleProblems.push(message.text());
    }
  });
  page.on('pageerror', (error) => consoleProblems.push(`pageerror: ${error.message}`));

  for (const [width, height] of VIEWPORTS) {
    await page.setViewportSize({ width, height });
    for (const route of ROUTES) {
      await page.goto(route);
      await waitForApp(page);
      const overflow = await page.evaluate(() => ({
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      if (overflow.scroll > overflow.client) {
        // Collected rather than thrown, so one run reports every broken
        // combination instead of only the first.
        problems.push(
          `${width}x${height} ${route}: scrollWidth ${overflow.scroll} > ${overflow.client}`,
        );
      }
    }
  }

  expect(problems).toEqual([]);
  expect([...new Set(consoleProblems)]).toEqual([]);
});

/**
 * Resizing a window that is already open.
 *
 * The board matrix in `kingfisher.spec.ts` sets a viewport and then loads the
 * page, which proves the board is sized correctly *on arrival*. It says nothing
 * about the case a workstation user actually hits: the application is open, and
 * they maximise it, or drag it onto a second display, or split it beside an
 * engine window. That path is a ResizeObserver rather than a first render, and
 * a stale observer would leave a board sized for the window that has gone —
 * either overflowing its column or sitting small in the middle of a large one,
 * until the page is reloaded.
 */
test('the board follows the window when it is resized, not only when it is loaded', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const board = () => page.getByRole('grid', { name: 'Chessboard' });

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/analysis');
  await waitForApp(page);
  const small = await board().boundingBox();
  expect(small).not.toBeNull();

  // Grow without reloading. The board should take the room it was given.
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect
    .poll(async () => Math.round((await board().boundingBox())?.width ?? 0), { timeout: 10_000 })
    .toBeGreaterThan(Math.round(small?.width ?? 0));

  const large = await board().boundingBox();
  expect(Math.abs((large?.width ?? 0) - (large?.height ?? 0)), 'still square').toBeLessThan(1);
  // It must also fit the space it is in, rather than overflowing it.
  const container = await page.locator('[data-board-container]').first().boundingBox();
  expect(large?.height ?? 0, 'fits its container').toBeLessThanOrEqual(
    (container?.height ?? 0) + 1,
  );

  // And shrink again, which is the direction that hides a stale size as overflow.
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect
    .poll(async () => Math.round((await board().boundingBox())?.width ?? 0), { timeout: 10_000 })
    .toBeLessThan(Math.round(large?.width ?? 0));

  const backAgain = await board().boundingBox();
  const shrunkContainer = await page.locator('[data-board-container]').first().boundingBox();
  expect(backAgain?.height ?? 0, 'fits the smaller container').toBeLessThanOrEqual(
    (shrunkContainer?.height ?? 0) + 1,
  );
  expect(
    Math.abs((backAgain?.width ?? 0) - (backAgain?.height ?? 0)),
    'square at the smaller size',
  ).toBeLessThan(1);
});
