/**
 * The seven pages Phase 86 reworked — Daily, Season, Endgame, Score Sheet,
 * Similar Games, Team and Opening Files — in every arrangement a person
 * actually uses: a small window, a desk, a large screen, a phone; the
 * sections sidebar open and collapsed; light and dark.
 *
 * The defect that opened the work was lower-page content crowding the
 * sections sidebar: Daily and Season rendered their content as the frame's
 * un-padded children, after the grid, so it ran up against the navigation
 * with no gutter. What is measured here is that defect's general form, and
 * two neighbours of it:
 *
 * - **Crowding.** Nothing inside the workspace frame starts left of the
 *   sidebar's right edge plus a gutter.
 * - **Nested scrolling.** No scrolling region inside another: a list that
 *   scrolls inside a panel that scrolls is two scroll positions for one
 *   reading, and the inner one traps the wheel.
 * - **Legibility.** Text against the background it is actually drawn on
 *   reaches 4.5:1 — WCAG AA for body-size text — in both themes.
 *
 * Findings print with the route, the arrangement and the element, because
 * "a page crowds" is a number nobody can act on.
 */

import { expect, test } from '@playwright/test';

import { arrange, measure } from './page-audit';

const READY = 'html[data-kingfisher-ready="true"]';

const PAGES = [
  '/daily',
  '/season',
  '/endgame',
  '/scoresheet',
  '/similar',
  '/team',
  '/opening-files',
] as const;

const WINDOWS = [
  { name: 'small window', width: 1024, height: 700 },
  { name: '13-inch laptop', width: 1280, height: 800 },
  { name: 'desk', width: 1440, height: 900 },
  { name: 'large screen', width: 1920, height: 1080 },
  { name: 'phone', width: 390, height: 844 },
] as const;

const GUTTER = 8;

for (const theme of ['light', 'dark'] as const) {
  for (const collapsed of [false, true]) {
    test(`the seven pages fit every window — ${theme}, sidebar ${collapsed ? 'collapsed' : 'open'}`, async ({
      page,
    }) => {
      test.setTimeout(180_000);
      await arrange(page, { collapsed, theme });
      const findings: string[] = [];
      for (const window of WINDOWS) {
        await page.setViewportSize({ width: window.width, height: window.height });
        for (const route of PAGES) {
          await page.goto(route);
          await page.locator(READY).waitFor();
          await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
          await page.locator('[data-workspace-frame]').first().waitFor();
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
}
