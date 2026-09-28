/**
 * The six screens Phase 87 changed — Analysis, the Library, Preparation,
 * Databases, Repertoire and Studies — held to the audit the Phase 86 pages
 * already meet (`e2e/page-audit.ts`): nothing crowds the sidebar, no scroller
 * sits inside another, no text is clipped without an ellipsis, and text reaches
 * 4.5:1 against what it is actually drawn on. In both themes, on the windows
 * these screens were redesigned for.
 *
 * Phase 87 rearranged all six and re-audited none of them for legibility; this
 * is that audit, kept as a test so the next rearrangement is held to it too.
 */

import { expect, test } from '@playwright/test';

import { arrange, measure } from './page-audit';

const READY = 'html[data-kingfisher-ready="true"]';

const PAGES = [
  '/analysis',
  '/games',
  '/preparation',
  '/databases',
  '/repertoire',
  '/studies',
] as const;

const WINDOWS = [
  { name: 'small window', width: 1024, height: 700 },
  { name: '13-inch laptop', width: 1280, height: 800 },
  { name: 'desk', width: 1440, height: 900 },
  { name: 'large screen', width: 1920, height: 1080 },
] as const;

const GUTTER = 8;

for (const theme of ['light', 'dark'] as const) {
  test(`the Phase 87 screens are legible and uncrowded — ${theme}`, async ({ page }) => {
    test.setTimeout(240_000);
    await arrange(page, { collapsed: false, theme });
    const findings: string[] = [];
    for (const window of WINDOWS) {
      await page.setViewportSize({ width: window.width, height: window.height });
      for (const route of PAGES) {
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
