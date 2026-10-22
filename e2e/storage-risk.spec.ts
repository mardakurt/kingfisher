/**
 * Safari deletes a site's data after seven days without a visit unless the
 * site is installed; Kingfisher says so, once, to someone with work to lose
 * (`persistence/storage-risk.ts`). The decision reads the user agent, so a
 * Safari agent on any engine exercises it; the rule itself is unit-tested.
 */

import { expect, test, type Page } from '@playwright/test';

import { gotoRoute, reloadRoute } from './tools';

const SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const READY = 'html[data-kingfisher-ready="true"]';

/** Something to lose, written through the development build's repositories. */
async function createStudy(page: Page) {
  // The hook is installed once the repositories open, which can follow `ready`.
  await page.waitForFunction(() => '__kingfisher' in globalThis);
  await page.evaluate(async () => {
    const repositories = (
      globalThis as unknown as {
        __kingfisher: { studies: { create(input: { title: string }): Promise<unknown> } };
      }
    ).__kingfisher;
    await repositories.studies.create({ title: 'Something to lose' });
  });
}

test.describe('in Safari', () => {
  test.use({ userAgent: SAFARI });

  test('the risk is said once there is work, and not again once dismissed', async ({ page }) => {
    await gotoRoute(page, '/studies');
    await page.locator(READY).waitFor();
    const notice = page.locator('[data-storage-risk]');
    // Nothing to lose yet: nothing said.
    await expect(notice).toHaveCount(0);

    await createStudy(page);
    await gotoRoute(page, '/analysis');
    await page.locator(READY).waitFor();
    await expect(notice).toBeVisible({ timeout: 15_000 });
    await expect(notice).toContainText('Add to Dock');
    await expect(notice.getByRole('link', { name: 'Sign in' })).toBeVisible();

    await notice.getByRole('button', { name: 'Not now' }).click();
    await expect(notice).toHaveCount(0);
    await reloadRoute(page);
    await page.locator(READY).waitFor();
    await page.waitForTimeout(1500);
    await expect(notice).toHaveCount(0);
  });
});

const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

test.describe('in another browser', () => {
  // Named, because the WebKit project's own agent is Safari's.
  test.use({ userAgent: CHROME });

  test('nothing is said', async ({ page }) => {
    await gotoRoute(page, '/studies');
    await page.locator(READY).waitFor();
    await createStudy(page);
    await gotoRoute(page, '/analysis');
    await page.locator(READY).waitFor();
    await page.waitForTimeout(2000);
    await expect(page.locator('[data-storage-risk]')).toHaveCount(0);
  });
});
