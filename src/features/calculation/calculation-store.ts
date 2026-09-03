'use client';

/**
 * One calculation session.
 *
 * The same shape as a review session — hidden, then answered, then revealed —
 * but for a position the player is calculating *now* rather than one they
 * played last week. The difference that matters is what gets recorded: review
 * captures a judgement, calculation captures a search, so the tree is the
 * primary artefact and the candidate list falls out of it.
 *
 * Blindfold lives here too, because it is part of the same idea: the workspace
 * decides how much the player is allowed to see, and hiding the pieces is only
 * a stronger version of hiding the engine.
 */

import { create } from 'zustand';

import type { San, Uci } from '@/chess/types';
import type { EvaluationBandId, EvaluationEstimate } from '@/persistence/domain';
import {
  addMove,
  annotate,
  EMPTY_TREE,
  goTo,
  removeBranch,
  stepBack,
  type CalculationPath,
  type CalculationTree,
} from './tree';

/**
 * How much of the position is visible.
 *
 * Not a gimmick: visualisation is trained by removing information in
 * controlled amounts, and the three steps are the ones players actually use.
 * `pieces-hidden` keeps the board and coordinates so a move can still be
 * entered by square; `blank` removes everything but the frame.
 */
export type BoardVisibility = 'full' | 'pieces-hidden' | 'blank';

export const VISIBILITY_LABEL: Record<BoardVisibility, string> = {
  full: 'Board visible',
  'pieces-hidden': 'Pieces hidden',
  blank: 'Blank board',
};

interface CalculationState {
  /** The position being calculated, or null when no session is running. */
  readonly fen: string | null;
  readonly positionKey: string | null;
  readonly startedAt: number | null;
  readonly revealed: boolean;
  readonly tree: CalculationTree;
  readonly chosenUci?: Uci;
  readonly chosenSan?: San;
  readonly band?: EvaluationBandId;
  /** The raw string, so a half-typed "-" is not read as zero. */
  readonly pawns: string;
  readonly notes: string;
  readonly visibility: BoardVisibility;
  /** Whether the move list is hidden as well as the pieces. */
  readonly hideMoves: boolean;

  start(fen: string, positionKey: string, now?: number): void;
  stop(): void;
  reveal(): void;
  play(move: { uci: Uci; san: San }): void;
  navigate(path: CalculationPath): void;
  back(): void;
  remove(id: string): void;
  annotateBranch(id: string, change: { note?: string; estimate?: EvaluationEstimate }): void;
  choose(uci: Uci | undefined, san?: San): void;
  setBand(band: EvaluationBandId | undefined): void;
  setPawns(pawns: string): void;
  setNotes(notes: string): void;
  setVisibility(visibility: BoardVisibility): void;
  setHideMoves(hide: boolean): void;
}

export const useCalculation = create<CalculationState>((set) => ({
  fen: null,
  positionKey: null,
  startedAt: null,
  revealed: false,
  tree: EMPTY_TREE,
  pawns: '',
  notes: '',
  visibility: 'full',
  hideMoves: false,

  start: (fen, positionKey, now = Date.now()) =>
    set({
      fen,
      positionKey,
      startedAt: now,
      revealed: false,
      tree: EMPTY_TREE,
      chosenUci: undefined,
      chosenSan: undefined,
      band: undefined,
      pawns: '',
      notes: '',
      // A new session always starts visible. Inheriting a blindfold from the
      // last session is the kind of surprise that makes a feature feel broken.
      visibility: 'full',
      hideMoves: false,
    }),

  stop: () => set({ fen: null, positionKey: null, startedAt: null, revealed: false }),

  // One-way, like the review reveal: a player who has seen the engine cannot
  // un-see it, and a "hide again" control would invite self-deception.
  reveal: () => set({ revealed: true, visibility: 'full', hideMoves: false }),

  play: (move) => set((state) => ({ tree: addMove(state.tree, move) })),
  navigate: (path) => set((state) => ({ tree: goTo(state.tree, path) })),
  back: () => set((state) => ({ tree: stepBack(state.tree) })),
  remove: (id) => set((state) => ({ tree: removeBranch(state.tree, id) })),
  annotateBranch: (id, change) => set((state) => ({ tree: annotate(state.tree, id, change) })),

  choose: (chosenUci, chosenSan) => set({ chosenUci, chosenSan }),
  setBand: (band) => set({ band }),
  setPawns: (pawns) => set({ pawns }),
  setNotes: (notes) => set({ notes }),
  setVisibility: (visibility) => set({ visibility }),
  setHideMoves: (hideMoves) => set({ hideMoves }),
}));

/** The estimate, if the player gave one. A number alone is not an estimate. */
export function calculationEstimate(state: {
  band?: EvaluationBandId;
  pawns: string;
}): EvaluationEstimate | undefined {
  if (!state.band) return undefined;
  const pawns = Number.parseFloat(state.pawns.replace(',', '.'));
  return Number.isFinite(pawns) ? { band: state.band, pawns } : { band: state.band };
}

/** Whether there is enough here to be worth storing as a decision. */
export function hasCalculation(state: {
  tree: CalculationTree;
  band?: EvaluationBandId;
  notes: string;
  chosenUci?: Uci;
}): boolean {
  return (
    state.tree.branches.length > 0 ||
    state.band !== undefined ||
    state.chosenUci !== undefined ||
    state.notes.trim().length > 0
  );
}
