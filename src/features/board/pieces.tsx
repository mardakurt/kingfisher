/**
 * The piece set.
 *
 * Drawn here rather than pulled from an image sprite so that pieces stay sharp
 * at any board size, inherit colour from the theme, and can be restyled (filled,
 * outlined) without shipping a second set of assets. Geometry is authored in a
 * 100 × 100 box with the piece standing on y = 94.
 */

import type { ReactElement } from 'react';

import type { Color, Piece, PieceType } from '@/chess/types';
import type { PieceSetId } from '@/lib/board-options';

export type { PieceSetId } from '@/lib/board-options';

export interface PieceSetInfo {
  readonly id: PieceSetId;
  readonly name: string;
  readonly description: string;
}

export const PIECE_SETS: readonly PieceSetInfo[] = [
  { id: 'staunton', name: 'Staunton', description: 'Solid silhouettes with a fine outline.' },
  { id: 'line', name: 'Line', description: 'Outlined pieces, lighter on the eye.' },
];

/**
 * A compact, original Staunton geometry authored on a shared 100 × 100 grid.
 * Every silhouette reaches the same baseline and stays inside the viewBox, so
 * changing square size cannot crop, stretch, or visually shift a piece.
 */
const GEOMETRY: Record<PieceType, ReactElement> = {
  p: (
    <>
      <circle cx="50" cy="25" r="12.5" />
      <path d="M39.5 36.5h21c5.2 5 8 11.6 8 19.1 0 8.7-3.7 15.1-9.5 20.4H41c-5.8-5.3-9.5-11.7-9.5-20.4 0-7.5 2.8-14.1 8-19.1Z" />
      <path d="M33 74h34c2.8 0 5 2.2 5 5v3H28v-3c0-2.8 2.2-5 5-5ZM24 83h52c2.8 0 5 2.2 5 5v4H19v-4c0-2.8 2.2-5 5-5Z" />
    </>
  ),
  n: (
    <>
      <path d="M62 12c12.2 5.1 19 16.6 19.8 34.4.5 11.8-.8 22.7-4 32.6H36.2c-3.1 0-5.2-3.2-3.9-6 2.7-6.1 7.1-11.6 13.3-16.5 5.5-4.4 9.1-8.2 10.7-11.5.9-1.8-.6-3.8-2.6-3.4-2.7.5-5.5 2.7-8.4 6.6l-3.7 5-12-6.5 8.7-15.9c3.6-6.6 9.1-11.6 16.4-14.9l2.1-7.6c.5-1.8 2.8-2.3 4-1l1.2 4.7Z" />
      <path d="M29 79h48c2.8 0 5 2.2 5 5v8H24v-8c0-2.8 2.2-5 5-5Z" />
    </>
  ),
  b: (
    <>
      <circle cx="50" cy="15" r="7" />
      <path d="M50 21c10.4 7.2 17 16.8 17 27.4 0 8.4-4 15.3-10.5 20.1h-13C37 63.7 33 56.8 33 48.4 33 37.8 39.6 28.2 50 21Z" />
      <path d="M36 67h28c2.8 0 5 2.2 5 5v4H31v-4c0-2.8 2.2-5 5-5ZM27 77h46c2.8 0 5 2.2 5 5v3H22v-3c0-2.8 2.2-5 5-5ZM22 86h56c2.8 0 5 2.2 5 5v2H17v-2c0-2.8 2.2-5 5-5Z" />
    </>
  ),
  r: (
    <>
      <path d="M22 16h14v11h8V16h12v11h8V16h14v23l-8 7v25l7 7H23l7-7V46l-8-7V16Z" />
      <path d="M24 72h52c2.8 0 5 2.2 5 5v5H19v-5c0-2.8 2.2-5 5-5ZM18 83h64c2.8 0 5 2.2 5 5v5H13v-5c0-2.8 2.2-5 5-5Z" />
    </>
  ),
  q: (
    <>
      <circle cx="16" cy="25" r="5.5" />
      <circle cx="33" cy="15" r="5.5" />
      <circle cx="50" cy="11" r="6" />
      <circle cx="67" cy="15" r="5.5" />
      <circle cx="84" cy="25" r="5.5" />
      <path d="M17 28 30 61h40l13-33-16 14-10-23-7 20-7-20-10 23-16-14Z" />
      <path d="M30 60h40c3 0 5.3 2.6 5 5.6l-1 9.4H26l-1-9.4c-.3-3 2-5.6 5-5.6ZM25 75h50c2.8 0 5 2.2 5 5v4H20v-4c0-2.8 2.2-5 5-5ZM19 85h62c2.8 0 5 2.2 5 5v3H14v-3c0-2.8 2.2-5 5-5Z" />
    </>
  ),
  k: (
    <>
      <path d="M46 4h8v8h8v8h-8v10h-8V20h-8v-8h8V4Z" />
      <path d="M50 27c12.9 0 22 8.6 22 19.6 0 8.1-4.4 15.3-11.2 19.9H39.2C32.4 61.9 28 54.7 28 46.6 28 35.6 37.1 27 50 27Z" />
      <path d="M35 65h30c2.8 0 5 2.2 5 5v5H30v-5c0-2.8 2.2-5 5-5ZM26 76h48c2.8 0 5 2.2 5 5v3H21v-3c0-2.8 2.2-5 5-5ZM20 85h60c2.8 0 5 2.2 5 5v3H15v-3c0-2.8 2.2-5 5-5Z" />
    </>
  ),
};

/** Interior detailing that reads as carving rather than as a second colour. */
const DETAIL: Partial<Record<PieceType, ReactElement>> = {
  n: (
    <>
      <circle cx="64" cy="29" r="2.5" fill="currentColor" stroke="none" />
      <path d="M67 17.5c5.8 4 9.1 10.1 10.2 18.2" strokeWidth="2.2" />
    </>
  ),
  b: <path d="M42 29 58 47" strokeWidth="3.2" />,
  r: <path d="M30 43h40M30 69h40" strokeWidth="2.4" />,
  q: <path d="M27 68h46M25 82h50" strokeWidth="2.2" />,
  // The king needs no interior detail: the cross, the dome and the collar
  // already separate it from the queen at any size.
};

export interface PieceIconProps {
  readonly piece: Piece;
  readonly set: PieceSetId;
  readonly className?: string;
}

export function PieceIcon({ piece, set, className }: PieceIconProps) {
  const white = piece.color === 'w';
  const body = white ? 'var(--piece-light)' : 'var(--piece-dark)';
  const contrast = white ? 'var(--piece-dark)' : 'var(--piece-light)';
  const outlined = set === 'line';

  // Every piece carries an opposite-colour outline so it reads on either
  // square. The Line set keeps a translucent body, preserving the lighter
  // visual weight without losing white pieces on light squares.
  const fill = outlined ? body : body;
  const fillOpacity = outlined ? (white ? 0.7 : 0.76) : 1;
  const stroke = contrast;
  const strokeWidth = outlined ? 2.7 : white ? 2 : 1.25;

  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label={pieceLabel(piece)}
      preserveAspectRatio="xMidYMid meet"
      shapeRendering="geometricPrecision"
    >
      <g
        fill={fill}
        fillOpacity={fillOpacity}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {GEOMETRY[piece.type]}
      </g>
      <g
        color={contrast}
        stroke={contrast}
        fill="none"
        opacity={outlined ? 0.84 : white ? 0.62 : 0.72}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {DETAIL[piece.type]}
      </g>
    </svg>
  );
}

const PIECE_NAMES: Record<PieceType, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

export const pieceLabel = (piece: Piece): string =>
  `${piece.color === 'w' ? 'White' : 'Black'} ${PIECE_NAMES[piece.type]}`;

export const pieceLetter = (type: PieceType, color: Color): string =>
  color === 'w' ? type.toUpperCase() : type;
