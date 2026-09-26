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

import { expect, test, type Page } from '@playwright/test';

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
  { name: 'desk', width: 1440, height: 900 },
  { name: 'large screen', width: 1920, height: 1080 },
  { name: 'phone', width: 390, height: 844 },
] as const;

const GUTTER = 8;

async function arrange(page: Page, options: { collapsed: boolean; theme: 'light' | 'dark' }) {
  await page.addInitScript((options) => {
    try {
      const read = (key: string) => {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : { state: {}, version: 5 };
      };
      const preferences = read('kingfisher.preferences');
      preferences.state = { ...preferences.state, theme: options.theme };
      localStorage.setItem('kingfisher.preferences', JSON.stringify(preferences));
      const layout = read('kingfisher.workspace-layout');
      layout.state = { ...layout.state, sidebarCollapsed: options.collapsed };
      localStorage.setItem('kingfisher.workspace-layout', JSON.stringify(layout));
    } catch {
      // A page without storage renders its defaults; the test then says so.
    }
  }, options);
}

const measure = (gutter: number) => {
  const findings: string[] = [];
  const describe = (element: Element) => {
    const html = element as HTMLElement;
    const text = (html.innerText ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
    const data = [...html.attributes]
      .filter((attribute) => attribute.name.startsWith('data-'))
      .map((attribute) => attribute.name)
      .slice(0, 2)
      .join(' ');
    return `<${html.tagName.toLowerCase()}${data ? ` ${data}` : ''}>${text ? ` “${text}”` : ''}`;
  };
  const visible = (element: Element) => {
    const rect = element.getBoundingClientRect();
    // One pixel square is how a label is hidden for everyone but a screen reader.
    if (rect.width <= 1 || rect.height <= 1) return false;
    const style = getComputedStyle(element);
    return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
  };

  const frame = document.querySelector('[data-workspace-frame]');
  if (!frame) return ['no workspace frame on the page'];

  // Crowding: against the sections sidebar, when it is on screen. What is
  // measured is where text and form fields are drawn, not a padded box: a
  // row whose own padding keeps its words clear of the sidebar is not
  // crowding it.
  const nav = document.querySelector('nav[aria-label="Sections"]');
  const navRect = nav && visible(nav) ? nav.getBoundingClientRect() : null;
  if (navRect && navRect.right < window.innerWidth / 2) {
    const edge = navRect.right + gutter;
    const offend = (element: Element, left: number) => {
      findings.push(
        `crowds the sidebar: ${describe(element)} is drawn from ${Math.round(left)} px, the sidebar ends at ${Math.round(navRect.right)} px`,
      );
    };
    const texts = document.createTreeWalker(frame, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = texts.nextNode(); node && findings.length < 6; node = texts.nextNode()) {
      const element = node.parentElement;
      if (!element || !(node.textContent ?? '').trim() || !visible(element)) continue;
      range.selectNodeContents(node);
      const rect = range.getBoundingClientRect();
      if (rect.width > 0 && rect.left < edge - 0.5) offend(element, rect.left);
    }
    for (const field of Array.from(frame.querySelectorAll('input, select, textarea'))) {
      if (!visible(field)) continue;
      const rect = field.getBoundingClientRect();
      if (rect.left < edge - 0.5) offend(field, rect.left);
    }
  }

  // Nested scrolling: a scrolling region inside another.
  const scrolls = (element: Element) => {
    const style = getComputedStyle(element);
    return /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
  };
  const scrollers = Array.from(frame.querySelectorAll('*')).filter(
    (element) => visible(element) && scrolls(element),
  );
  for (const inner of scrollers) {
    /*
      The one deliberate exception: below the wide layout the tool dock is a
      panel the person resizes by its handle, under a page that scrolls to
      it. Its panels scroll inside it by design — the alternative is a page
      as long as the longest move list.
    */
    const dock = inner.closest('[data-workspace-dock]');
    if (dock?.parentElement && getComputedStyle(dock.parentElement).flexDirection === 'column')
      continue;
    const outer = scrollers.find((candidate) => candidate !== inner && candidate.contains(inner));
    if (outer)
      findings.push(`scrolls inside a scroller: ${describe(inner)} inside ${describe(outer)}`);
  }

  // Legibility: text against the background it is drawn on.
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const parse = (color: string) => {
    const match = color.match(/rgba?\(([^)]+)\)/);
    if (!match) return null;
    const [r, g, b, a = '1'] = match[1]!.split(/[ ,/]+/).filter(Boolean);
    return { r: Number(r), g: Number(g), b: Number(b), a: Number(a) };
  };
  const luminance = (c: { r: number; g: number; b: number }) =>
    0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
  const backgroundOf = (element: Element) => {
    // Composite translucent layers over the first opaque one below them.
    const layers: { r: number; g: number; b: number; a: number }[] = [];
    for (let node: Element | null = element; node; node = node.parentElement) {
      const color = parse(getComputedStyle(node).backgroundColor);
      if (color && color.a > 0) {
        layers.push(color);
        if (color.a >= 1) break;
      }
    }
    let base = { r: 255, g: 255, b: 255 };
    for (const layer of layers.reverse()) {
      base = {
        r: layer.r * layer.a + base.r * (1 - layer.a),
        g: layer.g * layer.a + base.g * (1 - layer.a),
        b: layer.b * layer.a + base.b * (1 - layer.a),
      };
    }
    return base;
  };
  const seen = new Set<string>();
  const walker = document.createTreeWalker(frame, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const element = node.parentElement;
    if (!element || !(node.textContent ?? '').trim() || !visible(element)) continue;
    if (element.closest('[data-board-surface], [aria-hidden="true"], [disabled], svg')) continue;
    const style = getComputedStyle(element);
    const color = parse(style.color);
    if (!color) continue;
    const background = backgroundOf(element);
    const composited = {
      r: color.r * color.a + background.r * (1 - color.a),
      g: color.g * color.a + background.g * (1 - color.a),
      b: color.b * color.a + background.b * (1 - color.a),
    };
    const [light, dark] = [luminance(composited), luminance(background)].sort((a, b) => b - a);
    const ratio = (light! + 0.05) / (dark! + 0.05);
    if (ratio < 4.5) {
      const key = `${style.color}|${Math.round(background.r)},${Math.round(background.g)},${Math.round(background.b)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push(`low contrast ${ratio.toFixed(2)}:1: ${describe(element)} (${style.color})`);
    }
  }
  return findings;
};

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
