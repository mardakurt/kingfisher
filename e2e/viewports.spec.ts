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
