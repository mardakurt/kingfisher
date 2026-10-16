/**
 * The side column of a 1024x768 window: 299 px, and everything in it in reach.
 *
 * The Notation header needed 341 px, so its last control — "Move the notation"
 * — sat past the window's edge, and the workspace could be scrolled sideways
 * to it. And the tool dock's More opened end-aligned inside a column that
 * clips sideways: the first letters of every tool were cut off.
 */

import { expect, test } from '@playwright/test';

const READY = 'html[data-kingfisher-ready="true"]';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/analysis');
  await page.locator(READY).waitFor();
});

test('every Notation header control is inside the window, and nothing scrolls sideways', async ({
  page,
}) => {
  await expect(page.getByRole('button', { name: 'Move the notation' })).toBeInViewport({
    ratio: 1,
  });
  const sideways = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('main *')]
      // A screen-reader-only label is a one-pixel box that clips by design.
      .filter(
        (element) =>
          element.clientWidth > 1 &&
          /(hidden|auto|scroll|clip)/.test(getComputedStyle(element).overflowX),
      )
      .map((element) => element.scrollWidth - element.clientWidth)
      .filter((overflow) => overflow > 1),
  );
  expect(sideways).toEqual([]);
});

test("the dock's More menu opens whole inside its column", async ({ page }) => {
  const dock = page.locator('[data-workspace-dock]').first();
  await dock.getByRole('button', { name: /^More/ }).click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  const [menuBox, dockBox] = await Promise.all([menu.boundingBox(), dock.boundingBox()]);
  expect(menuBox!.x).toBeGreaterThanOrEqual(dockBox!.x);
  expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(dockBox!.x + dockBox!.width + 1);
});
