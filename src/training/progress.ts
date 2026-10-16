/**
 * Training progress, read from the review log.
 *
 * Every review a person makes is already stored (`TrainingReviewRecord`:
 * when, which grade, whether the move was right). Nothing read it back, so
 * a player who had trained for a month could not see that they had, or
 * whether they were getting the positions right more often. This counts it.
 *
 * Counts, never a score: how many reviews each week, how many of them were
 * right, and what is coming due. No streak, no level, no "you've improved" —
 * a rate over eleven reviews is printed with its eleven, and the reader
 * decides what it means. Every function takes `now`; nothing reads the clock.
 */

import type { ScheduleState, TrainingReviewRecord } from '@/persistence/domain';

import { DAY_MS } from './schedule';

export const WEEK_MS = 7 * DAY_MS;

export interface WeekOfReviews {
  /** Start of the seven-day window, inclusive. */
  readonly from: number;
  /** End of the window, exclusive. */
  readonly to: number;
  readonly reviews: number;
  readonly correct: number;
}

export interface TrainingProgress {
  /** Oldest first; the last one ends at `now`. */
  readonly weeks: readonly WeekOfReviews[];
  readonly totalReviews: number;
  readonly totalCorrect: number;
  /** The first review ever logged, or null with none. */
  readonly firstReviewAt: number | null;
  /** Items due on each of the next days, today first; overdue items count as today. */
  readonly forecast: readonly number[];
}

/**
 * Seven-day windows ending at `now` — rolling, not calendar weeks, so the
 * last bar is always "the past seven days" and never a half-empty Monday.
 */
export function trainingProgress(
  reviews: readonly Pick<TrainingReviewRecord, 'reviewedAt' | 'correct'>[],
  schedules: readonly Pick<ScheduleState, 'dueAt'>[],
  now: number,
  options: { readonly weeks?: number; readonly forecastDays?: number } = {},
): TrainingProgress {
  const weekCount = options.weeks ?? 8;
  const forecastDays = options.forecastDays ?? 7;

  const weeks: { from: number; to: number; reviews: number; correct: number }[] = [];
  for (let index = weekCount - 1; index >= 0; index -= 1) {
    const to = now - index * WEEK_MS;
    weeks.push({ from: to - WEEK_MS, to, reviews: 0, correct: 0 });
  }

  let totalCorrect = 0;
  let firstReviewAt: number | null = null;
  for (const review of reviews) {
    if (review.correct) totalCorrect += 1;
    if (firstReviewAt === null || review.reviewedAt < firstReviewAt)
      firstReviewAt = review.reviewedAt;
    const week = weeks.find(
      (entry) => review.reviewedAt >= entry.from && review.reviewedAt < entry.to,
    );
    if (!week) continue;
    week.reviews += 1;
    if (review.correct) week.correct += 1;
  }

  const forecast = Array.from({ length: forecastDays }, () => 0);
  for (const schedule of schedules) {
    const day = Math.floor((schedule.dueAt - now) / DAY_MS);
    if (day < forecastDays) forecast[Math.max(0, day)]! += 1;
  }

  return { weeks, totalReviews: reviews.length, totalCorrect, firstReviewAt, forecast };
}

/** "8 of 11 right", or null when there is nothing to divide. */
export function correctShare(correct: number, reviews: number): string | null {
  if (reviews === 0) return null;
  return `${correct} of ${reviews} right (${Math.round((correct / reviews) * 100)}%)`;
}
