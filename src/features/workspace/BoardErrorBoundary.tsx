'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

import { DEFAULT_PIECE_SET_ID } from '@/lib/board-options';
import type { BoardThemeId, PieceSetId } from '@/lib/board-options';

/** The theme and set that are always present, whatever a preference names. */
export const SAFE_BOARD_THEME: BoardThemeId = 'slate';
export const SAFE_PIECE_SET: PieceSetId = DEFAULT_PIECE_SET_ID;

interface Props {
  readonly children: (fallback: {
    readonly theme: BoardThemeId | null;
    readonly pieceSet: PieceSetId | null;
  }) => ReactNode;
  readonly onFallback?: (message: string) => void;
}

interface State {
  readonly failed: boolean;
  readonly message: string | null;
}

/**
 * A board that fails to render falls back rather than taking the route down.
 *
 * The board is the one component every chess route depends on, and it draws
 * user-chosen artwork: a piece set whose renderer throws, or a theme id that
 * survived a migration it should not have, would otherwise blank the whole
 * screen and leave an in-memory analysis unrecoverable. Retrying once with the
 * stock set and theme distinguishes "this artwork is broken" from "the board
 * is broken", and the diagnostic says which.
 *
 * Only one retry. If the plain board fails too, the problem is not the
 * artwork, and re-rendering forever would be a loop instead of a message.
 */
export class BoardErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false, message: null };

  static getDerivedStateFromError(error: Error): State {
    return { failed: true, message: error.message };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[board] ${error.message}`, info.componentStack);
    this.props.onFallback?.(error.message);
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children({ theme: null, pieceSet: null });

    return (
      <div className="flex h-full flex-col">
        <p
          role="status"
          className="shrink-0 border-b border-line-subtle bg-surface-2 px-2 py-1 text-2xs text-tertiary"
        >
          The chosen board artwork could not be drawn, so the standard set is in use. Settings →
          Board to pick another.
        </p>
        <div className="min-h-0 flex-1">
          {this.props.children({ theme: SAFE_BOARD_THEME, pieceSet: SAFE_PIECE_SET })}
        </div>
      </div>
    );
  }
}
