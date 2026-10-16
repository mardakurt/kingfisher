import { describe, expect, it } from 'vitest';

import { correctShare, trainingProgress, WEEK_MS } from './progress';
import { DAY_MS } from './schedule';

const NOW = Date.UTC(2026, 9, 16, 12);
const review = (daysAgo: number, correct: boolean) => ({
  reviewedAt: NOW - daysAgo * DAY_MS,
  correct,
});

describe('trainingProgress', () => {
  it('counts reviews and right answers in rolling seven-day windows', () => {
    const progress = trainingProgress(
      [review(1, true), review(2, false), review(6.9, true), review(8, true), review(70, true)],
      [],
      NOW,
    );
    expect(progress.weeks).toHaveLength(8);
    const last = progress.weeks.at(-1)!;
    expect(last.to).toBe(NOW);
    expect(last.from).toBe(NOW - WEEK_MS);
    expect(last).toMatchObject({ reviews: 3, correct: 2 });
    expect(progress.weeks.at(-2)).toMatchObject({ reviews: 1, correct: 1 });
    // Ten weeks ago is outside the eight drawn, but still in the totals.
    expect(progress.weeks.reduce((sum, week) => sum + week.reviews, 0)).toBe(4);
    expect(progress.totalReviews).toBe(5);
    expect(progress.totalCorrect).toBe(4);
    expect(progress.firstReviewAt).toBe(NOW - 70 * DAY_MS);
  });

  it('puts what is due on its day, and anything overdue on today', () => {
    const progress = trainingProgress(
      [],
      [
        { dueAt: NOW - 5 * DAY_MS },
        { dueAt: NOW + 2 * 60 * 60 * 1000 },
        { dueAt: NOW + 1.5 * DAY_MS },
        { dueAt: NOW + 6.5 * DAY_MS },
        { dueAt: NOW + 30 * DAY_MS },
      ],
      NOW,
    );
    expect(progress.forecast).toEqual([2, 1, 0, 0, 0, 0, 1]);
  });

  it('is empty, not invented, with no reviews', () => {
    const progress = trainingProgress([], [], NOW);
    expect(progress.totalReviews).toBe(0);
    expect(progress.firstReviewAt).toBeNull();
    expect(progress.weeks.every((week) => week.reviews === 0)).toBe(true);
  });
});

describe('correctShare', () => {
  it('says the count with the rate, and nothing for nothing', () => {
    expect(correctShare(8, 11)).toBe('8 of 11 right (73%)');
    expect(correctShare(0, 0)).toBeNull();
  });
});
