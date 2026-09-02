'use client';

/**
 * One self-analysis session: what is hidden, what has been answered, and when
 * the player chose to look.
 *
 * The state machine is three states and one irreversible transition:
 *
 *   idle ──start──► answering ──reveal──► revealed
 *                       ▲                     │
 *                       └──── next position ──┘
 *
 * `revealed` is per position, not per session, because a review is a walk
 * through a game: revealing move 24 must not reveal move 31 in advance. And
 * the reveal is one-way for a position — there is no "hide again", because a
 * player who has seen the engine cannot un-see it, and a control that pretended
 * otherwise would invite exactly the self-deception this workflow exists to
 * prevent.
 *
 * The draft answers live here rather than in the record so that a half-written
 * candidate list costs nothing and disappears when abandoned. Only submission
 * writes a `DecisionRecord`.
 */

import { create } from 'zustand';

import type { San, Uci } from '@/chess/types';
import type { DecisionCandidate, DecisionConfidence, EvaluationBandId } from '@/persistence/domain';

export interface DraftAnswers {
  readonly candidates: readonly DecisionCandidate[];
  readonly chosenUci?: Uci;
  readonly chosenSan?: San;
  readonly band?: EvaluationBandId;
  /** Kept as the string the player typed, so a half-typed "-" is not a 0. */
  readonly pawns: string;
  readonly plan: string;
  readonly calculationNotes: string;
  readonly confidence?: DecisionConfidence;
}

export const EMPTY_ANSWERS: DraftAnswers = {
  candidates: [],
  pawns: '',
  plan: '',
  calculationNotes: '',
};

interface ReviewSessionState {
  /** Whether evidence is hidden at all. Off means Review behaves like Analysis. */
  readonly selfAnalysis: boolean;
  /** Position keys whose evidence the player has chosen to see. */
  readonly revealed: readonly string[];
  /** Decision ids already written this session, by position key. */
  readonly submitted: Readonly<Record<string, string>>;
  readonly answers: DraftAnswers;
  /** The move the board is currently offering to add as a candidate. */
  readonly pendingCandidate: DecisionCandidate | null;

  setSelfAnalysis(on: boolean): void;
  reveal(positionKey: string): void;
  isRevealed(positionKey: string): boolean;
  markSubmitted(positionKey: string, decisionId: string): void;
  setAnswers(change: Partial<DraftAnswers>): void;
  addCandidate(candidate: DecisionCandidate): void;
  updateCandidate(uci: Uci, change: Partial<DecisionCandidate>): void;
  removeCandidate(uci: Uci): void;
  setChosen(uci: Uci | undefined, san?: San): void;
  setPendingCandidate(candidate: DecisionCandidate | null): void;
  resetAnswers(): void;
}

export const useReviewSession = create<ReviewSessionState>((set, get) => ({
  // On by default: a review workspace whose evidence is visible until you turn
  // something off is just Analysis with a different name.
  selfAnalysis: true,
  revealed: [],
  submitted: {},
  answers: EMPTY_ANSWERS,
  pendingCandidate: null,

  setSelfAnalysis: (selfAnalysis) => set({ selfAnalysis }),

  reveal: (positionKey) =>
    set((state) =>
      state.revealed.includes(positionKey) ? state : { revealed: [...state.revealed, positionKey] },
    ),

  isRevealed: (positionKey) => {
    const state = get();
    return !state.selfAnalysis || state.revealed.includes(positionKey);
  },

  markSubmitted: (positionKey, decisionId) =>
    set((state) => ({ submitted: { ...state.submitted, [positionKey]: decisionId } })),

  setAnswers: (change) => set((state) => ({ answers: { ...state.answers, ...change } })),

  addCandidate: (candidate) =>
    set((state) => {
      // A candidate list is a set of moves: entering the same move twice is
      // the player being thorough, not two different ideas.
      if (state.answers.candidates.some((entry) => entry.uci === candidate.uci)) return state;
      return {
        answers: { ...state.answers, candidates: [...state.answers.candidates, candidate] },
        pendingCandidate: null,
      };
    }),

  updateCandidate: (uci, change) =>
    set((state) => ({
      answers: {
        ...state.answers,
        candidates: state.answers.candidates.map((entry) =>
          entry.uci === uci ? { ...entry, ...change } : entry,
        ),
      },
    })),

  removeCandidate: (uci) =>
    set((state) => ({
      answers: {
        ...state.answers,
        candidates: state.answers.candidates.filter((entry) => entry.uci !== uci),
        // Removing the move you chose leaves no choice, rather than a choice
        // that points at nothing.
        ...(state.answers.chosenUci === uci ? { chosenUci: undefined, chosenSan: undefined } : {}),
      },
    })),

  setChosen: (uci, san) =>
    set((state) => ({ answers: { ...state.answers, chosenUci: uci, chosenSan: san } })),

  setPendingCandidate: (pendingCandidate) => set({ pendingCandidate }),

  resetAnswers: () => set({ answers: EMPTY_ANSWERS, pendingCandidate: null }),
}));

/** Whether there is enough here to be worth storing. */
export function hasAnswers(answers: DraftAnswers): boolean {
  return (
    answers.candidates.length > 0 ||
    answers.chosenUci !== undefined ||
    answers.band !== undefined ||
    answers.plan.trim().length > 0 ||
    answers.calculationNotes.trim().length > 0
  );
}

/**
 * The estimate, if the player gave one.
 *
 * A number without a band is not an estimate this application will store: the
 * band is the part that can be compared over months, and inventing one from a
 * number would be inventing an opinion the player did not express.
 */
export function draftEstimate(
  answers: DraftAnswers,
): { readonly band: EvaluationBandId; readonly pawns?: number } | undefined {
  if (!answers.band) return undefined;
  const pawns = Number.parseFloat(answers.pawns.replace(',', '.'));
  return Number.isFinite(pawns) ? { band: answers.band, pawns } : { band: answers.band };
}
