/**
 * Piece geometry.
 *
 * Two families, both authored here as original vector paths on a shared
 * 100 × 100 grid with every silhouette standing on the same baseline. Sharing
 * the grid is what guarantees the properties that actually matter on a board:
 * nothing clips, nothing shifts when the square size changes, and a knight and
 * a bishop have the same visual weight.
 *
 * Geometry is data, not components, so a rendering style can restyle it
 * without duplicating a single path. That is the whole reason six piece sets
 * cost well under 20 kB of markup rather than six full sets of assets.
 */

import type { PieceType } from '@/chess/types';

export interface PieceGeometry {
  /** Body outline, filled with the piece colour. */
  readonly body: string;
  /** Interior lines that read as carving; drawn in the contrast colour. */
  readonly detail?: string;
  /** Stroke width for detail lines, when it differs from the default. */
  readonly detailWidth?: number;
}

export type GeometryFamily = 'staunton' | 'minimal';

/**
 * Staunton: the tournament shape everyone recognises, with the collar-and-base
 * stack that keeps the pieces distinguishable in a crowded position.
 */
const STAUNTON: Record<PieceType, PieceGeometry> = {
  p: {
    body:
      'M50 12.5a12.5 12.5 0 1 1 0 25 12.5 12.5 0 0 1 0-25Z' +
      'M39.5 36.5h21c5.2 5 8 11.6 8 19.1 0 8.7-3.7 15.1-9.5 20.4H41c-5.8-5.3-9.5-11.7-9.5-20.4 0-7.5 2.8-14.1 8-19.1Z' +
      'M33 74h34c2.8 0 5 2.2 5 5v3H28v-3c0-2.8 2.2-5 5-5Z' +
      'M24 83h52c2.8 0 5 2.2 5 5v4H19v-4c0-2.8 2.2-5 5-5Z',
  },
  n: {
    body:
      'M62 12c12.2 5.1 19 16.6 19.8 34.4.5 11.8-.8 22.7-4 32.6H36.2c-3.1 0-5.2-3.2-3.9-6 2.7-6.1 7.1-11.6 13.3-16.5 5.5-4.4 9.1-8.2 10.7-11.5.9-1.8-.6-3.8-2.6-3.4-2.7.5-5.5 2.7-8.4 6.6l-3.7 5-12-6.5 8.7-15.9c3.6-6.6 9.1-11.6 16.4-14.9l2.1-7.6c.5-1.8 2.8-2.3 4-1l1.2 4.7Z' +
      'M29 79h48c2.8 0 5 2.2 5 5v8H24v-8c0-2.8 2.2-5 5-5Z',
    detail: 'M67 17.5c5.8 4 9.1 10.1 10.2 18.2M64 26.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z',
    detailWidth: 2.2,
  },
  b: {
    body:
      'M50 8a7 7 0 1 1 0 14 7 7 0 0 1 0-14Z' +
      'M50 21c10.4 7.2 17 16.8 17 27.4 0 8.4-4 15.3-10.5 20.1h-13C37 63.7 33 56.8 33 48.4 33 37.8 39.6 28.2 50 21Z' +
      'M36 67h28c2.8 0 5 2.2 5 5v4H31v-4c0-2.8 2.2-5 5-5Z' +
      'M27 77h46c2.8 0 5 2.2 5 5v3H22v-3c0-2.8 2.2-5 5-5Z' +
      'M22 86h56c2.8 0 5 2.2 5 5v2H17v-2c0-2.8 2.2-5 5-5Z',
    detail: 'M42 29 58 47',
    detailWidth: 3.2,
  },
  r: {
    body:
      'M22 16h14v11h8V16h12v11h8V16h14v23l-8 7v25l7 7H23l7-7V46l-8-7V16Z' +
      'M24 72h52c2.8 0 5 2.2 5 5v5H19v-5c0-2.8 2.2-5 5-5Z' +
      'M18 83h64c2.8 0 5 2.2 5 5v5H13v-5c0-2.8 2.2-5 5-5Z',
    detail: 'M30 43h40M30 69h40',
    detailWidth: 2.4,
  },
  q: {
    body:
      'M16 19.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z' +
      'M33 9.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z' +
      'M50 5a6 6 0 1 1 0 12 6 6 0 0 1 0-12Z' +
      'M67 9.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z' +
      'M84 19.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z' +
      'M17 28 30 61h40l13-33-16 14-10-23-7 20-7-20-10 23-16-14Z' +
      'M30 60h40c3 0 5.3 2.6 5 5.6l-1 9.4H26l-1-9.4c-.3-3 2-5.6 5-5.6Z' +
      'M25 75h50c2.8 0 5 2.2 5 5v4H20v-4c0-2.8 2.2-5 5-5Z' +
      'M19 85h62c2.8 0 5 2.2 5 5v3H14v-3c0-2.8 2.2-5 5-5Z',
    detail: 'M27 68h46M25 82h50',
    detailWidth: 2.2,
  },
  k: {
    body:
      'M46 4h8v8h8v8h-8v10h-8V20h-8v-8h8V4Z' +
      'M50 27c12.9 0 22 8.6 22 19.6 0 8.1-4.4 15.3-11.2 19.9H39.2C32.4 61.9 28 54.7 28 46.6 28 35.6 37.1 27 50 27Z' +
      'M35 65h30c2.8 0 5 2.2 5 5v5H30v-5c0-2.8 2.2-5 5-5Z' +
      'M26 76h48c2.8 0 5 2.2 5 5v3H21v-3c0-2.8 2.2-5 5-5Z' +
      'M20 85h60c2.8 0 5 2.2 5 5v3H15v-3c0-2.8 2.2-5 5-5Z',
    // No interior detail: the cross, dome and collar already separate the king
    // from the queen at any size.
  },
};

/**
 * Minimal: the same six silhouettes reduced to their identifying feature — the
 * crown, the mitre, the horse's head, the battlements — on one common plinth.
 * Built for very small boards and dense screens, where Staunton detailing turns
 * into noise. Deliberately still a *chess* alphabet: recognition beats novelty.
 */
const MINIMAL: Record<PieceType, PieceGeometry> = {
  p: {
    body:
      'M50 20a11 11 0 1 1 0 22 11 11 0 0 1 0-22Z' +
      'M41 44h18l6 32H35l6-32Z' +
      'M27 78h46c2.6 0 4.6 2.1 4.6 4.6V90H22.4v-7.4c0-2.5 2-4.6 4.6-4.6Z',
  },
  n: {
    body:
      'M58 14c14 6 21 19 21 39v25H33c-2.4 0-4-2.5-3-4.7 2.6-5.9 7-11.2 13.2-15.9 6-4.6 9.3-8.5 9.9-11.7.4-2.1-1.9-3.6-3.6-2.3-2.4 1.8-4.9 4.9-7.4 9.2L28 46.5l10-16.5c4-6.6 9.7-11 17-13.3l1.4-6.3c.4-1.7 2.7-2 3.5-.4Z' +
      'M27 78h46c2.6 0 4.6 2.1 4.6 4.6V90H22.4v-7.4c0-2.5 2-4.6 4.6-4.6Z',
    detail: 'M61 30a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2Z',
    detailWidth: 2,
  },
  b: {
    body:
      'M50 8a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13Z' +
      'M50 22c11 8.5 17 18.5 17 28.5 0 10.5-7.6 19-17 27.5-9.4-8.5-17-17-17-27.5C33 40.5 39 30.5 50 22Z' +
      'M27 78h46c2.6 0 4.6 2.1 4.6 4.6V90H22.4v-7.4c0-2.5 2-4.6 4.6-4.6Z',
    detail: 'M50 34v18M42 43h16',
    detailWidth: 3,
  },
  r: {
    body:
      'M26 16h11v10h9V16h8v10h9V16h11v20l-6 6v36H32V42l-6-6V16Z' +
      'M27 78h46c2.6 0 4.6 2.1 4.6 4.6V90H22.4v-7.4c0-2.5 2-4.6 4.6-4.6Z',
    detail: 'M34 44h32',
    detailWidth: 2.6,
  },
  q: {
    body:
      'M18 16l10 20h44l10-20-4 62H22L18 16Z' +
      'M18 11a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z' +
      'M50 6a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z' +
      'M82 11a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z' +
      'M27 78h46c2.6 0 4.6 2.1 4.6 4.6V90H22.4v-7.4c0-2.5 2-4.6 4.6-4.6Z',
    detail: 'M27 46h46',
    detailWidth: 2.6,
  },
  k: {
    body:
      'M45.5 4h9v7.5H62v9h-7.5V30h-9v-9.5H38v-9h7.5V4Z' +
      'M31 32h38l-4 46H35l-4-46Z' +
      'M27 78h46c2.6 0 4.6 2.1 4.6 4.6V90H22.4v-7.4c0-2.5 2-4.6 4.6-4.6Z',
    detail: 'M33 48h34',
    detailWidth: 2.6,
  },
};

export const GEOMETRY_FAMILIES: Record<GeometryFamily, Record<PieceType, PieceGeometry>> = {
  staunton: STAUNTON,
  minimal: MINIMAL,
};
