/**
 * Bringing a reviewed position back.
 *
 * Phase 8 built the review queue and stopped there: a position was reviewed
 * once and then left alone, which is the one thing a position worth reviewing
 * does not deserve. This schedules the return.
 *
 * It reuses the training scheduler rather than inventing a second one. That is
 * a deliberate constraint, not laziness — two spaced-repetition algorithms in
 * one product means two sets of intervals to explain, two sets of behaviour to
 * debug, and a user who cannot predict either. ADR 0011 chose SM-2 because it
 * is explicable in two sentences; a second algorithm would spend that.
 *
 * What is *not* shared is the schedule itself. Training and review ask
 * different questions of the same position:
 *
 *   Training  — "what is the move here?"  A known answer, checked.
 *   Review    — "how did I think here?"   No answer to check; the player
 *               reconstructs their reasoning and compares it to what they
 *               wrote last time.
 *
 * Being able to recall a move says nothing about being able to rebuild the
 * plan behind it, so the two schedules are kept apart and a position can
 * legitimately be due for one and not the other.
 */

import type { ReviewGrade, ReviewItemRecord, ScheduleState } from '@/persistence/domain';
import { DAY_MS, grade, isDue, newSchedule, stageOf } from '@/training/schedule';

/**
 * What the player chooses after a review, in the terms they think in.
 *
 * A player finishing a review knows "I want to see this again soon" or "this
 * is solid now" — they do not know an ease factor. These options map onto the
 * scheduler; they do not replace it.
 */
export type ReviewSchedulingChoice =
  'tomorrow' | 'one-week' | 'three-weeks' | 'two-months' | 'scheduler' | 'never';

export const SCHEDULING_CHOICES: readonly {
  readonly id: ReviewSchedulingChoice;
  readonly label: string;
  readonly detail: string;
}[] = [
  {
    id: 'scheduler',
    label: 'Let the scheduler decide',
    detail: 'Uses the same spaced repetition as training, from this position’s own history.',
  },
  { id: 'tomorrow', label: 'Tomorrow', detail: 'Fixed one-day interval.' },
  { id: 'one-week', label: 'In a week', detail: 'Fixed seven-day interval.' },
  { id: 'three-weeks', label: 'In three weeks', detail: 'Fixed twenty-one-day interval.' },
  { id: 'two-months', label: 'In two months', detail: 'Fixed sixty-day interval.' },
  { id: 'never', label: 'Do not schedule', detail: 'Stays in the queue history, never returns.' },
];

const FIXED_DAYS: Partial<Record<ReviewSchedulingChoice, number>> = {
  tomorrow: 1,
  'one-week': 7,
  'three-weeks': 21,
  'two-months': 60,
};

/**
 * The schedule a choice produces.
 *
 * A fixed choice sets the interval directly and leaves the ease alone: the
 * player has overridden the algorithm for this position, and silently feeding
 * that override back into the ease factor would make the *next* automatic
 * interval reflect a decision that was never about difficulty.
 *
 * `never` returns `undefined`, which is how "not scheduled" is represented on
 * the record — an absent schedule rather than one parked far in the future,
 * so nothing has to guess whether a distant date means "later" or "no".
 */
export function scheduleAfterReview(
  current: ScheduleState | undefined,
  choice: ReviewSchedulingChoice,
  now: number,
  automaticGrade: ReviewGrade = 'good',
): ScheduleState | undefined {
  if (choice === 'never') return undefined;
  const base = current ?? newSchedule(now);
  if (choice === 'scheduler') return grade(base, automaticGrade, now);

  const days = FIXED_DAYS[choice];
  if (days === undefined) return base;
  return {
    ...base,
    intervalDays: days,
    dueAt: now + days * DAY_MS,
    lastReviewedAt: now,
    reviewCount: base.reviewCount + 1,
    streak: base.streak + 1,
  };
}

export interface ScheduledReview {
  readonly item: ReviewItemRecord;
  readonly schedule: ScheduleState;
  readonly dueInDays: number;
}

/**
 * Review items that are due, soonest first.
 *
 * An item with no schedule is not due and never becomes due — it was reviewed
 * and deliberately left alone, and resurrecting it would undo an explicit
 * choice.
 */
export function dueReviews(
  items: readonly ReviewItemRecord[],
  now: number,
): readonly ScheduledReview[] {
  return items
    .filter(
      (item): item is ReviewItemRecord & { schedule: ScheduleState } =>
        item.schedule !== undefined && isDue(item.schedule, now),
    )
    .map((item) => ({
      item,
      schedule: item.schedule,
      dueInDays: Math.round((item.schedule.dueAt - now) / DAY_MS),
    }))
    .sort((a, b) => a.schedule.dueAt - b.schedule.dueAt);
}

/** Everything scheduled, due or not, for the "coming up" list. */
export function upcomingReviews(
  items: readonly ReviewItemRecord[],
  now: number,
): readonly ScheduledReview[] {
  return items
    .filter(
      (item): item is ReviewItemRecord & { schedule: ScheduleState } => item.schedule !== undefined,
    )
    .map((item) => ({
      item,
      schedule: item.schedule,
      dueInDays: Math.ceil((item.schedule.dueAt - now) / DAY_MS),
    }))
    .sort((a, b) => a.schedule.dueAt - b.schedule.dueAt);
}

/** Counts for the review queue header, in the training vocabulary. */
export function reviewScheduleCounts(
  items: readonly ReviewItemRecord[],
  now: number,
): { readonly scheduled: number; readonly due: number; readonly mature: number } {
  const scheduled = items.filter((item) => item.schedule !== undefined);
  return {
    scheduled: scheduled.length,
    due: scheduled.filter((item) => isDue(item.schedule!, now)).length,
    mature: scheduled.filter((item) => stageOf(item.schedule!) === 'mature').length,
  };
}

/** A plain sentence for when a position comes back. */
export function describeNextReview(schedule: ScheduleState | undefined, now: number): string {
  if (!schedule) return 'Not scheduled';
  const days = Math.ceil((schedule.dueAt - now) / DAY_MS);
  if (days <= 0) return 'Due now';
  if (days === 1) return 'Due tomorrow';
  if (days < 30) return `Due in ${days} days`;
  const months = Math.round(days / 30);
  return months === 1 ? 'Due in about a month' : `Due in about ${months} months`;
}
