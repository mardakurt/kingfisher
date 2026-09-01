/**
 * Spaced repetition.
 *
 * An SM-2 derivative, chosen because it is thirty years old, published, and
 * simple enough to explain to a user in two sentences — which matters, because
 * a scheduler nobody understands is a scheduler nobody trusts. See ADR 0011.
 *
 * The one chess-specific departure from textbook SM-2: a lapse does not reset
 * the interval to a single day. Forgetting one move of a repertoire line does
 * not mean forgetting the line, and burying the user under yesterday's failures
 * is how a review queue becomes something they stop opening.
 *
 * Every function takes `now` explicitly. Nothing here reads the clock, so the
 * tests are exact rather than approximately-today.
 */

import type { ReviewGrade, ScheduleState } from '@/persistence/domain';

export const DAY_MS = 24 * 60 * 60 * 1000;

export const MIN_EASE = 1.3;
export const MAX_EASE = 2.8;
const DEFAULT_EASE = 2.5;

/** Interval in days for the first few successful reviews, before ease applies. */
const LEARNING_STEPS = [0, 1, 3] as const;

/**
 * The interval `easy` graduates a learning item to, in days.
 *
 * Without this, the first three reviews of an item ignore the grade entirely
 * and all four buttons schedule the same day — which reads as if the choice
 * did nothing. Saying an item is easy is information, and the honest response
 * is to stop drilling it three times this week.
 */
const EASY_GRADUATION_DAYS = 4;

/** How much each grade moves the ease factor. */
const EASE_DELTA: Record<ReviewGrade, number> = {
  again: -0.2,
  hard: -0.15,
  good: 0,
  easy: 0.15,
};

export const newSchedule = (now: number): ScheduleState => ({
  streak: 0,
  intervalDays: 0,
  ease: DEFAULT_EASE,
  dueAt: now,
  lastReviewedAt: null,
  reviewCount: 0,
  lapses: 0,
});

const clampEase = (ease: number): number =>
  Math.min(MAX_EASE, Math.max(MIN_EASE, Math.round(ease * 100) / 100));

/**
 * The next state after grading a review.
 *
 * `again` is the only failing grade. It reduces the streak rather than zeroing
 * it, and schedules a short interval derived from what the user had already
 * earned, so a single slip costs a step and not a month of progress.
 */
export function grade(state: ScheduleState, review: ReviewGrade, now: number): ScheduleState {
  const ease = clampEase(state.ease + EASE_DELTA[review]);
  const reviewCount = state.reviewCount + 1;

  if (review === 'again') {
    const streak = Math.max(0, state.streak - 1);
    // Come back within the day, but not before the rest of the queue.
    const intervalDays = state.intervalDays >= 4 ? 1 : 0;
    return {
      streak,
      intervalDays,
      ease,
      dueAt: now + intervalDays * DAY_MS,
      lastReviewedAt: now,
      reviewCount,
      lapses: state.lapses + 1,
    };
  }

  const streak = state.streak + 1;
  const learning = streak <= LEARNING_STEPS.length;
  const intervalDays =
    learning && review === 'easy'
      ? Math.max(EASY_GRADUATION_DAYS, LEARNING_STEPS[streak - 1] ?? 1)
      : learning
        ? (LEARNING_STEPS[streak - 1] ?? 1)
        : Math.round(Math.max(1, state.intervalDays) * ease * (review === 'hard' ? 0.6 : 1));

  const capped = Math.min(intervalDays, 365);

  return {
    streak,
    intervalDays: capped,
    ease,
    dueAt: now + capped * DAY_MS,
    lastReviewedAt: now,
    reviewCount,
    lapses: state.lapses,
  };
}

export type TrainingStage = 'new' | 'learning' | 'review' | 'mature';

/**
 * Which bucket an item is in.
 *
 * Deliberately dull vocabulary: an item is new, being learned, in review, or
 * mature. No belts, no streaks, no celebration — the queue is a working tool.
 */
export function stageOf(state: ScheduleState): TrainingStage {
  if (state.reviewCount === 0) return 'new';
  if (state.streak <= LEARNING_STEPS.length) return 'learning';
  return state.intervalDays >= 21 ? 'mature' : 'review';
}

export const isDue = (state: ScheduleState, now: number): boolean => state.dueAt <= now;

export interface QueueCounts {
  readonly due: number;
  readonly new: number;
  readonly learning: number;
  readonly review: number;
  readonly mature: number;
  readonly total: number;
}

export function countQueue(states: readonly ScheduleState[], now: number): QueueCounts {
  const counts = { due: 0, new: 0, learning: 0, review: 0, mature: 0, total: states.length };
  for (const state of states) {
    if (isDue(state, now)) counts.due += 1;
    counts[stageOf(state)] += 1;
  }
  return counts;
}

/**
 * Order a review session.
 *
 * Overdue items first, oldest first, so a queue that has been left for a week
 * clears the backlog before introducing anything new; new items come last so
 * they cannot crowd out material that is about to be forgotten.
 */
export function orderQueue<T extends { readonly schedule: ScheduleState }>(
  items: readonly T[],
  now: number,
): T[] {
  return [...items]
    .filter((item) => isDue(item.schedule, now))
    .sort((a, b) => {
      const aNew = a.schedule.reviewCount === 0;
      const bNew = b.schedule.reviewCount === 0;
      if (aNew !== bNew) return aNew ? 1 : -1;
      return a.schedule.dueAt - b.schedule.dueAt;
    });
}

/** Human-readable interval, for the grade buttons. */
export function describeInterval(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 30) return `${days} days`;
  if (days < 365) return `${Math.round(days / 30)} months`;
  return '1 year';
}

/** What each grade would schedule, for previewing on the buttons. */
export function previewGrades(state: ScheduleState, now: number): Record<ReviewGrade, number> {
  return {
    again: grade(state, 'again', now).intervalDays,
    hard: grade(state, 'hard', now).intervalDays,
    good: grade(state, 'good', now).intervalDays,
    easy: grade(state, 'easy', now).intervalDays,
  };
}
