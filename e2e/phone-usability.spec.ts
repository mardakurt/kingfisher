/**
 * A phone, held to what a person using one would notice.
 *
 * `viewports.spec.ts` checks the application routes never scroll sideways.
 * These are the defects that check let through on 2026-10-22:
 *
 * - the public pages scrolled sideways at 320 px — the landing's header was
 *   335 px wide, and the security and data tables 358 px — and their links
 *   wrapped inside words ("Insta / ll");
 * - six controls at the right of every header left the page's own name three
 *   letters wide ("Rep…", "R.", "Ope…");
 * - Settings kept its section rail beside the panel, leaving the panel 140 px;
 * - text fields under 16 px, which iOS Safari zooms into on focus and leaves
 *   zoomed.
 */

import { expect, test, type Page } from '@playwright/test';

import { gotoRoute } from './tools';

const READY = 'html[data-kingfisher-ready="true"]';

async function sideways(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.describe('the public pages at 320 px', () => {
  test.use({ viewport: { width: 320, height: 568 } });

  for (const route of ['/', '/install', '/privacy', '/security', '/data-licences', '/terms']) {
    test(`${route} does not scroll sideways`, async ({ page }) => {
      await gotoRoute(page, route);
      await expect(page.locator('h1').first()).toBeVisible();
      expect(await sideways(page)).toBeLessThanOrEqual(0);
    });
  }

  test('the documents keep their navigation words whole', async ({ page }) => {
    await gotoRoute(page, '/security');
    const links = page.getByRole('navigation', { name: 'Primary' }).getByRole('link');
    await expect(links).toHaveCount(5);
    for (const link of await links.all()) {
      const box = await link.boundingBox();
      // One line of 13 px text in 6 px of padding; two lines is over 40.
      expect(box?.height ?? 0, await link.innerText()).toBeLessThan(40);
    }
  });

  test('the landing offers the account from its menu', async ({ page }) => {
    await gotoRoute(page, '/');
    await page.locator('.nav-menu summary').click();
    await expect(
      page.locator('.nav-menu-list').getByRole('link', { name: 'Account' }),
    ).toBeVisible();
  });
});

for (const width of [320, 390]) {
  test.describe(`application headers at ${width} px`, () => {
    test.use({ viewport: { width, height: 740 } });

    for (const route of ['/repertoire', '/review', '/endgame', '/games', '/players', '/puzzles']) {
      test(`${route} shows its whole name`, async ({ page }) => {
        await gotoRoute(page, route);
        await page.locator(READY).waitFor();
        const title = page.locator('header h1').first();
        await expect(title).toBeVisible();
        const clipped = await title.evaluate(
          (element) => element.scrollWidth - element.clientWidth,
        );
        expect(clipped, `"${await title.innerText()}" is cut off`).toBeLessThanOrEqual(1);
      });
    }
  });
}

test.describe('Settings on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the sections are a row above the panel, and the panel has the width', async ({ page }) => {
    await gotoRoute(page, '/analysis');
    await page.locator(READY).waitFor();
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page.getByRole('button', { name: 'Settings' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialog).toBeVisible();
    const rail = await dialog.getByRole('tablist', { name: 'Settings sections' }).boundingBox();
    const theme = await dialog.getByText('Theme', { exact: true }).boundingBox();
    expect(rail && theme).toBeTruthy();
    expect(theme!.y, 'the panel is under the sections').toBeGreaterThan(rail!.y + rail!.height - 1);
    const panel = await dialog.getByText('Applies to the whole application').boundingBox();
    expect(panel!.width, 'the panel is not a narrow column').toBeGreaterThan(250);
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();
  });
});

test.describe('text fields on a touch screen', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('are 16 px, so iOS does not zoom into them', async ({ page, browserName }) => {
    await gotoRoute(page, '/games');
    await page.locator(READY).waitFor();
    const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
    // Chromium reports a touch screen as a coarse pointer; that is the rule's
    // trigger, so it must be on for the measurement below to mean anything.
    if (browserName === 'chromium') expect(coarse).toBe(true);
    const search = page
      .getByRole('searchbox')
      .or(page.locator('input[type="search"], input[type="text"]'))
      .first();
    await expect(search).toBeVisible();
    const size = await search.evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
    expect(size).toBeGreaterThanOrEqual(coarse ? 16 : 0);
  });
});
