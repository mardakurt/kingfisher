'use client';

import { useCallback } from 'react';

import { usePreferences } from '@/stores/preferences-store';

import { useChessWorkspace } from './ChessWorkspaceContext';
import { unavailableReason, type WorkspaceToolId } from './modules';

/** Pieces on the board, from the FEN's placement field alone. */
export function pieceCount(fen: string): number {
  const placement = fen.split(' ')[0] ?? '';
  let count = 0;
  for (const character of placement) {
    if (/[prnbqkPRNBQK]/.test(character)) count += 1;
  }
  return count;
}

/**
 * Why each tool cannot help at the current position, if it cannot.
 *
 * A hook rather than a value so that the tab strip and the panel body ask the
 * same question and cannot answer it differently — a tab marked unavailable
 * over a panel that renders happily is worse than either alone.
 */
export function useModuleAvailability(): (tool: WorkspaceToolId) => string | null {
  const { fen } = useChessWorkspace();
  const companionUrl = usePreferences((state) => state.companionUrl);

  return useCallback(
    (tool: WorkspaceToolId) =>
      unavailableReason(tool, {
        pieceCount: pieceCount(fen),
        hasCompanion: companionUrl.trim() !== '',
        /*
          Model games and repertoire coverage are answered optimistically here.
          Both need an IndexedDB read, and issuing one per tab on every
          position change to grey out a tab would cost more than it explains —
          those panels state their own emptiness, which is the same message in
          the place the user is already looking.
        */
        hasModelGames: true,
        hasRepertoireEntry: true,
      }),
    [companionUrl, fen],
  );
}
