/**
 * The window's appearance, following the theme chosen in Kingfisher.
 *
 * Kingfisher has its own Light / Dark setting, and until Phase 84 the shell
 * knew nothing of it. The window's background was a fixed white, so a dark
 * profile opened on a white flash; and macOS kept drawing everything native —
 * the menus' submenus and context menus, the open and save sheets, the error
 * boxes, Sparkle's update window — in the *system* appearance, so a Kingfisher
 * in dark mode on a light Mac raised light sheets over a dark window, and the
 * other way about. A Mac application's native parts follow the application.
 *
 * So the renderer tells the shell its theme whenever it changes; the shell
 * sets `nativeTheme.themeSource` (what AppKit draws in) and the window's
 * background, and writes the choice beside the profile so the next launch
 * paints the right colour before the page has loaded.
 *
 * The two backgrounds are the Studio's canvas, `--surface-0` in each theme;
 * `appearance.test.mjs` holds them to `src/ui/palette.json`, which is held to
 * the stylesheet. The shell cannot import either at run time — it is packaged
 * without the web sources — so this is a checked copy.
 */
import fs from 'node:fs';
import path from 'node:path';

export const APPEARANCE_FILE = 'kingfisher-appearance.json';

/** The Studio's canvas in each theme: what the window shows before the page. */
export const WINDOW_BACKGROUND = Object.freeze({ light: '#ffffff', dark: '#1c1c1e' });

/** A theme the shell accepts, or null for anything else. */
export function normaliseTheme(value) {
  return value === 'light' || value === 'dark' ? value : null;
}

/**
 * The theme the last session ended in. Light — the Studio's default — when
 * there is no record or the record is unreadable: a wrong guess costs one
 * frame of the other colour, and a crash here would cost the launch.
 */
export function readAppearance(userData) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(userData, APPEARANCE_FILE), 'utf8'));
    return normaliseTheme(raw?.theme) ?? 'light';
  } catch {
    return 'light';
  }
}

export function writeAppearance(userData, theme) {
  const valid = normaliseTheme(theme);
  if (!valid) return false;
  try {
    fs.writeFileSync(
      path.join(userData, APPEARANCE_FILE),
      `${JSON.stringify({ theme: valid }, null, 2)}\n`,
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Apply a theme to the process and a window.
 *
 * `nativeTheme` and the window are passed in so the rule can be tested
 * without Electron: the native appearance is the theme, never `system`, and
 * the background is the canvas for that theme.
 */
export function applyAppearance(theme, { nativeTheme, window }) {
  const valid = normaliseTheme(theme);
  if (!valid) return null;
  if (nativeTheme && nativeTheme.themeSource !== valid) nativeTheme.themeSource = valid;
  if (window && !window.isDestroyed?.()) window.setBackgroundColor(WINDOW_BACKGROUND[valid]);
  return valid;
}
