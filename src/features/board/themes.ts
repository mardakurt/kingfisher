/**
 * Board themes.
 *
 * Each theme fixes the two square colours and the piece colours, because those
 * four values have to work together: a light piece has to stay readable on a
 * light square. Highlights are derived from the accent, not from the theme, so
 * annotation colours mean the same thing on every board.
 */

import type { BoardThemeId } from '@/lib/board-options';

export type { BoardThemeId } from '@/lib/board-options';

export interface BoardTheme {
  readonly id: BoardThemeId;
  readonly name: string;
  readonly light: string;
  readonly dark: string;
  readonly pieceLight: string;
  readonly pieceDark: string;
  /** Coordinate labels, drawn inside the squares. */
  readonly coordinateOnLight: string;
  readonly coordinateOnDark: string;
}

export const BOARD_THEMES: readonly BoardTheme[] = [
  {
    id: 'slate',
    name: 'Slate',
    light: '#cfd6dd',
    dark: '#7d8b9a',
    pieceLight: '#fbfcfd',
    pieceDark: '#1d2229',
    coordinateOnLight: '#7d8b9a',
    coordinateOnDark: '#cfd6dd',
  },
  {
    id: 'walnut',
    name: 'Walnut',
    light: '#e4cfa8',
    dark: '#a97d54',
    pieceLight: '#fcf8f1',
    pieceDark: '#2a2119',
    coordinateOnLight: '#a97d54',
    coordinateOnDark: '#e4cfa8',
  },
  {
    id: 'ink',
    name: 'Ink',
    light: '#b9bec7',
    dark: '#5d646f',
    pieceLight: '#f7f8fa',
    pieceDark: '#15181d',
    coordinateOnLight: '#5d646f',
    coordinateOnDark: '#b9bec7',
  },
  {
    id: 'sage',
    name: 'Sage',
    light: '#dfe4d2',
    dark: '#7d9068',
    pieceLight: '#fbfcf6',
    pieceDark: '#20261a',
    coordinateOnLight: '#7d9068',
    coordinateOnDark: '#dfe4d2',
  },
];

export const boardTheme = (id: BoardThemeId): BoardTheme =>
  BOARD_THEMES.find((theme) => theme.id === id) ?? (BOARD_THEMES[0] as BoardTheme);

export const boardThemeVariables = (theme: BoardTheme): Record<string, string> => ({
  '--square-light': theme.light,
  '--square-dark': theme.dark,
  '--piece-light': theme.pieceLight,
  '--piece-dark': theme.pieceDark,
  '--coord-on-light': theme.coordinateOnLight,
  '--coord-on-dark': theme.coordinateOnDark,
});
