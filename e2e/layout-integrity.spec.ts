/**
 * Every route, at a desk and on a phone: no button label drifts off its
 * centre line, no label is clipped, and no page scrolls sideways.
 *
 * These are the defects a screenshot suite misses because nobody has a
 * baseline for them and every assertion elsewhere still passes. "New team"
 * sat at the left of a widened button for a phase after a commit that said it
 * was centred; the install page scrolled 90 px sideways on a phone. Both were
 * measurable, so both are measured here.
 *
 * The check is geometric, not stylistic. For each visible button it measures
 * the free space left and right of its content. A widened button whose label
 * hugs one side is a defect unless it is a row that is meant to start there —
 * a menu item, a tab, a list row, a navigation link — or it says so with its
 * own `justify-*` class.
 */

import { expect, test } from '@playwright/test';

const READY = 'html[data-kingfisher-ready="true"]';

const ROUTES = [
  '/analysis',
  '/games',
  '/openings',
  '/studies',
  '/repertoire',
  '/preparation',
  '/players',
  '/opening-files',
  '/team',
  '/review',
  '/training',
  '/daily',
  '/season',
  '/endgame',
  '/search',
  '/recent',
  '/databases',
  '/similar',
  '/scoresheet',
  '/position',
  '/settings',
  '/model-game',
];

const PUBLIC = ['/', '/install', '/privacy', '/security', '/terms', '/data-licences'];

const VIEWPORTS = [
  { name: 'desk', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 812 },
] as const;

interface Finding {
  readonly kind: 'off-centre' | 'clipped' | 'page-scroll';
  readonly detail: string;
}

const measure = () => {
  const findings: { kind: string; detail: string }[] = [];
  const shown = (el: Element) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return (
      r.width > 0 &&
      r.height > 0 &&
      cs.visibility !== 'hidden' &&
      cs.opacity !== '0' &&
      el.closest('[aria-hidden="true"]') === null
    );
  };
  for (const el of document.querySelectorAll<HTMLElement>('button, a[role="button"]')) {
    if (!shown(el)) continue;
    const label = (el.getAttribute('aria-label') || el.textContent || '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 40);
    if (!label) continue;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const range = document.createRange();
    range.selectNodeContents(el);
    const boxes = [...range.getClientRects()].filter((box) => box.width > 0);
    if (boxes.length === 0) continue;
    const left = Math.min(...boxes.map((box) => box.left)) - (r.left + parseFloat(cs.paddingLeft));
    const right =
      r.right - parseFloat(cs.paddingRight) - Math.max(...boxes.map((box) => box.right));
    const startsByDesign =
      /(?:^|\s)(?:justify-(?:start|between)|text-left)/.test(el.className) ||
      cs.justifyContent === 'space-between' ||
      el.closest('[role="menu"],[role="listbox"],[role="tablist"],nav,table,li') !== null;
    if (!startsByDesign && r.width < 420 && Math.abs(left - right) > 12) {
      findings.push({
        kind: 'off-centre',
        detail: `"${label}" is ${Math.round(r.width)} px wide with ${Math.round(left)} px left of its label and ${Math.round(right)} px right`,
      });
    }
    if (el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== 'ellipsis') {
      findings.push({
        kind: 'clipped',
        detail: `"${label}" needs ${el.scrollWidth} px and has ${el.clientWidth}`,
      });
    }
  }
  const root = document.documentElement;
  if (root.scrollWidth > root.clientWidth + 1) {
    findings.push({
      kind: 'page-scroll',
      detail: `the page is ${root.scrollWidth} px wide in a ${root.clientWidth} px viewport`,
    });
  }
  return findings;
};

for (const viewport of VIEWPORTS) {
  test(`every workspace keeps its labels centred and its width at ${viewport.name} width`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const all: string[] = [];
    for (const route of ROUTES) {
      await page.goto(route);
      await page.locator(READY).waitFor();
      // Let lazy panels and the header's fold settle before measuring.
      await page.waitForTimeout(600);
      const findings = (await page.evaluate(measure)) as Finding[];
      all.push(...findings.map((finding) => `${route} ${finding.kind}: ${finding.detail}`));
    }
    expect(all, all.join('\n')).toEqual([]);
  });

  test(`the public pages fit a ${viewport.name} without sideways scrolling`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const all: string[] = [];
    for (const route of PUBLIC) {
      await page.goto(route);
      await page.waitForLoadState('load');
      const findings = (await page.evaluate(measure)) as Finding[];
      all.push(...findings.map((finding) => `${route} ${finding.kind}: ${finding.detail}`));
    }
    expect(all, all.join('\n')).toEqual([]);
  });
}
