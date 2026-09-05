/**
 * The piece-set registry.
 *
 * A set is either **vendored artwork** — twelve SVG files under `public/piece/`,
 * drawn by people who draw chess pieces for a living — or the Phase 1 fallback
 * **geometry**, which is hand-written path data coloured from the board theme.
 *
 * Artwork won. The geometry sets were a reasonable way to ship a board before
 * there was anything else, but they never looked like chess pieces next to a
 * real Staunton set, so they are no longer offered. They are still *resolvable*,
 * because a preference is a contract: a stored `pieceSet: 'minimal'` from an
 * older install must render a board, not an empty grid.
 *
 * Vendored sets carry their own colours. That is the point of using real
 * artwork and the reason `--piece-light` / `--piece-dark` no longer apply to
 * them: a Staunton knight is not a silhouette with a fill, it is a drawing.
 * Board themes therefore stop owning piece contrast and start being chosen to
 * suit it, which is what the appearance matrix in Settings is for.
 *
 * Every vendored set's licence and author is recorded here *and* in
 * THIRD_PARTY_ASSETS.md, so the obligation travels with the code rather than
 * living only in a document somebody forgets to read.
 */

import type { ReactElement } from 'react';

import type { Color, Piece, PieceType } from '@/chess/types';
import type { PieceSetId } from '@/lib/board-options';

import { GEOMETRY_FAMILIES, type GeometryFamily } from './geometry';

export type { PieceSetId } from '@/lib/board-options';

export interface AssetAttribution {
  readonly author: string;
  /** SPDX-style identifier, or the licence's common name. */
  readonly license: string;
  readonly licenseUrl: string;
  readonly source: string;
}

/**
 * How a geometry family is painted. Fallback-only; see the module comment.
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
  readonly detail: boolean;
  readonly shade?: boolean;
}

interface VectorPieceSet {
  readonly kind: 'vector';
  readonly id: PieceSetId;
  readonly name: string;
  readonly description: string;
  /** Directory under `public/`, without a trailing slash. */
  readonly directory: string;
  readonly attribution: AssetAttribution;
  /** See PIECE_INK_TARGET. */
  readonly visualScale: number;
}

interface GeometryPieceSet {
  readonly kind: 'geometry';
  readonly id: PieceSetId;
  readonly name: string;
  readonly description: string;
  readonly family: GeometryFamily;
  readonly style: PieceStyle;
  readonly visualScale: number;
}

export type PieceSetDefinition = VectorPieceSet | GeometryPieceSet;

/**
 * How much of a square a piece's ink should cover, at its tallest.
 *
 * Artwork sets disagree wildly about their own margins — measured across the
 * ten vendored sets, the tallest piece covered anywhere from 0.802 to 0.935 of
 * its own box before any of this existed. Rendering them all at the same box
 * size therefore made Celtic look correct and Cburnett look small, and the
 * board applied a further 6% inset on top, which took the default set down to
 * 0.688. Lichess draws the same Cburnett files at 0.782.
 *
 * So the calibration is per set and not a single number: each set's
 * `visualScale` is the factor that brings *its* tallest piece to this target.
 * `npm run pieces:measure` re-derives them by rasterising every piece exactly
 * as the board draws it and taking the alpha bounding box; the measurements
 * behind the numbers below are in `docs/design/piece-proportions.md`.
 */
export const PIECE_INK_TARGET = 0.86;

/**
 * The widest a calibrated piece may be, as a fraction of its square.
 *
 * A piece that reaches the edge touches its neighbour on a crowded board. No
 * set reaches this — Merida is the widest at 0.931 — but the scale is clamped
 * against it so a future set cannot ship over the line.
 */
export const PIECE_INK_MAX_WIDTH = 0.94;

/** The sets a user can choose. Ordered by how conventional they look. */
export const PIECE_SETS: readonly PieceSetDefinition[] = [
  {
    kind: 'vector',
    id: 'cburnett',
    name: 'Cburnett',
    description: 'The Staunton set from Wikipedia. What most players picture as “a chess piece”.',
    directory: '/piece/cburnett',
    visualScale: 1.072,
    attribution: {
      author: 'Colin M.L. Burnett',
      license: 'GPL-2.0-or-later',
      licenseUrl: 'https://www.gnu.org/licenses/gpl-2.0.txt',
      source: 'https://en.wikipedia.org/wiki/User:Cburnett/GFDL_images/Chess',
    },
  },
  {
    kind: 'vector',
    id: 'merida',
    name: 'Merida',
    description: 'Heavier tournament Staunton with deeper carving. Reads well on wood.',
    directory: '/piece/merida',
    visualScale: 1.009,
    attribution: {
      author: 'Armando Hernandez Marroquin',
      license: 'GPL-2.0-or-later',
      licenseUrl: 'https://www.gnu.org/licenses/gpl-2.0.txt',
      source: 'https://github.com/lichess-org/lila/tree/master/public/piece/merida',
    },
  },
  {
    kind: 'vector',
    id: 'chessnut',
    name: 'Chessnut',
    description: 'Modern Staunton with clean edges and generous interior space.',
    directory: '/piece/chessnut',
    visualScale: 1.089,
    attribution: {
      author: 'Alexis Luengas',
      license: 'Apache-2.0',
      licenseUrl: 'https://github.com/LexLuengas/chessnut-pieces/blob/master/LICENSE.txt',
      source: 'https://github.com/LexLuengas/chessnut-pieces',
    },
  },
  {
    kind: 'vector',
    id: 'fantasy',
    name: 'Fantasy',
    description: 'Softly shaded and elegant. The most decorative set here.',
    directory: '/piece/fantasy',
    visualScale: 0.956,
    attribution: {
      author: 'Maurizio Monge',
      license: 'MIT',
      licenseUrl: 'https://github.com/maurimo/chess-art/blob/main/LICENSE',
      source: 'https://github.com/maurimo/chess-art',
    },
  },
  {
    kind: 'vector',
    id: 'spatial',
    name: 'Spatial',
    description: 'Flat, geometric and very high contrast. Calm in crowded positions.',
    directory: '/piece/spatial',
    visualScale: 0.922,
    attribution: {
      author: 'Maurizio Monge',
      license: 'MIT',
      licenseUrl: 'https://github.com/maurimo/chess-art/blob/main/LICENSE',
      source: 'https://github.com/maurimo/chess-art',
    },
  },
  {
    kind: 'vector',
    id: 'celtic',
    name: 'Celtic',
    description: 'Knotwork Staunton, heavier in the base. Distinctive without being fussy.',
    directory: '/piece/celtic',
    visualScale: 0.92,
    attribution: {
      author: 'Maurizio Monge',
      license: 'MIT',
      licenseUrl: 'https://github.com/maurimo/chess-art/blob/main/LICENSE',
      source: 'https://github.com/maurimo/chess-art',
    },
  },
  {
    kind: 'vector',
    id: 'rhosgfx',
    name: 'RhosGFX',
    description: 'Warm, softly modelled Staunton. Reads unusually well at small sizes.',
    directory: '/piece/rhosgfx',
    visualScale: 0.983,
    attribution: {
      author: 'RhosGFX',
      license: 'CC0-1.0',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      source: 'https://rhosgfx.itch.io/',
    },
  },
  {
    kind: 'vector',
    id: 'kiwen-suwi',
    name: 'Kiwen Suwi',
    description: 'Clean line-art with no shading at all. The most legible set on a busy board.',
    directory: '/piece/kiwen-suwi',
    visualScale: 1.012,
    attribution: {
      author: 'neverRare',
      license: 'CC-BY-4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      source: 'https://github.com/neverRare/kiwen-suwi',
    },
  },
  {
    kind: 'vector',
    id: 'firi',
    name: 'Firi',
    description: 'Gently gradient-shaded, with tall silhouettes. Elegant on a light board.',
    directory: '/piece/firi',
    visualScale: 1.055,
    attribution: {
      author: 'James Faure',
      license: 'CC-BY-4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      source: 'https://github.com/jfaure/Firi-pieceset',
    },
  },
  {
    kind: 'vector',
    id: 'mpchess',
    name: 'MPChess',
    description: 'Crisp outlined Staunton drawn for print. Very even weight across the set.',
    directory: '/piece/mpchess',
    visualScale: 1.065,
    attribution: {
      author: 'Maxime Chupin',
      license: 'GPL-3.0-or-later',
      licenseUrl: 'https://www.gnu.org/licenses/gpl-3.0.html',
      source: 'https://github.com/chupinmaxime/mpchess',
    },
  },
];

/**
 * Retained so an older stored preference still renders. Not offered anywhere.
 *
 * `staunton` doubles as the recovery set: it needs no network request and no
 * files on disk, so it is what a board falls back to if artwork cannot load.
 */
export const LEGACY_PIECE_SETS: readonly PieceSetDefinition[] = [
  {
    kind: 'geometry',
    id: 'staunton',
    name: 'Built-in fallback',
    description: 'Drawn from path data. Used only when artwork cannot be loaded.',
    family: 'staunton',
    style: { whiteOutline: 2, blackOutline: 1.25, detail: true, detailOpacity: 0.66, shade: true },
    visualScale: 0.94,
  },
  {
    kind: 'geometry',
    id: 'classic',
    name: 'Built-in fallback (classic)',
    description: 'Legacy geometry retained for stored preferences.',
    family: 'staunton',
    style: { whiteOutline: 3.1, blackOutline: 2.3, detail: true, detailOpacity: 0.82, shade: true },
    visualScale: 0.94,
  },
  {
    kind: 'geometry',
    id: 'tournament',
    name: 'Built-in fallback (flat)',
    description: 'Legacy geometry retained for stored preferences.',
    family: 'staunton',
    style: { whiteOutline: 1.6, blackOutline: 0.9, detail: false },
    visualScale: 0.94,
  },
  {
    kind: 'geometry',
    id: 'line',
    name: 'Built-in fallback (line)',
    description: 'Legacy geometry retained for stored preferences.',
    family: 'staunton',
    style: {
      whiteOutline: 2.9,
      blackOutline: 2.7,
      fillOpacity: 0.72,
      detail: true,
      detailOpacity: 0.86,
    },
    visualScale: 0.94,
  },
  {
    kind: 'geometry',
    id: 'minimal',
    name: 'Built-in fallback (minimal)',
    description: 'Legacy geometry retained for stored preferences.',
    family: 'minimal',
    style: { whiteOutline: 2.2, blackOutline: 1.6, detail: true, detailOpacity: 0.7 },
    visualScale: 0.94,
  },
  {
    kind: 'geometry',
    id: 'contrast',
    name: 'Built-in fallback (contrast)',
    description: 'Legacy geometry retained for stored preferences.',
    family: 'staunton',
    style: { whiteOutline: 4, blackOutline: 3.4, detail: false },
    visualScale: 0.94,
  },
];

/** The set a board falls back to when nothing else resolves. */
export const FALLBACK_PIECE_SET = LEGACY_PIECE_SETS[0] as PieceSetDefinition;

export { DEFAULT_PIECE_SET_ID, LEGACY_PIECE_SET_IDS } from '@/lib/board-options';

const BY_ID = new Map<PieceSetId, PieceSetDefinition>(
  [...PIECE_SETS, ...LEGACY_PIECE_SETS].map((set) => [set.id, set]),
);

export const pieceSet = (id: PieceSetId): PieceSetDefinition =>
  BY_ID.get(id) ?? (PIECE_SETS[0] as PieceSetDefinition);

/** Every vendored set's attribution, for the settings screen and the manifest. */
export const PIECE_ATTRIBUTIONS: readonly (AssetAttribution & { readonly name: string })[] =
  PIECE_SETS.filter((set): set is VectorPieceSet => set.kind === 'vector').map((set) => ({
    name: set.name,
    ...set.attribution,
  }));

const FILE_NAME: Record<PieceType, string> = {
  k: 'K',
  q: 'Q',
  r: 'R',
  b: 'B',
  n: 'N',
  p: 'P',
};

/** Where one piece's artwork lives, e.g. `/piece/cburnett/wN.svg`. */
export const pieceAssetUrl = (set: VectorPieceSet, piece: Piece): string =>
  `${set.directory}/${piece.color}${FILE_NAME[piece.type]}.svg`;

export interface PieceIconProps {
  readonly piece: Piece;
  readonly set: PieceSetId;
  readonly className?: string;
  /** Suppress the accessible name where a parent already labels the square. */
  readonly decorative?: boolean;
}

export function PieceIcon({ piece, set, className, decorative }: PieceIconProps) {
  const definition = pieceSet(set);
  const label = pieceLabel(piece);
  /*
    The calibration is a property of the artwork, so it is applied here rather
    than by each surface that draws a piece: the board, the mini board, the
    promotion picker and the settings preview all get the same proportions
    without any of them knowing which set is selected. A transform rather than
    a width, because the element's box is the piece's tile — scaling the box
    would move the drag target, and the brief for this work is explicitly that
    only the artwork changes size.
  */
  const scale = definition.visualScale === 1 ? undefined : `scale(${definition.visualScale})`;

  if (definition.kind === 'vector') {
    return (
      /*
        A plain <img>, not next/image: these are a few hundred bytes of SVG
        served from our own origin, so there is nothing to optimise and an
        optimiser in front of them would only add a request and a layout shift.
        `draggable={false}` matters — the board implements its own dragging, and
        the browser's native image drag would fight it.
      */
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={pieceAssetUrl(definition, piece)}
        alt={decorative ? '' : label}
        {...(decorative ? { 'aria-hidden': true } : {})}
        className={className}
        style={scale ? { transform: scale } : undefined}
        draggable={false}
      />
    );
  }

  return (
    <GeometryPiece
      piece={piece}
      definition={definition}
      className={className}
      label={decorative ? null : label}
    />
  );
}

function GeometryPiece({
  piece,
  definition,
  className,
  label,
}: {
  readonly piece: Piece;
  readonly definition: GeometryPieceSet;
  readonly className?: string;
  readonly label: string | null;
}) {
  const geometry = GEOMETRY_FAMILIES[definition.family][piece.type];
  const { style } = definition;
  const scale = definition.visualScale === 1 ? undefined : `scale(${definition.visualScale})`;

  const white = piece.color === 'w';
  const body = white ? 'var(--piece-light)' : 'var(--piece-dark)';
  const contrast = white ? 'var(--piece-dark)' : 'var(--piece-light)';

  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      style={scale ? { transform: scale } : undefined}
      {...(label === null ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label })}
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
