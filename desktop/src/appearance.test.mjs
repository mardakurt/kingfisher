import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  APPEARANCE_FILE,
  WINDOW_BACKGROUND,
  applyAppearance,
  normaliseTheme,
  readAppearance,
  writeAppearance,
} from './appearance.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PALETTE = JSON.parse(
  fs.readFileSync(path.resolve(HERE, '../../src/ui/palette.json'), 'utf8'),
);

const profile = () => fs.mkdtempSync(path.join(os.tmpdir(), 'kf-appearance-'));

describe('the window follows the Studio theme', () => {
  it('paints the Studio canvas of each theme before the page has loaded', () => {
    expect(WINDOW_BACKGROUND).toEqual({
      light: PALETTE.light.canvas,
      dark: PALETTE.dark.canvas,
    });
  });

  it('accepts only the two themes Kingfisher has', () => {
    expect(normaliseTheme('light')).toBe('light');
    expect(normaliseTheme('dark')).toBe('dark');
    expect(normaliseTheme('system')).toBeNull();
    expect(normaliseTheme(undefined)).toBeNull();
    expect(normaliseTheme({ theme: 'dark' })).toBeNull();
  });

  it('remembers the theme beside the profile, and starts light without a record', () => {
    const dir = profile();
    expect(readAppearance(dir)).toBe('light');
    expect(writeAppearance(dir, 'dark')).toBe(true);
    expect(readAppearance(dir)).toBe('dark');
    expect(writeAppearance(dir, 'sepia')).toBe(false);
    expect(readAppearance(dir)).toBe('dark');
  });

  it('survives a record it cannot read', () => {
    const dir = profile();
    fs.writeFileSync(path.join(dir, APPEARANCE_FILE), '{ not json');
    expect(readAppearance(dir)).toBe('light');
    fs.writeFileSync(path.join(dir, APPEARANCE_FILE), JSON.stringify({ theme: 'purple' }));
    expect(readAppearance(dir)).toBe('light');
  });

  it('sets the native appearance to the theme, never to the system, and the background with it', () => {
    const nativeTheme = { themeSource: 'system' };
    const colours = [];
    const window = { isDestroyed: () => false, setBackgroundColor: (c) => colours.push(c) };
    expect(applyAppearance('dark', { nativeTheme, window })).toBe('dark');
    expect(nativeTheme.themeSource).toBe('dark');
    expect(colours).toEqual([PALETTE.dark.canvas]);
    expect(applyAppearance('system', { nativeTheme, window })).toBeNull();
    expect(nativeTheme.themeSource).toBe('dark');
    applyAppearance('light', { nativeTheme, window: { isDestroyed: () => true } });
    expect(nativeTheme.themeSource).toBe('light');
    expect(colours).toHaveLength(1);
  });
});
