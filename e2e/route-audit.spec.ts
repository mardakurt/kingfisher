/**
 * Every application route, held to the page audit the Phase 86 and Phase 87
 * screens meet (`e2e/page-audit.ts`).
 *
 * The audit itself was already good — crowding against the sidebar, a scroller
 * inside a scroller, text clipped without an ellipsis, text under 4.5:1
 * against what it is actually drawn on. What it was missing was coverage.
 * `phase87-pages-audit.spec.ts` proves six screens; the application ships
 * twenty-five routes, and nineteen of them were never measured. A contract
 * that only some routes are held to is a contract the others drift out of, and
 * these are the screens a person opens after Analysis: Opening Files, Endgame,
 * Review, Training, the databases, the search.
 *
 * The list is derived from `src/app/` rather than written by hand, so a route
 * added later is audited by default and a route deleted here fails loudly
 * instead of quietly leaving a hole. The public surfaces are excluded: the
 * landing and `/install`, `/privacy`, `/security`, `/data-licences` and
 * `/terms` are marketing and legal pages, not the workspace, and they carry
 * their own review.
 */

import { readdirSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { arrange, measure } from './page-audit';

const READY = 'html[data-kingfisher-ready="true"]';

/** Public pages: reviewed separately, and not part of the workspace shell. */
const PUBLIC_ROUTES = new Set([
  '/',
  '/install',
  '/privacy',
  '/security',
  '/data-licences',
  '/terms',
]);

/** Every directory under `src/app` that renders a `page.tsx`. */
const routes = (() => {
  const appDir = path.join(process.cwd(), 'src', 'app');
  const found: string[] = [];
  for (const entry of readdirSync(appDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
    if (!readdirSync(path.join(appDir, entry.name)).includes('page.tsx')) continue;
    const route = `/${entry.name}`;
    if (PUBLIC_ROUTES.has(route)) continue;
    found.push(route);
  }
  return found.sort();
})();

/*
  The two widths a layout actually breaks at. 1440 is the desk most people
  work at and the size the Phase 86/87 screens were re-audited at; 1024 is the
  small laptop, where a route with three columns and a rail has the least room
  and therefore the most to give away. The large screen is not re-audited
  here: a layout that holds at 1024 and 1440 holds at 1920, and doubling the
  runs to prove it costs minutes for no finding.
*/
const WINDOWS = [
  { name: 'small window', width: 1024, height: 700 },
  { name: 'desk', width: 1440, height: 900 },
] as const;

const GUTTER = 8;

for (const theme of ['light', 'dark'] as const) {
  test(`every application route is legible and uncrowded — ${theme}`, async ({ page }) => {
    test.setTimeout(300_000);
    await arrange(page, { collapsed: false, theme });
    const findings: string[] = [];
    for (const window of WINDOWS) {
      await page.setViewportSize({ width: window.width, height: window.height });
      for (const route of routes) {
        await page.goto(route);
        await page.locator(READY).waitFor();
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await page.locator('[data-workspace-frame], main').first().waitFor();
        // A colour caught mid-transition is not the colour on the page.
        await page.evaluate(() =>
          Promise.all(
            document
              .getAnimations()
              .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
              .map((animation) => animation.finished.catch(() => undefined)),
          ),
        );
        for (const finding of await page.evaluate(measure, GUTTER)) {
          findings.push(`${route} · ${window.name}: ${finding}`);
        }
      }
    }
    expect(findings, findings.join('\n')).toEqual([]);
  });
}
