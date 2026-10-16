import { expect, test, type Page } from '@playwright/test';

import { gotoRoute } from './tools';

import { arrange, measure } from './page-audit';

/**
 * The sign-in, sign-up and recovery pages, held to the same page audit as
 * every Studio route (`e2e/page-audit.ts`): text under 4.5:1 against what it
 * is drawn on, text clipped without an ellipsis, a scroller inside a scroller.
 *
 * `route-audit.spec.ts` cannot reach them — they stand outside the workspace
 * shell and never set its ready marker — so they were excluded there and
 * recorded as a follow-up. This closes it.
 *
 * Each page is audited in both of its states: with an account service (the
 * forms people actually use, reached through the development-only project
 * hook with a transport that answers nothing) and without one ("Accounts are
 * not set up here"). The phone width is included because a sign-in link in an
 * email is most often opened on a phone.
 */

const ROUTES = ['/sign-in', '/sign-up', '/forgot-password'] as const;
const WINDOWS = [
  { name: 'phone', width: 375, height: 812 },
  { name: 'small window', width: 1024, height: 700 },
  { name: 'desk', width: 1440, height: 900 },
] as const;
const CLOUD = 'http://127.0.0.1:54398';

async function configure(page: Page) {
  await page.addInitScript((url) => {
    (window as { __kingfisherCloudConfig?: unknown }).__kingfisherCloudConfig = {
      url,
      key: 'sb_publishable_audit',
    };
  }, CLOUD);
  // Signed out, nothing to fetch; anything the client asks for is refused
  // rather than left hanging, so no request can hold the page in a loading state.
  await page.route(`${CLOUD}/**`, (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }),
  );
}

/** As a build with no project, even on a machine whose `.env.local` names one. */
async function unconfigure(page: Page) {
  await page.addInitScript(() => {
    (window as { __kingfisherCloudConfig?: unknown }).__kingfisherCloudConfig = false;
  });
}

async function settle(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
}

for (const theme of ['light', 'dark'] as const) {
  for (const configured of [true, false]) {
    test(`sign-in pages are legible — ${theme}, ${configured ? 'with' : 'without'} accounts`, async ({
      page,
    }) => {
      test.setTimeout(180_000);
      await arrange(page, { collapsed: false, theme });
      await (configured ? configure(page) : unconfigure(page));
      const findings: string[] = [];
      for (const size of WINDOWS) {
        await page.setViewportSize({ width: size.width, height: size.height });
        for (const route of ROUTES) {
          await gotoRoute(page, route);
          await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
          // The state that was asked for, not a loading frame: a form with a
          // configured project, the "not set up" heading without one.
          if (configured) await expect(page.getByLabel('Email')).toBeVisible();
          else
            await expect(
              page.getByRole('heading', { name: 'Accounts are not set up here' }),
            ).toBeVisible();
          await settle(page);
          for (const finding of await page.evaluate(measure, 0)) {
            findings.push(`${route} · ${size.name}: ${finding}`);
          }
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - window.innerWidth,
          );
          if (overflow > 0)
            findings.push(`${route} · ${size.name}: ${overflow}px wider than the window`);
        }
      }
      expect(findings, findings.join('\n')).toEqual([]);
    });
  }
}
