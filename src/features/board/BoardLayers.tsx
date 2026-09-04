'use client';

/**
 * The two layers every Kingfisher board is made of.
 *
 * There used to be two implementations of "eight by eight squares with pieces
 * on them": the interactive board, and a miniature one for previews and
 * thumbnails. They drifted, and the drift was not cosmetic — the miniature
 * laid pieces out *inside* grid cells with no explicit row track, so the rows
 * sized themselves to the pieces' intrinsic height and the grid overflowed its
 * own square box. At 120px the Settings preview was 8 columns of 14.8px and 8
 * rows of 18.4px: the bottom two ranks were clipped away entirely.
 *
 * So the geometry lives here, once. Squares are a grid with *both* tracks
 * declared; pieces are an absolutely positioned layer of 12.5% tiles placed by
 * percentage offset. The interactive board adds highlights, coordinates, drag
 * and annotations on top of these; the preview adds nothing. Neither computes
 * a square's position for itself.
 */

import type { CSSProperties, ReactNode } from 'react';

import { squareColor } from '@/chess/board';
import type { Color, Piece, Square } from '@/chess/types';
import { cn } from '@/lib/cn';

import { squareOffset } from './layout';
import { PieceIcon } from './pieces';

/**
 * Both grid tracks, explicitly.
 *
 * `grid-rows-8` is the half that was missing. Without it the row tracks are
 * `auto`, and a square container full of intrinsically-sized content is no
 * longer square.
 */
export const SQUARE_GRID_CLASS = 'grid grid-cols-8 grid-rows-8 overflow-hidden';

/** The background of one square, in whichever theme is in force. */
export const squareStyle = (square: Square): CSSProperties => {
  const light = squareColor(square) === 'light';
  return {
    // Grain over colour. Wood themes set the pattern; flat ones resolve it to
    // `none` and the square is a plain fill.
    backgroundColor: light ? 'var(--square-light)' : 'var(--square-dark)',
    backgroundImage: light ? 'var(--square-grain-light)' : 'var(--square-grain-dark)',
  };
};

export interface PlacedPieceView {
  readonly key: string;
  readonly piece: Piece;
  readonly square: Square;
}

/**
 * The pieces, above the squares and below the annotations.
 *
 * Each piece is a 12.5% tile translated into place, which is what makes a move
 * animatable and what keeps a piece exactly one square wide however the board
 * is sized. `render` exists for the interactive board, which needs to give the
 * piece being dragged a different transform and a shadow.
 */
export function PieceLayer({
  pieces,
  orientation,
  pieceSet,
  className,
  render,
}: {
  readonly pieces: readonly PlacedPieceView[];
  readonly orientation: Color;
  readonly pieceSet: string;
  readonly className?: string;
  readonly render?: (placed: PlacedPieceView) => {
    readonly style: CSSProperties;
    readonly zIndex: number;
    readonly pieceClassName?: string;
  };
}) {
  return (
    <div className={cn('pointer-events-none absolute inset-0', className)} aria-hidden>
      {pieces.map((placed) => {
        const custom = render?.(placed);
        const offset = squareOffset(placed.square, orientation);
        const style: CSSProperties = custom?.style ?? {
          transform: `translate(${offset.x}%, ${offset.y}%)`,
        };
        return (
          <div
            key={placed.key}
            className="absolute left-0 top-0 h-[12.5%] w-[12.5%]"
            style={{ ...style, zIndex: custom?.zIndex ?? 10 }}
          >
            <PieceIcon
              piece={placed.piece}
              set={pieceSet as never}
              className={cn('h-full w-full p-[6%]', custom?.pieceClassName)}
            />
          </div>
        );
      })}
    </div>
  );
}

/** The square grid, with whatever each cell needs drawn inside it. */
export function SquareLayer({
  squares,
  className,
  cell,
  ...rest
}: {
  readonly squares: readonly Square[];
  readonly className?: string;
  readonly cell?: (square: Square, index: number) => ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'className' | 'children'>) {
  return (
    <div className={cn(SQUARE_GRID_CLASS, className)} {...rest}>
      {squares.map((square, index) => (
        <div key={square} className="relative" style={squareStyle(square)}>
          {cell?.(square, index)}
        </div>
      ))}
    </div>
  );
}
