/**
 * The opponent the Preparation route has loaded, for the sparring partner.
 *
 * The route builds the opening tree from the games the user selected; the
 * dock panel that plays from it is rendered by the tool dock without props.
 * One small store carries the tree across, and nothing else: the panel does
 * not re-query games, so the partner plays from exactly the set on screen —
 * the same filters, the same sources, the same counts.
 */

import { create } from 'zustand';

import type { OpeningTree } from '@/preparation';

export interface SparringOpponent {
  readonly name: string;
  readonly tree: OpeningTree;
  /** Games behind the tree, for the panel's own sentence about the evidence. */
  readonly games: number;
  readonly sources: readonly { readonly name: string; readonly games: number }[];
}

interface SparringState {
  readonly opponent: SparringOpponent | null;
  readonly setOpponent: (opponent: SparringOpponent | null) => void;
}

export const useSparringOpponent = create<SparringState>((set) => ({
  opponent: null,
  setOpponent: (opponent) => set({ opponent }),
}));
