import fs from 'node:fs';
import path from 'node:path';

import { BOARD_THEMES } from '@/features/board/themes';

import { PALETTE } from './palette';

/**
 * The palette file is a copy of the stylesheet's values for consumers that
 * cannot read CSS. A copy drifts; this is what stops it.
 */
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

const NAMES = {
  canvas: '--surface-0',
  sidebar: '--surface-sidebar',
  raised: '--surface-2',
  text: '--text-primary',
  textSecondary: '--text-secondary',
  textTertiary: '--text-tertiary',
  hairline: '--border',
  hairlineStrong: '--border-strong',
  accent: '--accent',
} as const;

describe('the palette for consumers outside the stylesheet', () => {
  it.each([
    ['light', "[data-theme='light'] {"],
    ['dark', ":root,\n[data-theme='dark'] {"],
  ] as const)('matches the %s theme of the Studio stylesheet', (theme, opening) => {
    const tokens = block(opening);
    for (const [key, variable] of Object.entries(NAMES)) {
      expect({ key, value: PALETTE[theme][key as keyof typeof NAMES] }).toEqual({
        key,
        value: tokens[variable],
      });
    }
  });

  it('carries the Studio board, which the app icon is drawn from', () => {
    const studio = BOARD_THEMES.find((theme) => theme.id === 'studio')!;
    expect(PALETTE.board).toEqual({ light: studio.light, dark: studio.dark, frame: studio.frame });
    const root = block(":root,\n[data-theme='dark'] {");
    expect({
      light: root['--brand-square-light'],
      dark: root['--brand-square-dark'],
      frame: root['--brand-frame'],
    }).toEqual(PALETTE.board);
  });
});
