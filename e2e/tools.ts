import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Select a workspace tool, wherever Phase 10 put it.
 *
 * The dock no longer renders every tool as an equally weighted tab: the
 * pinned ones and the route's own context panel are in the strip, and the
 * rest are one click away under More. Tests care that a tool is reachable,
 * not which of the two it happens to be today — hard-coding that would make
 * every future change to the default pin set a test change too.
 *
 * The wait matters. The dock re-renders as a route's document loads, so a tab
 * that is about to appear reads as absent if the count is taken a frame too
 * early — which sends this to the More menu looking for a tool that is in the
 * strip, and fails on a timeout several minutes later.
 */
export async function selectTool(page: Page, dock: Locator, name: string): Promise<void> {
  const tab = dock.getByRole('tab', { name, exact: true });

  const inStrip = await tab
    .waitFor({ state: 'visible', timeout: 3_000 })
    .then(() => true)
    .catch(() => false);

  if (inStrip) {
    await tab.click();
    return;
  }

  await dock.getByRole('button', { name: /More/ }).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
  await expect(tab).toBeVisible();
}
