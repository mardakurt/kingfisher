import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Select a workspace tool, wherever Phase 10 put it.
 *
 * The dock no longer renders every tool as an equally weighted tab: the
 * pinned ones and the route's own context panel are in the strip, and the
 * rest are one click away under More. Tests care that a tool is reachable,
 * not which of the two it happens to be today — hard-coding that would make
 * every future change to the default pin set a test change too.
 */
export async function selectTool(page: Page, dock: Locator, name: string): Promise<void> {
  const tab = dock.getByRole('tab', { name, exact: true });
  if ((await tab.count()) > 0) {
    await tab.click();
    return;
  }
  await dock.getByRole('button', { name: /More/ }).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
  await expect(dock.getByRole('tab', { name, exact: true })).toBeVisible();
}
