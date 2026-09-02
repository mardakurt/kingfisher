'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

import type { Color, Fen } from '@/chess/types';
import type { GameTree, NodeId } from '@/chess/tree/types';
import type { AnalysisDocument } from '@/persistence/types';
import { selectFen, useAnalysis } from '@/stores/analysis-store';

/**
 * How a board surface behaves. Declared by the surface that renders it, not
 * inferred here: the same document is editable in Analysis and frozen in a
 * preview card, so this is a property of the surface rather than of the
 * workspace. An earlier version guessed the mode from the route and the
 * document kind, which made a game opened from Games read-only in Analysis
 * and quietly removed the ability to add a variation to your own game.
 */
export type BoardSurfaceMode = 'interactive' | 'read-only' | 'preview' | 'training';

export interface ChessWorkspaceContextValue {
  /** The route rendering this workspace, for tools that vary their defaults. */
  readonly route: string;
  readonly tree: GameTree;
  readonly currentId: NodeId;
  readonly fen: Fen;
  readonly orientation: Color;
  readonly document: AnalysisDocument;
}

const ChessWorkspaceContext = createContext<ChessWorkspaceContextValue | null>(null);

/**
 * A read-through context over the existing analysis store.
 *
 * It intentionally owns no chess state: every route sees the same tree,
 * cursor, document and orientation, so moving from a Study to Explorer or
 * Engine never creates a second position that can drift from the board. This
 * is the seam tools read from, not a second game state system.
 */
export function ChessWorkspaceProvider({ children }: { children: ReactNode }) {
  const route = usePathname();
  const tree = useAnalysis((state) => state.tree);
  const currentId = useAnalysis((state) => state.currentId);
  const fen = useAnalysis(selectFen);
  const orientation = useAnalysis((state) => state.orientation);
  const document = useAnalysis((state) => state.document);

  const value = useMemo<ChessWorkspaceContextValue>(
    () => ({ route, tree, currentId, fen, orientation, document }),
    [currentId, document, fen, orientation, route, tree],
  );

  return <ChessWorkspaceContext.Provider value={value}>{children}</ChessWorkspaceContext.Provider>;
}

export function useChessWorkspace(): ChessWorkspaceContextValue {
  const value = useContext(ChessWorkspaceContext);
  if (!value) throw new Error('useChessWorkspace must be used inside ChessWorkspaceProvider.');
  return value;
}
