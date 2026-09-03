'use client';

import { create } from 'zustand';

import type { Color, Fen, San } from '@/chess/types';
import type { TablebaseCategory } from '@/tablebase/types';

import {
  describeChange,
  endingFor,
  outcomeFor,
  type ConversionEnding,
  type ConversionOutcome,
  type OpponentStrength,
  type ResultChange,
} from './conversion';

export interface ConversionPly {
  readonly san: San;
  readonly by: Color;
  readonly outcome: ConversionOutcome;
  /** Set only where the result actually moved; see `describeChange`. */
  readonly change: ResultChange | null;
}

interface ConversionState {
  /** Null when no session is running. */
  fen: Fen | null;
  startFen: Fen | null;
  /** The side the player is converting for. */
  side: Color;
  strength: OpponentStrength;
  startingOutcome: ConversionOutcome | null;
  currentOutcome: ConversionOutcome | null;
  history: readonly ConversionPly[];
  ending: ConversionEnding | null;
  /** The engine is choosing its reply. */
  thinking: boolean;
  title: string;

  start(input: {
    fen: Fen;
    side: Color;
    strength: OpponentStrength;
    title: string;
    category: TablebaseCategory;
    sideToMove: Color;
  }): void;
  /** Record a played move and the tablebase's verdict on the position after it. */
  record(input: {
    fen: Fen;
    san: San;
    by: Color;
    category: TablebaseCategory;
    sideToMove: Color;
    halfmoveClock: number;
  }): void;
  setThinking(value: boolean): void;
  stop(): void;
}

/**
 * A refereed conversion session.
 *
 * Separate from the analysis store on purpose: playing an endgame out is a
 * game, not an analysis tree, and putting twenty forced king moves into the
 * user's variation tree would bury the study they were working on. The
 * session owns its own position and is thrown away when it ends.
 */
export const useConversion = create<ConversionState>()((set, get) => ({
  fen: null,
  startFen: null,
  side: 'w',
  strength: 'strong',
  startingOutcome: null,
  currentOutcome: null,
  history: [],
  ending: null,
  thinking: false,
  title: '',

  start: ({ fen, side, strength, title, category, sideToMove }) => {
    const outcome = outcomeFor(category, sideToMove, side);
    set({
      fen,
      startFen: fen,
      side,
      strength,
      title,
      startingOutcome: outcome,
      currentOutcome: outcome,
      history: [],
      ending: null,
      thinking: false,
    });
  },

  record: ({ fen, san, by, category, sideToMove, halfmoveClock }) => {
    const state = get();
    if (state.startingOutcome === null) return;
    const before = state.currentOutcome ?? state.startingOutcome;
    const after = outcomeFor(category, sideToMove, state.side);
    const ending = endingFor({
      category,
      sideToMove,
      perspective: state.side,
      startingOutcome: state.startingOutcome,
      halfmoveClock,
    });
    set({
      fen,
      currentOutcome: after,
      history: [
        ...state.history,
        { san, by, outcome: after, change: describeChange(before, after) },
      ],
      ending,
    });
  },

  setThinking: (thinking) => set({ thinking }),

  stop: () =>
    set({
      fen: null,
      startFen: null,
      startingOutcome: null,
      currentOutcome: null,
      history: [],
      ending: null,
      thinking: false,
    }),
}));
