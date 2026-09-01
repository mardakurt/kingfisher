/**
 * Checking a training answer against what the item actually stores.
 *
 * Pure, and deliberately narrow: it compares an attempt with the answers a
 * human wrote down when they created the item. There is no engine here and no
 * notion of an objectively best move — an item is right about its own position
 * only as far as its author was, and saying so is more useful than pretending
 * a scheduler knows chess.
 *
 * Modes that cannot be checked mechanically say `unchecked` rather than
 * guessing. A plan written in prose is graded by the person who wrote it; the
 * software's job there is to show what they said last time, not to mark it.
 */

import type { EvaluationBand, TrainingItemRecord, TrainingMode } from '@/persistence/domain';
import { EVALUATION_BANDS } from '@/persistence/domain';
import type { Uci } from '@/chess/types';

export type Attempt =
  | { readonly kind: 'moves'; readonly uci: readonly Uci[] }
  | { readonly kind: 'band'; readonly band: EvaluationBand }
  | { readonly kind: 'plan'; readonly text: string };

export type Verdict = 'correct' | 'partial' | 'incorrect' | 'unchecked';

export interface AnswerCheck {
  readonly verdict: Verdict;
  /** Answers the attempt got right. */
  readonly matched: readonly Uci[];
  /** Accepted answers the attempt did not name. */
  readonly missed: readonly Uci[];
  /** Moves offered that the item does not accept. */
  readonly extra: readonly Uci[];
  readonly summary: string;
}

/** How an item's move-based answer is meant to be judged. */
export const isMoveMode = (mode: TrainingMode): boolean =>
  mode === 'repertoire-recall' || mode === 'best-move' || mode === 'candidates';

/** Every move the item accepts, in one list, without duplicates. */
export function acceptedMoves(item: TrainingItemRecord): readonly Uci[] {
  return [...new Set([...item.solutionUci, ...item.candidatesUci])];
}

export function checkAnswer(item: TrainingItemRecord, attempt: Attempt): AnswerCheck {
  if (attempt.kind === 'band') {
    if (!item.expectedBand) {
      return unchecked('This item records no expected evaluation to compare against.');
    }
    const correct = attempt.band === item.expectedBand;
    return {
      verdict: correct ? 'correct' : 'incorrect',
      matched: [],
      missed: [],
      extra: [],
      summary: correct
        ? `Matches the recorded band: ${bandLabel(item.expectedBand)}.`
        : `You answered ${bandLabel(attempt.band)}; the item records ${bandLabel(item.expectedBand)}.`,
    };
  }

  if (attempt.kind === 'plan') {
    return unchecked(
      item.plans.length
        ? 'Compare what you wrote with the recorded plans, then grade yourself.'
        : 'This item records no plan to compare against.',
    );
  }

  const accepted = new Set(acceptedMoves(item));
  if (accepted.size === 0) return unchecked('This item records no accepted move.');

  const offered = [...new Set(attempt.uci)];
  const matched = offered.filter((uci) => accepted.has(uci));
  const extra = offered.filter((uci) => !accepted.has(uci));

  /*
    Candidate-move items ask for a set, so a missing candidate is a partial
    answer rather than a failure. The single-answer modes ask for one move, and
    an item may accept several: naming any one of them is the whole answer, and
    the others are shown afterwards as alternatives rather than as omissions.
  */
  if (item.mode === 'candidates') {
    const missed = [...accepted].filter((uci) => !offered.includes(uci));
    const verdict: Verdict =
      matched.length === 0
        ? 'incorrect'
        : missed.length === 0 && extra.length === 0
          ? 'correct'
          : 'partial';
    return {
      verdict,
      matched,
      missed,
      extra,
      summary: describeCandidates(matched.length, missed.length, extra.length),
    };
  }

  const correct = matched.length > 0 && extra.length === 0;
  return {
    verdict: correct ? 'correct' : 'incorrect',
    matched,
    missed: correct ? [] : [...accepted],
    extra,
    summary: correct
      ? accepted.size > 1
        ? 'Accepted. This item records other acceptable answers too.'
        : 'Accepted.'
      : 'Not one of the recorded answers.',
  };
}

/** Whether a review of this attempt counts as remembered, for the history. */
export const wasCorrect = (check: AnswerCheck, fallback: boolean): boolean =>
  check.verdict === 'unchecked' ? fallback : check.verdict === 'correct';

function describeCandidates(matched: number, missed: number, extra: number): string {
  if (matched === 0) return 'None of the recorded candidates.';
  const parts = [`${matched} recorded candidate${matched === 1 ? '' : 's'} named`];
  if (missed > 0) parts.push(`${missed} missed`);
  if (extra > 0) parts.push(`${extra} not recorded`);
  return `${parts.join(', ')}.`;
}

const bandLabel = (band: EvaluationBand): string =>
  EVALUATION_BANDS.find((entry) => entry.id === band)?.label ?? band;

const unchecked = (summary: string): AnswerCheck => ({
  verdict: 'unchecked',
  matched: [],
  missed: [],
  extra: [],
  summary,
});
