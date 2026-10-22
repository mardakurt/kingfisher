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

/*
  2026-10-22, second pass: tablets, the iPhone's notch and home bar, and the
  controls a finger still missed.
*/
for (const size of [
  { width: 768, height: 1024 },
  { width: 834, height: 1194 },
]) {
  test.describe(`a tablet at ${size.width} px`, () => {
    test.use({ viewport: size });

    // With the sidebar open the header is about 560 px; the labels on
    // Position and Set up left "O" for Openings and "Endga…" for Endgame lab.
    for (const route of ['/openings', '/review', '/studies', '/endgame']) {
      test(`${route} shows its whole name`, async ({ page }) => {
        await gotoRoute(page, route);
        await page.locator(READY).waitFor();
        const title = page.locator('header h1').first();
        await expect(title).toBeVisible();
        await expect
          .poll(() => title.evaluate((element) => element.scrollWidth - element.clientWidth))
          .toBeLessThanOrEqual(1);
      });
    }
  });
}

test.describe('an iPhone with a notch and a home bar', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('keeps the navigation above the home bar and the header below the notch', async ({
    page,
    browserName,
  }) => {
    // Chromium can pretend to be a notched phone; the others have no insets,
    // where the same padding must be nothing at all.
    const insets = browserName === 'chromium' ? { top: 47, bottom: 34, left: 0, right: 0 } : null;
    if (insets) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets });
    }
    await gotoRoute(page, '/analysis');
    await page.locator(READY).waitFor();
    const measured = await page.evaluate(() => {
      const nav = document
        .querySelector('nav[aria-label="Primary mobile navigation"]')!
        .getBoundingClientRect();
      const header = document.querySelector('[data-workspace-header]')!.getBoundingClientRect();
      return { navBottom: nav.bottom, headerTop: header.top, height: innerHeight };
    });
    expect(measured.headerTop).toBe(insets?.top ?? 0);
    expect(measured.height - measured.navBottom).toBe(insets?.bottom ?? 0);
  });

  test('a notice fits a 320 px phone and sits above the navigation', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await gotoRoute(page, '/databases');
    await page.locator(READY).waitFor();
    // Raised the way the application raises one: a collection created.
    await page.getByRole('button', { name: 'New collection', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'New collection' });
    await dialog.getByLabel('Name').fill('A notice for a narrow phone');
    await dialog.getByRole('button', { name: 'Create' }).click();
    const notice = page.getByRole('status').filter({ hasText: 'in this browser' }).first();
    await expect(notice).toBeVisible();
    const box = (await notice.boundingBox())!;
    const nav = (await page.locator('nav[aria-label="Primary mobile navigation"]').boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
    expect(box.y + box.height).toBeLessThanOrEqual(nav.y);
  });
});

test.describe('controls on a touch screen', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('are at least 32 px where a finger has to hit them', async ({ page, browserName }) => {
    await gotoRoute(page, '/openings');
    await page.locator(READY).waitFor();
    const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
    if (browserName === 'chromium') expect(coarse).toBe(true);
    const chip = page.getByRole('button', { name: 'Sicilian', exact: true });
    const box = (await chip.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(coarse ? 32 : 0);

    await gotoRoute(page, '/analysis');
    await page.locator(READY).waitFor();
    const line = page.getByRole('group', { name: 'Candidate lines' }).getByRole('button').first();
    const lineBox = (await line.boundingBox())!;
    expect(Math.min(lineBox.width, lineBox.height)).toBeGreaterThanOrEqual(coarse ? 32 : 0);
  });
});
