'use client';

/**
 * A board that only shows a position.
 *
 * Not a second implementation of a chessboard: it renders the same
 * `SquareLayer` and `PieceLayer` as the interactive board, and differs only in
 * what it leaves out — drag state, promotion pickers, annotation pointer
 * handling, animation and coordinates. Mounting the real board dozens of times
 * in a game list would be expensive for no benefit; mounting a *different*
 * board was worse, because the two drifted and the Settings preview ended up
 * clipping its own bottom two ranks.
 */

import { useMemo } from 'react';

import { boardSquares, squareAt } from '@/chess/board';
import { parseFen } from '@/chess/fen';
import type { Color, Fen } from '@/chess/types';
import { boardTheme, boardThemeVariables } from '@/features/board/themes';
import type { BoardThemeId, PieceSetId } from '@/lib/board-options';
import { cn } from '@/lib/cn';

import { PieceLayer, SquareLayer, type PlacedPieceView } from './BoardLayers';

interface MiniBoardProps {
  readonly fen: Fen | string;
  readonly orientation?: Color;
  readonly theme: BoardThemeId;
  readonly pieceSet: PieceSetId;
  readonly className?: string;
  /** Marks the element for tests that need to find one particular board. */
  readonly testId?: string;
}

export function MiniBoard({
  fen,
  orientation = 'w',
  theme,
  pieceSet,
  className,
  testId,
}: MiniBoardProps) {
  const squares = useMemo(() => boardSquares(orientation), [orientation]);
  const pieces = useMemo<readonly PlacedPieceView[]>(() => {
    const parsed = parseFen(fen);
    if (!parsed.ok) return [];
    const placed: PlacedPieceView[] = [];
    for (let index = 0; index < 64; index += 1) {
      const piece = parsed.value.board[index];
      if (!piece) continue;
      const square = squareAt(index);
      placed.push({ key: square, piece, square });
    }
    return placed;
  }, [fen]);

  return (
    <div
      style={boardThemeVariables(boardTheme(theme))}
      className={cn(
        'relative aspect-square w-full overflow-hidden rounded-[3px] border border-line-subtle',
        className,
      )}
      aria-hidden
      data-mini-board={testId ?? ''}
    >
      <SquareLayer squares={squares} className="absolute inset-0" />
      <PieceLayer pieces={pieces} orientation={orientation} pieceSet={pieceSet} />
    </div>
  );
}
