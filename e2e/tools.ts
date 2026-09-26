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

/**
 * Whether a console line or page error is the noise a browser makes when a
 * full navigation cancels loads that were still in flight.
 *
 * `page.goto` unloads the document while pack chunks and worker scripts are
 * still arriving. Chromium settles those rejections silently on unload;
 * Firefox reports the worker script as `NS_BINDING_ABORTED`, and WebKit
 * reports every cancelled same-origin fetch as "due to access control
 * checks", "Load failed" or "WebKit encountered an internal error" — and
 * raises them as page errors. None of them happens on a route change inside
 * the application, which never unloads the document, and none is a CORS
 * failure: a real one would fail the same fetch in Chromium first, and the
 * Chrome project keeps every message. Only those two engines, only those
 * messages.
 */
export function isNavigationAbortNoise(text: string, browserName: string): boolean {
  // Firefox also spells it as the number: status=2152398850 is 0x804B0002,
  // NS_BINDING_ABORTED, e.g. a font download the navigation cancelled.
  if (browserName === 'firefox') return /NS_BINDING_ABORTED|status=2152398850\b/.test(text);
  if (browserName === 'webkit') {
    return (
      /due to access control checks/.test(text) ||
      /^(pageerror: )?Load failed$/.test(text.trim()) ||
      /WebKit encountered an internal error/.test(text)
    );
  }
  return false;
}
