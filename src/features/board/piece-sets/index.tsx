/**
 * The piece-set registry.
 *
 * A set is a geometry family plus a rendering treatment, declared as data. The
 * board asks the registry for a renderer and knows nothing else, so adding a
 * set is a table entry rather than a change to the board.
 *
 * Colours always come from the board theme's `--piece-light` / `--piece-dark`
 * custom properties rather than being baked into a set. That is what lets any
 * of the six sets sit on any of the eight boards and stay readable: the theme
 * owns contrast, the set owns shape.
 */

import type { ReactElement } from 'react';

import type { Color, Piece, PieceType } from '@/chess/types';
import type { PieceSetId } from '@/lib/board-options';

import { GEOMETRY_FAMILIES, type GeometryFamily } from './geometry';

export type { PieceSetId } from '@/lib/board-options';

/**
 * How a geometry is painted.
 *
 * `outlineWidth` is asymmetric on purpose: a white piece on a light square
 * needs a heavier contrast outline than a black piece on a dark square, because
 * the eye separates dark-on-light more readily than light-on-dark.
 */
interface PieceStyle {
  readonly whiteOutline: number;
  readonly blackOutline: number;
  readonly fillOpacity?: number;
  readonly detailOpacity?: number;
  /** Flat sets drop interior detail rather than drawing it faintly. */
  readonly detail: boolean;
  /** Shadow beneath the piece; off for flat and high-contrast sets. */
  readonly shade?: boolean;
}

export interface PieceSetDefinition {
  readonly id: PieceSetId;
  readonly name: string;
  readonly description: string;
  readonly family: GeometryFamily;
  readonly style: PieceStyle;
}

export const PIECE_SETS: readonly PieceSetDefinition[] = [
  {
    id: 'staunton',
    name: 'Modern Staunton',
    description: 'Solid silhouettes with a fine contrast outline. The default.',
    family: 'staunton',
    style: { whiteOutline: 2, blackOutline: 1.25, detail: true, detailOpacity: 0.66, shade: true },
  },
  {
    id: 'classic',
    name: 'Classic Staunton',
    description: 'Heavier outline and stronger carving; reads well on wood.',
    family: 'staunton',
    style: { whiteOutline: 3.1, blackOutline: 2.3, detail: true, detailOpacity: 0.82, shade: true },
  },
  {
    id: 'tournament',
    name: 'Tournament',
    description: 'Flat fills, no interior detail. Calm in crowded positions.',
    family: 'staunton',
    style: { whiteOutline: 1.6, blackOutline: 0.9, detail: false },
  },
  {
    id: 'line',
    name: 'Line',
    description: 'Outlined and translucent; lighter on the eye during long study.',
    family: 'staunton',
    style: {
      whiteOutline: 2.9,
      blackOutline: 2.7,
      fillOpacity: 0.72,
      detail: true,
      detailOpacity: 0.86,
    },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Reduced shapes built for small boards and dense screens.',
    family: 'minimal',
    style: { whiteOutline: 2.2, blackOutline: 1.6, detail: true, detailOpacity: 0.7 },
  },
  {
    id: 'contrast',
    name: 'High Contrast',
    description: 'Pure black and white with a heavy outline, for low vision.',
    family: 'staunton',
    style: { whiteOutline: 4, blackOutline: 3.4, detail: false },
  },
];

const BY_ID = new Map(PIECE_SETS.map((set) => [set.id, set]));

export const pieceSet = (id: PieceSetId): PieceSetDefinition =>
  BY_ID.get(id) ?? (PIECE_SETS[0] as PieceSetDefinition);

export interface PieceIconProps {
  readonly piece: Piece;
  readonly set: PieceSetId;
  readonly className?: string;
  /** Suppress the accessible name where a parent already labels the square. */
  readonly decorative?: boolean;
}

export function PieceIcon({ piece, set, className, decorative }: PieceIconProps) {
  const definition = pieceSet(set);
  const geometry = GEOMETRY_FAMILIES[definition.family][piece.type];
  const { style } = definition;

  const white = piece.color === 'w';
  const body = white ? 'var(--piece-light)' : 'var(--piece-dark)';
  const contrast = white ? 'var(--piece-dark)' : 'var(--piece-light)';

  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': pieceLabel(piece) })}
      preserveAspectRatio="xMidYMid meet"
      shapeRendering="geometricPrecision"
    >
      {/*
        A soft ellipse under the piece, not a blur filter: filters are expensive
        to composite on a 32-piece board and pixelate when the board is scaled.
      */}
      {style.shade && (
        <ellipse cx="50" cy="93" rx="30" ry="4.5" fill="rgb(0 0 0 / 0.18)" stroke="none" />
      )}

      <path
        d={geometry.body}
        fill={body}
        fillOpacity={style.fillOpacity ?? 1}
        fillRule="evenodd"
        stroke={contrast}
        strokeWidth={white ? style.whiteOutline : style.blackOutline}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {style.detail && geometry.detail && (
        <path
          d={geometry.detail}
          fill="none"
          stroke={contrast}
          strokeWidth={geometry.detailWidth ?? 2.4}
          strokeOpacity={style.detailOpacity ?? 0.7}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

/** The six pieces of one colour, for a settings preview strip. */
export const PREVIEW_ORDER: readonly PieceType[] = ['k', 'q', 'r', 'b', 'n', 'p'];

export function PieceSetPreview({
  set,
  color = 'w',
  className,
}: {
  readonly set: PieceSetId;
  readonly color?: Color;
  readonly className?: string;
}): ReactElement {
  return (
    <span className={className}>
      {PREVIEW_ORDER.map((type) => (
        <PieceIcon
          key={type}
          piece={{ color, type }}
          set={set}
          className="h-full w-auto"
          decorative
        />
      ))}
    </span>
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
