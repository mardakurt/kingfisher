/**
 * Every application route carries the two controls that are the same
 * everywhere: the command palette and Settings.
 *
 * They were drawn once, inside the board routes' `WorkspaceFrame` header, and
 * nowhere else. The measured result was that six of the twenty-two
 * application routes had neither — the Library, Players, Databases, Recent,
 * Search and the Position page — and on Search and Players the header's
 * trailing region was empty, because the controls that had been at the right
 * of it were simply not there. A person who learned "Settings is at the right
 * of the header" lost it every time they left a board route, and the only way
 * back was to remember `⌘,`.
 *
 * The list is derived from `src/app/`, so a route added later is held to this
 * too. The public pages are excluded: they are marketing and legal pages
 * outside the workspace, and `/settings` is excluded because it *is* the
 * Settings surface — it opens as a full-screen dialog whose own close control
 * is the way out.
 */

import { readdirSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

const READY = 'html[data-kingfisher-ready="true"]';

const EXCLUDED = new Set([
  '/', // the landing
  '/install',
  '/privacy',
  '/security',
  '/data-licences',
  '/terms',
  '/settings', // the Settings dialog itself
]);

const routes = (() => {
  const appDir = path.join(process.cwd(), 'src', 'app');
  const found: string[] = [];
  for (const entry of readdirSync(appDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
    if (!readdirSync(path.join(appDir, entry.name)).includes('page.tsx')) continue;
    const route = `/${entry.name}`;
    if (!EXCLUDED.has(route)) found.push(route);
  }
  return found.sort();
})();

/** The header a route draws is either shape; both must carry the controls. */
const CONTROL = 'header button, header a';

async function missingControls(page: Page): Promise<string[]> {
  return page.evaluate((selector) => {
    const scope =
      document.querySelector('[data-workspace-header]') ??
      document.querySelector('[data-page-header]') ??
      document.querySelector('header');
    if (!scope) return ['no header at all'];
    const labels = [...scope.querySelectorAll(selector)].map((node) =>
      (node.getAttribute('aria-label') || node.textContent || '').trim(),
    );
    const missing: string[] = [];
    if (!labels.some((label) => label.includes('Search commands')))
      missing.push('no command palette control');
    if (!labels.some((label) => label.includes('Settings'))) missing.push('no Settings control');
    return missing;
  }, CONTROL);
}

test('every application route offers the command palette and Settings in its header', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const problems: string[] = [];
  for (const route of routes) {
    await page.goto(route);
    await page.locator(READY).waitFor();
    await page.locator('[data-workspace-header], [data-page-header], header').first().waitFor();
    for (const missing of await missingControls(page)) problems.push(`${route}: ${missing}`);
  }
  expect(problems, problems.join('\n')).toEqual([]);
});

test('the command palette opens from a route that has no board', async ({ page }) => {
  /*
    Not a selector check: the point of the parity is that the control *works*
    where it is now drawn. Players and Search are the two routes whose headers
    carried nothing at all before this, so they are the two worth pressing.
  */
  for (const route of ['/players', '/search', '/position']) {
    await page.goto(route);
    await page.locator(READY).waitFor();
    await page.getByRole('button', { name: 'Search commands' }).first().click();
    await expect(
      page.getByRole('dialog').or(page.locator('[data-palette-search]')).first(),
      `${route}: the command palette did not open from its own header control`,
    ).toBeVisible();
    await page.keyboard.press('Escape');
  }
});
