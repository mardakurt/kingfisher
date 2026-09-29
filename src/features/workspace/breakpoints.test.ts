import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  BOARD_BREAKPOINT_PX,
  LAPTOP_MAX_WIDTH_PX,
  NARROW_DOCK_MAX_WIDTH_PX,
  SHORT_VIEWPORT_QUERY,
  TALL_VIEWPORT_PX,
  TALL_VIEWPORT_QUERY,
  TITLEBAR_BAND_CLASS,
  TITLEBAR_BAND_MIN_CLASS,
  TITLEBAR_BAND_PX,
} from './breakpoints';

/**
 * The point of this file is that the numbers cannot drift apart.
 *
 * Every constant here was a literal in two or three modules, restating a
 * number the stylesheet owns as a token. Hoisting them into one module stops
 * the duplication; this test stops the hoisted copy going stale. Without it
 * the next person to edit `--breakpoint-board` in the stylesheet gets a
 * workspace that lays out two different ways depending on whether the decision
 * was reached in CSS or in JavaScript — and no test fails.
 */

const CSS = readFileSync(path.join(process.cwd(), 'src/app/globals.css'), 'utf8');

const token = (name: string): number => {
  const match = CSS.match(new RegExp(`--${name}:\\s*(\\d+)px`));
  if (!match) throw new Error(`globals.css has no --${name} in px`);
  return Number(match[1]);
};

describe('workspace breakpoints', () => {
  it('the desktop threshold is the token the stylesheet uses', () => {
    expect(BOARD_BREAKPOINT_PX).toBe(token('breakpoint-board'));
  });

  it('the tall threshold is the height the design documents', () => {
    /*
      `globals.css` and `TitleBarSafeArea.tsx` both describe the short-window
      rules as keyed to 860px, and the band this sits beside is 56px. If the
      number moves, one of those two prose contracts is now wrong, so the test
      names the value rather than only comparing it to itself.
    */
    expect(TALL_VIEWPORT_PX).toBe(860);
  });

  it('the tall and short queries partition the range with no gap', () => {
    /*
      The defect this exists for: written as `max-height: 859px` beside
      `min-height: 860px`, the pair leaves a 1px hole. A viewport height of
      859.5 — which browser zoom and fractional device pixel ratios produce —
      matches neither, so the board gets the tight padding and loses the loose
      one. Parsing both queries and checking a real height against them is the
      only way to see a hole that exists between two integers.
    */
    const parses = (query: string) => {
      const match = query.match(/\((min|max)-height:\s*([\d.]+)px\)/);
      if (!match) throw new Error(`cannot read a height out of ${query}`);
      return { bound: match[1] as 'min' | 'max', px: Number(match[2]) };
    };
    const tall = parses(TALL_VIEWPORT_QUERY);
    const short = parses(SHORT_VIEWPORT_QUERY);
    expect(tall.bound).toBe('min');
    expect(short.bound).toBe('max');

    // Every height in the neighbourhood must land in exactly one bucket.
    for (const height of [858.5, 859, 859.5, 859.98, 860, 860.5, 861, 1000]) {
      const isTall = height >= tall.px;
      const isShort = height <= short.px;
      expect(
        isTall !== isShort,
        `${height}px tall=${isTall} short=${isShort} — the two must be complements`,
      ).toBe(true);
    }

    // And the hole is genuinely closed: 859.5 is the case that used to match
    // nothing at all.
    expect(859.5 <= short.px).toBe(true);
  });

  it('the folding widths are the ones the arrangement was drawn for', () => {
    expect(LAPTOP_MAX_WIDTH_PX).toBe(1399);
    expect(NARROW_DOCK_MAX_WIDTH_PX).toBe(1599);
    // They are not the CSS breakpoints, and must not drift into becoming them:
    // `--breakpoint-wide` is where the grid reflows; 1599 is where this
    // arrangement stops being able to hold a dock beside a full document.
    expect(NARROW_DOCK_MAX_WIDTH_PX).not.toBe(token('breakpoint-panes'));
    expect(LAPTOP_MAX_WIDTH_PX).not.toBe(token('breakpoint-wide'));
  });

  it('the titlebar band is 56px, the height the chrome documents', () => {
    expect(TITLEBAR_BAND_PX).toBe(56);
  });

  it('the band class is a literal Tailwind can see', () => {
    /*
      The regression this test exists for, and the one the window-chrome suite
      caught: written as `` `h-[${TITLEBAR_BAND_PX}px]` `` the constant is
      correct TypeScript that silently does nothing. Tailwind scans source text
      for complete class names and cannot evaluate an interpolation, so no rule
      is emitted, the header is sized by its contents instead, and the drag
      region measures 36px where 56 was contracted. It failed quietly because
      the header still looked like a header — the band was gone, not the box.

      So: the class must appear literally in this file, which is what puts it
      in the scanner's view, and the number in it must match the number above.
    */
    const source = readFileSync(
      path.join(process.cwd(), 'src/features/workspace/breakpoints.ts'),
      'utf8',
    );
    expect(source, 'the class is built by interpolation, so Tailwind will never emit it').toContain(
      "'h-[56px]'",
    );
    expect(source, 'the class is built by interpolation, so Tailwind will never emit it').toContain(
      "'min-h-[56px]'",
    );
    expect(TITLEBAR_BAND_CLASS).toBe('h-[56px]');
    expect(TITLEBAR_BAND_CLASS).toContain(String(TITLEBAR_BAND_PX));
    expect(TITLEBAR_BAND_MIN_CLASS).toContain(String(TITLEBAR_BAND_PX));
    // And the emitted value must be a class Tailwind recognises as arbitrary
    // px sizing, not a stray token.
    expect(TITLEBAR_BAND_CLASS).toMatch(/^h-\[\d+px\]$/);
  });

  it('every window-drag header gets its band from the one constant', () => {
    /*
      Six files carry `data-titlebar-drag`. Four of them are the 56px band and
      must not spell the height; the other two are not the band at all and must
      not be forced into it — `MobileNavigation` is the mobile *bottom* tab bar
      and has no drag region, and `RecentWorkspace`'s drag header is a
      "pick up where you left off" panel sized by padding, not a fixed height.
      Listing the four is what makes that distinction checkable rather than a
      matter of who remembered.
    */
    const band = [
      'features/shell/Sidebar.tsx',
      'features/shell/PageHeader.tsx',
      'features/workspace/WorkspaceFrame.tsx',
      'features/player/PlayerWorkspace.tsx',
    ];

    const h14: string[] = [];
    const unbanded: string[] = [];
    for (const relative of band) {
      const source = readFileSync(path.join(process.cwd(), 'src', relative), 'utf8');
      // `h-14` is Tailwind's 3.5rem. Written literally it is the band, spelled
      // by hand, and is exactly the drift this constant exists to prevent.
      if (/(^|\s)h-14(\s|$)/.test(source) || /(^|\s)min-h-14(\s|$)/.test(source)) {
        h14.push(relative);
      }
      // Either variant counts: three headers are exactly the band, two take
      // it as a floor because their content may exceed it.
      if (!/TITLEBAR_BAND_(MIN_)?CLASS/.test(source)) unbanded.push(relative);
    }

    expect(h14, 'the band height is spelled literally instead of taken from the constant').toEqual(
      [],
    );
    expect(unbanded, 'drag headers in the band that do not use TITLEBAR_BAND_CLASS').toEqual([]);

    /*
      The exception, asserted rather than assumed. `MobileNavigation` is 56px
      for a completely different reason — a bottom tab bar sized for a finger,
      with no drag region — so it keeps its literal. If someone later makes it
      a drag header, this fails and the distinction has to be made consciously.
    */
    const mobile = readFileSync(
      path.join(process.cwd(), 'src/features/shell/MobileNavigation.tsx'),
      'utf8',
    );
    expect(mobile, 'the mobile tab bar is not the titlebar band').not.toContain(
      'data-titlebar-drag',
    );
    // And the other exception, asserted: a drag header that is sized by
    // padding rather than by a fixed height, so taking the band class would
    // change its layout.
    const recent = readFileSync(
      path.join(process.cwd(), 'src/features/recent/RecentWorkspace.tsx'),
      'utf8',
    );
    expect(recent).toContain('data-titlebar-drag');
    expect(recent).not.toContain('TITLEBAR_BAND_CLASS');
  });

  it('no module restates a threshold that now lives here', () => {
    /*
      The guard against the duplication returning. Any module other than this
      one and the test that checks it must not spell one of these numbers into
      a `matchMedia` or a Tailwind arbitrary media variant.
    */
    const offenders: string[] = [];
    const here = new Set(['breakpoints.ts', 'breakpoints.test.ts']);
    for (const file of workspaceSources()) {
      if (here.has(path.basename(file))) continue;
      const source = readFileSync(file, 'utf8');
      for (const [number, what] of [
        [String(BOARD_BREAKPOINT_PX), 'the desktop breakpoint'],
        [String(TALL_VIEWPORT_PX), 'the tall-viewport height'],
        [String(LAPTOP_MAX_WIDTH_PX), 'the laptop fold width'],
        [String(NARROW_DOCK_MAX_WIDTH_PX), 'the narrow-dock fold width'],
      ] as const) {
        if (
          new RegExp(
            `(min-width|max-width|min-height|max-height)[:\\s]\\s*${number}(?![\\d])`,
          ).test(source)
        ) {
          offenders.push(`${path.basename(file)} restates ${what} (${number})`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

function workspaceSources(): string[] {
  const dir = path.join(process.cwd(), 'src/features/workspace');
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry.endsWith('.ts') || entry.endsWith('.tsx')) out.push(path.join(dir, entry));
  }
  return out;
}
