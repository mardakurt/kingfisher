/**
 * A position as a publishable diagram: one SVG, with the player's own piece
 * set and board colours, the coordinates, and the arrows and coloured squares
 * the author drew on that move.
 *
 * ChessBase copies a diagram to the clipboard for a book, an article or a
 * slide; this is the same, made from the same artwork the board shows. The
 * pieces are embedded as data URIs, so the SVG stands alone — nothing it
 * draws depends on a file being reachable later — and the PNG is that SVG
 * rasterised at the size asked for.
 *
 * `diagramSvg` is pure (artwork in, string out); `loadPieceArtwork` and
 * `diagramPng` are the browser halves.
 */

import type { Shape } from '@/chess/annotations';
import { parseFen } from '@/chess/fen';
import type { Color, Piece, PieceType } from '@/chess/types';

import { userArrowPoints } from './arrow-shape';

export interface DiagramColours {
  readonly light: string;
  readonly dark: string;
  readonly coordinateOnLight: string;
  readonly coordinateOnDark: string;
}

/** SVG markup for each piece, keyed `wK`, `bP` and so on. */
export type PieceArtwork = Readonly<Record<string, string>>;

export interface DiagramOptions {
  readonly fen: string;
  readonly orientation: Color;
  readonly colours: DiagramColours;
  readonly artwork: PieceArtwork;
  /** Fraction of a square the artwork box fills (the set's calibrated scale). */
  readonly pieceScale?: number;
  readonly shapes?: readonly Shape[];
  readonly coordinates?: boolean;
  /** Side of one square, in SVG units. */
  readonly square?: number;
  /** A caption under the board: "White to move", a game, a move. */
  readonly caption?: string;
}

const LETTER: Record<PieceType, string> = { k: 'K', q: 'Q', r: 'R', b: 'B', n: 'N', p: 'P' };
export const artworkKey = (piece: Piece): string => `${piece.color}${LETTER[piece.type]}`;

const BRUSH: Record<string, string> = {
  green: '#15781b',
  red: '#882020',
  // The light theme's engine best-move colour (`--engine-a-color`): a blue
  // arrow on a printed diagram is the board's engine-style arrow.
  blue: '#3a6cad',
  yellow: '#e68f00',
};

const escapeXml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const base64 = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

/** The diagram as a standalone SVG document, or null for a FEN that does not parse. */
export function diagramSvg(options: DiagramOptions): string | null {
  const parsed = parseFen(options.fen);
  if (!parsed.ok) return null;
  const s = options.square ?? 60;
  const margin = options.coordinates === false ? 0 : Math.round(s * 0.36);
  const captionHeight = options.caption ? Math.round(s * 0.55) : 0;
  const width = s * 8 + margin;
  const height = s * 8 + margin + captionHeight;
  const scale = options.pieceScale ?? 0.9;
  const parts: string[] = [];
  const centre = (square: string): [number, number] => {
    const file = square.charCodeAt(0) - 97;
    const rank = Number(square[1]) - 1;
    const column = options.orientation === 'w' ? file : 7 - file;
    const row = options.orientation === 'w' ? 7 - rank : rank;
    return [margin + column * s + s / 2, row * s + s / 2];
  };

  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      const rank = options.orientation === 'w' ? 7 - row : row;
      const file = options.orientation === 'w' ? column : 7 - column;
      const light = (rank + file) % 2 === 1;
      parts.push(
        `<rect x="${margin + column * s}" y="${row * s}" width="${s}" height="${s}" fill="${light ? options.colours.light : options.colours.dark}"/>`,
      );
    }
  }

  for (const shape of options.shapes ?? []) {
    if (shape.kind !== 'square') continue;
    const [x, y] = centre(shape.square);
    parts.push(
      `<rect x="${x - s / 2}" y="${y - s / 2}" width="${s}" height="${s}" fill="${BRUSH[shape.brush] ?? BRUSH.green}" fill-opacity="0.45"/>`,
    );
  }

  const inset = (s * (1 - scale)) / 2;
  parsed.value.board.forEach((piece, index) => {
    if (!piece) return;
    const art = options.artwork[artworkKey(piece)];
    if (!art) return;
    const square = `${String.fromCharCode(97 + (index % 8))}${Math.floor(index / 8) + 1}`;
    const [x, y] = centre(square);
    parts.push(
      `<image x="${x - s / 2 + inset}" y="${y - s / 2 + inset}" width="${s * scale}" height="${s * scale}" href="data:image/svg+xml;base64,${base64(art)}"/>`,
    );
  });

  // The same outline the live board draws (`arrow-shape.ts`), in pixels.
  for (const arrow of options.shapes ?? []) {
    if (arrow.kind !== 'arrow') continue;
    const colour = BRUSH[arrow.brush] ?? BRUSH.green!;
    const [x1, y1] = centre(arrow.from);
    const [x2, y2] = centre(arrow.to);
    const points = userArrowPoints(x1, y1, x2, y2, s);
    if (!points) continue;
    if (arrow.brush === 'blue') {
      // As BoardShapes draws it: the engine best-move arrow's halo, edge and opacity.
      const edge = Math.max(0.5, s * 0.02);
      parts.push(
        `<g opacity="0.82"><polygon points="${points}" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="${s * 0.05}" stroke-linejoin="round"/><polygon points="${points}" fill="${colour}" stroke="${colour}" stroke-width="${edge}" stroke-linejoin="round"/></g>`,
      );
    } else parts.push(`<polygon points="${points}" fill="${colour}" fill-opacity="0.85"/>`);
  }

  if (margin > 0) {
    const font = Math.round(s * 0.24);
    for (let i = 0; i < 8; i += 1) {
      const fileLetter = String.fromCharCode(97 + (options.orientation === 'w' ? i : 7 - i));
      const rankNumber = options.orientation === 'w' ? 8 - i : i + 1;
      parts.push(
        `<text x="${margin + i * s + s / 2}" y="${s * 8 + margin * 0.72}" font-size="${font}" font-family="Helvetica, Arial, sans-serif" text-anchor="middle" fill="#444">${fileLetter}</text>`,
        `<text x="${margin / 2}" y="${i * s + s / 2 + font * 0.35}" font-size="${font}" font-family="Helvetica, Arial, sans-serif" text-anchor="middle" fill="#444">${rankNumber}</text>`,
      );
    }
  }
  parts.push(
    `<rect x="${margin}" y="0" width="${s * 8}" height="${s * 8}" fill="none" stroke="#333" stroke-width="${Math.max(1, s / 40)}"/>`,
  );
  if (options.caption) {
    parts.push(
      `<text x="${margin + s * 4}" y="${s * 8 + margin + captionHeight * 0.72}" font-size="${Math.round(s * 0.26)}" font-family="Helvetica, Arial, sans-serif" text-anchor="middle" fill="#222">${escapeXml(options.caption)}</text>`,
    );
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="${width}" height="${height}" fill="#ffffff"/>${parts.join('')}</svg>`
  );
}

/** "White to move" / "Black to move", for a caption. */
export function sideToMoveCaption(fen: string): string {
  const parsed = parseFen(fen);
  if (!parsed.ok) return '';
  return parsed.value.turn === 'w' ? 'White to move' : 'Black to move';
}
