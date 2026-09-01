'use client';

/**
 * A board that only shows a position.
 *
 * The interactive board carries drag state, promotion pickers, annotation
 * pointer handling and animation. A study preview or a game-list thumbnail
 * needs none of that, and mounting the real board dozens of times in a list
 * would be expensive for no benefit, so this renders the squares and pieces
 * and nothing else.
 */

import { parseFen } from '@/chess/fen';
import { FILES, RANKS, type Color, type Fen } from '@/chess/types';
import { boardTheme, boardThemeVariables } from '@/features/board/themes';
import { PieceIcon } from '@/features/board/pieces';
import type { BoardThemeId, PieceSetId } from '@/lib/board-options';
import { cn } from '@/lib/cn';

interface MiniBoardProps {
  readonly fen: Fen | string;
  readonly orientation?: Color;
  readonly theme: BoardThemeId;
  readonly pieceSet: PieceSetId;
  readonly className?: string;
}

export function MiniBoard({ fen, orientation = 'w', theme, pieceSet, className }: MiniBoardProps) {
  const parsed = parseFen(fen);
  const board = parsed.ok ? parsed.value.board : [];

  const ranks = orientation === 'w' ? [...RANKS].reverse() : [...RANKS];
  const files = orientation === 'w' ? FILES : [...FILES].reverse();

  return (
    <div
      style={boardThemeVariables(boardTheme(theme))}
      className={cn(
        'grid aspect-square w-full grid-cols-8 overflow-hidden rounded-[3px] border border-line-subtle',
        className,
      )}
      aria-hidden
    >
      {ranks.map((rank, rankIndex) =>
        files.map((file, fileIndex) => {
          const index = (Number(rank) - 1) * 8 + FILES.indexOf(file);
          const piece = board[index] ?? null;
          const light = (rankIndex + fileIndex) % 2 === 0;
          return (
            <div
              key={`${file}${rank}`}
              className="relative"
              style={{
                // Grain over colour. Wood themes set the pattern; flat ones
                // resolve it to `none` and the square is a plain fill.
                backgroundColor: light ? 'var(--square-light)' : 'var(--square-dark)',
                backgroundImage: light ? 'var(--square-grain-light)' : 'var(--square-grain-dark)',
              }}
            >
              {piece && <PieceIcon piece={piece} set={pieceSet} className="h-full w-full" />}
            </div>
          );
        }),
      )}
    </div>
  );
}
