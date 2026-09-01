'use client';

/**
 * Copying things out of the workspace.
 *
 * Each action is named for exactly what lands on the clipboard. "Copy position"
 * would be ambiguous — a position is a FEN to one player and a diagram to
 * another — so the labels say FEN, PGN, SAN or UCI and the functions match
 * them one for one.
 */

import { useCallback, useMemo } from 'react';

import { serializeMovetext, serializePgn } from '@/chess/pgn';
import { nodePath } from '@/chess/tree/tree';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';

export interface CopyActions {
  pgn(): void;
  fen(): void;
  sanLine(): void;
  uciLine(): void;
}

export function useCopyActions(): CopyActions {
  const notify = useUi((state) => state.notify);

  const write = useCallback(
    async (text: string, what: string) => {
      if (!text) {
        notify({ tone: 'info', message: `There is no ${what} to copy yet.` });
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
        notify({ tone: 'success', message: `${what} copied to the clipboard.` });
      } catch {
        notify({ tone: 'error', message: 'The clipboard is not available in this context.' });
      }
    },
    [notify],
  );

  return useMemo<CopyActions>(
    () => ({
      pgn: () => void write(serializePgn(useAnalysis.getState().tree), 'PGN'),
      fen: () => {
        const { tree, currentId } = useAnalysis.getState();
        void write(tree.nodes[currentId]?.fen ?? '', 'FEN');
      },
      sanLine: () => {
        const { tree, currentId } = useAnalysis.getState();
        void write(serializeMovetext(tree, nodePath(tree, currentId)), 'Line');
      },
      uciLine: () => {
        const { tree, currentId } = useAnalysis.getState();
        const moves = nodePath(tree, currentId)
          .map((id) => tree.nodes[id]?.move?.uci)
          .filter((uci): uci is NonNullable<typeof uci> => Boolean(uci));
        void write(moves.join(' '), 'UCI move sequence');
      },
    }),
    [write],
  );
}
