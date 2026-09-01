/**
 * Board themes.
 *
 * A theme is the complete visual contract for one board: the two square
 * colours, the piece colours that must stay readable on them, and every
 * highlight the board draws. Phase 1 derived highlights from the application
 * accent, which meant a warm wooden board and a cold slate board shared one
 * highlight colour and one of them always looked wrong. Highlights now belong
 * to the theme, and every value is emitted as a CSS custom property so no
 * component hardcodes a board colour.
 *
 * Every theme here is flat. Textures and gradients were considered and left
 * out: they cost rendering quality at small sizes and buy nothing analytical.
 */

import type { BoardThemeId } from '@/lib/board-options';

export type { BoardThemeId } from '@/lib/board-options';

export interface BoardTheme {
  readonly id: BoardThemeId;
  readonly name: string;
  readonly description: string;
  readonly light: string;
  readonly dark: string;
  readonly pieceLight: string;
  readonly pieceDark: string;
  /** Coordinate labels drawn inside the squares. */
  readonly coordinateOnLight: string;
  readonly coordinateOnDark: string;
  /** The square a piece has been picked up from. */
  readonly selected: string;
  /** Both squares of the move that produced this position. */
  readonly lastMove: string;
  /** Radial wash under a king in check. */
  readonly check: string;
  /** Dots and rings marking legal destinations. */
  readonly legalMove: string;
}

export const BOARD_THEMES: readonly BoardTheme[] = [
  {
    id: 'slate',
    name: 'Slate',
    description: 'Neutral grey-blue. The quietest board here.',
    light: '#cfd6dd',
    dark: '#7d8b9a',
    pieceLight: '#fbfcfd',
    pieceDark: '#1d2229',
    coordinateOnLight: '#7d8b9a',
    coordinateOnDark: '#cfd6dd',
    selected: 'rgb(196 158 74 / 0.46)',
    lastMove: 'rgb(196 158 74 / 0.28)',
    check: 'rgb(198 82 74 / 0.85)',
    legalMove: 'rgb(28 34 42 / 0.26)',
  },
  {
    id: 'green',
    name: 'Classic Green',
    description: 'The tournament vinyl roll-up. Familiar to every club player.',
    light: '#eeeed2',
    dark: '#769656',
    pieceLight: '#fffffd',
    pieceDark: '#1d2419',
    coordinateOnLight: '#769656',
    coordinateOnDark: '#eeeed2',
    selected: 'rgb(246 214 88 / 0.55)',
    lastMove: 'rgb(246 214 88 / 0.36)',
    check: 'rgb(206 74 66 / 0.86)',
    legalMove: 'rgb(30 38 26 / 0.24)',
  },
  {
    id: 'blue',
    name: 'Tournament Blue',
    description: 'Cool and low-glare for long sessions.',
    light: '#dee3e6',
    dark: '#7a95b3',
    pieceLight: '#fdfefe',
    pieceDark: '#161b22',
    coordinateOnLight: '#7a95b3',
    coordinateOnDark: '#dee3e6',
    selected: 'rgb(240 196 76 / 0.5)',
    lastMove: 'rgb(240 196 76 / 0.32)',
    check: 'rgb(200 78 70 / 0.86)',
    legalMove: 'rgb(22 27 34 / 0.24)',
  },
  {
    id: 'walnut',
    name: 'Walnut',
    description: 'Warm wood tones without a texture bitmap.',
    light: '#e4cfa8',
    dark: '#a97d54',
    pieceLight: '#fcf8f1',
    pieceDark: '#2a2119',
    coordinateOnLight: '#a97d54',
    coordinateOnDark: '#e4cfa8',
    selected: 'rgb(122 84 40 / 0.44)',
    lastMove: 'rgb(150 108 48 / 0.34)',
    check: 'rgb(186 70 58 / 0.86)',
    legalMove: 'rgb(48 34 20 / 0.26)',
  },
  {
    id: 'sand',
    name: 'Sand',
    description: 'Low-contrast warm neutrals; easy on a bright screen.',
    light: '#eadfc8',
    dark: '#b09b76',
    pieceLight: '#fffdf7',
    pieceDark: '#282218',
    coordinateOnLight: '#b09b76',
    coordinateOnDark: '#eadfc8',
    selected: 'rgb(150 108 44 / 0.42)',
    lastMove: 'rgb(168 128 56 / 0.32)',
    check: 'rgb(192 76 62 / 0.84)',
    legalMove: 'rgb(44 36 24 / 0.24)',
  },
  {
    id: 'sage',
    name: 'Sage',
    description: 'Muted green, gentler than the classic tournament board.',
    light: '#dfe4d2',
    dark: '#7d9068',
    pieceLight: '#fbfcf6',
    pieceDark: '#20261a',
    coordinateOnLight: '#7d9068',
    coordinateOnDark: '#dfe4d2',
    selected: 'rgb(196 158 74 / 0.48)',
    lastMove: 'rgb(196 158 74 / 0.3)',
    check: 'rgb(198 80 70 / 0.85)',
    legalMove: 'rgb(28 34 24 / 0.24)',
  },
  {
    id: 'ink',
    name: 'Graphite',
    description: 'Dark and flat; pairs with the dark application theme.',
    light: '#b9bec7',
    dark: '#5d646f',
    pieceLight: '#f7f8fa',
    pieceDark: '#15181d',
    coordinateOnLight: '#5d646f',
    coordinateOnDark: '#b9bec7',
    selected: 'rgb(206 170 86 / 0.5)',
    lastMove: 'rgb(206 170 86 / 0.32)',
    check: 'rgb(204 84 76 / 0.88)',
    legalMove: 'rgb(12 14 18 / 0.32)',
  },
  {
    id: 'contrast',
    name: 'High Contrast',
    description: 'Maximum separation for low vision and bright rooms.',
    light: '#ffffff',
    dark: '#4a4a4a',
    pieceLight: '#ffffff',
    pieceDark: '#000000',
    coordinateOnLight: '#000000',
    coordinateOnDark: '#ffffff',
    selected: 'rgb(255 214 0 / 0.62)',
    lastMove: 'rgb(255 214 0 / 0.42)',
    check: 'rgb(255 0 0 / 0.72)',
    legalMove: 'rgb(0 0 0 / 0.45)',
  },
];

export const boardTheme = (id: BoardThemeId): BoardTheme =>
  BOARD_THEMES.find((theme) => theme.id === id) ?? (BOARD_THEMES[0] as BoardTheme);

/**
 * The theme as CSS custom properties.
 *
 * One function, one place: the real board, the settings preview and every
 * thumbnail read the same tokens, so a preview cannot drift from the board it
 * is previewing.
 */
export const boardThemeVariables = (theme: BoardTheme): Record<string, string> => ({
  '--square-light': theme.light,
  '--square-dark': theme.dark,
  '--piece-light': theme.pieceLight,
  '--piece-dark': theme.pieceDark,
  '--coord-on-light': theme.coordinateOnLight,
  '--coord-on-dark': theme.coordinateOnDark,
  '--square-selected': theme.selected,
  '--square-last-move': theme.lastMove,
  '--square-check': theme.check,
  '--square-legal': theme.legalMove,
});
