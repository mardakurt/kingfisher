/**
 * The accent read as text, in both themes.
 *
 * This is a regression test for a measured defect, not a style rule. The ECO
 * code on the Openings page is drawn in the accent colour on `--surface-3`,
 * and in the dark theme that pair measured **4.07:1** — under the 4.5:1 WCAG AA
 * floor for text — on every window width, in every route the audit visits. The
 * accent itself was never wrong: it is chosen to carry `--accent-contrast` text
 * on top of it, to sit under a focus ring and to paint a selected row. Used as
 * a *fill* it was doing its job; used as 12px *type* on a raised chip it was
 * answering a different question, and the answer was too quiet.
 *
 * So the two are separate tokens, the way the evaluation colours already are:
 * `--accent` is the surface, `--accent-ink` is the reading. This asserts the
 * reading clears the floor against every surface the workspace draws text on,
 * so the next person to reach for `--accent` as a text colour finds the reason
 * before they find the bug.
 *
 * The numbers are measured from the stylesheet rather than imported from a
 * table, so a theme edit that breaks the floor fails here.
 */

import fs from 'node:fs';
import path from 'node:path';

const css = fs.readFileSync(path.resolve(__dirname, '../app/globals.css'), 'utf8');

/** The declarations of one theme block, by its opening selector line. */
function block(opening: string): Record<string, string> {
  const start = css.indexOf(opening);
  expect(start).toBeGreaterThanOrEqual(0);
  const body = css.slice(start, css.indexOf('\n}\n', start));
  const values: Record<string, string> = {};
  for (const match of body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g))
    values[match[1]!] = match[2]!.trim();
  return values;
}

const THEMES = [
  ['light', "[data-theme='light'] {"],
  ['dark', ":root,\n[data-theme='dark'] {"],
] as const;

/** The surfaces the workspace draws text on, darkest-raised last. */
const SURFACES = ['--surface-0', '--surface-1', '--surface-2', '--surface-3'] as const;

function parseHex(value: string): { r: number; g: number; b: number } {
  const match = value.trim().match(/^#([0-9a-f]{6})$/i);
  expect(match, `${value} is not a six-digit hex colour`).not.toBeNull();
  const hex = match![1]!;
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

const channel = (value: number) => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminance = ({ r, g, b }: { r: number; g: number; b: number }) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

function contrast(foreground: string, background: string): number {
  const a = luminance(parseHex(foreground));
  const b = luminance(parseHex(background));
  const [light, dark] = [a, b].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

describe('the accent read as text', () => {
  it.each(THEMES)('clears 4.5:1 on every surface in the %s theme', (_theme, opening) => {
    const tokens = block(opening);
    const ink = tokens['--accent-ink'];
    expect(ink, 'the theme must define --accent-ink').toBeDefined();
    for (const surface of SURFACES) {
      const ratio = contrast(ink!, tokens[surface]!);
      expect(
        ratio,
        `--accent-ink ${ink} on ${surface} ${tokens[surface]} is ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(THEMES)('is the accent itself where the accent already passed — %s', (_t, opening) => {
    /*
      The light theme's accent measured 5.6:1 on its darkest raised surface, so
      it is not "fixed" there: two tokens, one value, and no reason to repaint
      a palette that was already legible. If a future edit makes the light
      `--accent` legible by moving it, this test says the ink should follow —
      it should not be a second, diverging blue.
    */
    const tokens = block(opening);
    const accent = contrast(tokens['--accent']!, tokens['--surface-3']!);
    if (accent >= 4.5) expect(tokens['--accent-ink']).toBe(tokens['--accent']);
  });
});
