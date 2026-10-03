'use client';

/**
 * The Explorer's moves, offered to the board (ChessBase draws the reference
 * moves as arrows beside the statistics).
 *
 * The Explorer writes what it is showing and which row is under the pointer;
 * the board reads it and draws nothing unless the position matches its own,
 * so a slow answer about the previous position never leaves arrows on the
 * new one.
 */

import { create } from 'zustand';

export interface ReferenceMove {
  readonly uci: string;
  readonly san: string;
  /** Share of the source's games at this position, 0–1. */
  readonly share: number;
}

interface ReferenceArrowsState {
  /** The position the moves are about. */
  readonly fen: string | null;
  readonly source: string | null;
  readonly moves: readonly ReferenceMove[];
  readonly hovered: string | null;
  publish(fen: string | null, source: string | null, moves: readonly ReferenceMove[]): void;
  hover(uci: string | null): void;
}

export const useReferenceArrows = create<ReferenceArrowsState>()((set) => ({
  fen: null,
  source: null,
  moves: [],
  hovered: null,
  publish: (fen, source, moves) => set({ fen, source, moves }),
  hover: (uci) => set({ hovered: uci }),
}));
