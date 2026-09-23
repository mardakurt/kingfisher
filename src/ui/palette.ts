/**
 * Kingfisher's palette, for what cannot read the stylesheet.
 *
 * Everything drawn inside a page reads the CSS custom properties in
 * `src/app/globals.css`. A few things are drawn before or outside a page —
 * the Mac window's background before the first paint, the web manifest's
 * colours, a printed brief, the app icon — and they used to carry their own
 * hex values: a navy manifest, a brown printed board, a teal icon, each a
 * different product. They read this instead, and `palette.test.ts` holds it
 * equal to the stylesheet, so the Studio stays the one source of the colour.
 */
import palette from './palette.json';

export type PaletteTheme = 'light' | 'dark';

export const PALETTE = {
  light: palette.light,
  dark: palette.dark,
  board: palette.board,
} as const;

/** The system font stack the Studio uses, for documents rendered outside it. */
export const PALETTE_FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, 'Segoe UI', Inter, sans-serif";

/** The monospace stack, for FEN and engine output in exported documents. */
export const PALETTE_MONO_STACK = "ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace";
