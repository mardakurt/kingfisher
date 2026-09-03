'use client';

/**
 * A board thumbnail at a fixed size, in the user's own board and piece style.
 *
 * Two things it exists to get right. `MiniBoard` takes theme and piece set as
 * required props so Settings can preview a theme that is not yet applied;
 * every other caller wants the current appearance, and repeating that lookup
 * at each call site is how one of them ends up on the default theme.
 *
 * And it sizes through a wrapper rather than by passing a width class down.
 * `cn` is deliberately additive (see `lib/cn.ts`), so a `w-16` handed to
 * `MiniBoard` does not override its own `w-full` — it just sits beside it and
 * loses. The container is the only place a size can be stated safely.
 */

import { MiniBoard } from '@/features/board/MiniBoard';
import { usePreferences } from '@/stores/preferences-store';
import type { Color, Fen } from '@/chess/types';
import { cn } from '@/lib/cn';

export function SheetBoard({
  fen,
  orientation,
  className = 'w-16',
}: {
  readonly fen: Fen | string;
  readonly orientation?: Color;
  /** Sizing for the *container*, e.g. `w-16`. */
  readonly className?: string;
}) {
  const boardTheme = usePreferences((state) => state.boardTheme);
  const pieceSet = usePreferences((state) => state.pieceSet);
  return (
    <div className={cn('shrink-0', className)}>
      <MiniBoard
        fen={fen}
        {...(orientation ? { orientation } : {})}
        theme={boardTheme}
        pieceSet={pieceSet}
      />
    </div>
  );
}
