'use client';

import { useMemo } from 'react';

import { Position } from '@/chess/position';
import type { GameTree, MoveNode, NodeId } from '@/chess/tree/types';
import type { Square } from '@/chess/types';
import { useAnalysis } from '@/stores/analysis-store';

export interface AnalysisPosition {
  readonly node: MoveNode;
  readonly position: Position;
  readonly destinations: ReadonlyMap<Square, readonly Square[]>;
  readonly checkSquare: Square | null;
  readonly tree: GameTree;
  readonly currentId: NodeId;
}

/**
 * Everything the board needs, derived from the store.
 *
 * Deliberately recomputed from the FEN rather than cached in the store:
 * `Position` memoises its own legal moves, and a derived value that lives in
 * state is a value that can disagree with the tree.
 */
export function useAnalysisPosition(): AnalysisPosition {
  const tree = useAnalysis((state) => state.tree);
  const currentId = useAnalysis((state) => state.currentId);

  const node = tree.nodes[currentId] ?? tree.nodes[tree.rootId];
  if (!node) throw new Error('The analysis tree has no root.');

  const fen = node.fen;

  return useMemo(() => {
    const position = Position.fromTrustedFen(fen);
    const destinations = new Map<Square, Square[]>();

    for (const move of position.legalMoves()) {
      const existing = destinations.get(move.from);
      if (existing) {
        if (!existing.includes(move.to)) existing.push(move.to);
      } else {
        destinations.set(move.from, [move.to]);
      }
    }

    const checkSquare = position.isCheck() ? position.kingSquare(position.turn) : null;

    return { node, position, destinations, checkSquare, tree, currentId };
  }, [fen, node, tree, currentId]);
}
