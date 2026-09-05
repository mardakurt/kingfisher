'use client';

/**
 * The opening name for the position a workspace is on.
 *
 * Classified from the line actually played to reach the current node, not from
 * the node alone: a position that is not itself in the opening table still
 * belongs to whatever the deepest named position before it was, and that is the
 * name a player expects to keep seeing as they play on past move fifteen.
 *
 * The index loads once per session and lazily. Until it has, this reports
 * nothing rather than a placeholder — a board that flashes an opening name it
 * then changes is worse than one that takes a moment to say anything.
 */

import { useEffect, useState } from 'react';

import { positionKey } from '@/chess/fen';
import { nodePath } from '@/chess/tree/tree';
import type { GameTree, NodeId } from '@/chess/tree/types';

import {
  loadOpeningIndex,
  openingIndexIfLoaded,
  type GameClassification,
  type OpeningIndex,
} from './openings';

/** Deepest named position on the path from the root to `nodeId`. */
export function classifyPath(
  index: OpeningIndex,
  tree: GameTree,
  nodeId: NodeId,
): GameClassification | null {
  let best: GameClassification | null = null;
  for (const id of nodePath(tree, nodeId)) {
    const node = tree.nodes[id];
    if (!node) continue;
    const hit = index.lookup(positionKey(node.fen));
    if (hit) best = { ...hit, ply: node.ply, nodeId: id };
  }
  return best;
}

export function useOpeningClassification(
  tree: GameTree,
  nodeId: NodeId,
): GameClassification | null {
  const [index, setIndex] = useState<OpeningIndex | null>(() => openingIndexIfLoaded());

  useEffect(() => {
    if (index) return;
    let live = true;
    void loadOpeningIndex().then(
      (loaded) => {
        if (live) setIndex(loaded);
      },
      () => {
        /*
          A failed chunk load leaves the board without an opening name and
          without an error. Nothing else on the surface depends on it, and a
          toast about a missing opening table would be noise in the middle of
          somebody's analysis.
        */
      },
    );
    return () => {
      live = false;
    };
  }, [index]);

  if (!index) return null;
  return classifyPath(index, tree, nodeId);
}
