import { describe, expect, it } from 'vitest';

import type { ReviewItemRecord, ScheduleState } from '@/persistence/domain';
import { DAY_MS, newSchedule } from '@/training/schedule';
import {
  describeNextReview,
  dueReviews,
  reviewScheduleCounts,
  scheduleAfterReview,
  SCHEDULING_CHOICES,
  upcomingReviews,
} from './scheduling';

const NOW = 1_800_000_000_000;

const item = (id: string, schedule?: ScheduleState): ReviewItemRecord =>
  ({
    id,
    identityKey: id,
    positionKey: id,
    status: 'reviewed',
    source: 'marked',
    signals: [],
    themes: [],
    createdAt: NOW,
    revision: 0,
    ...(schedule ? { schedule } : {}),
  }) as unknown as ReviewItemRecord;

describe('scheduling a reviewed position', () => {
  it('honours a fixed choice exactly, without touching the ease factor', () => {
    const base = newSchedule(NOW);
    const week = scheduleAfterReview(base, 'one-week', NOW)!;

    expect(week.intervalDays).toBe(7);
    expect(week.dueAt).toBe(NOW + 7 * DAY_MS);
    /*
      The player overrode the algorithm for this position. Feeding that back
      into the ease would make the *next* automatic interval reflect a decision
      that was never about difficulty.
    */
    expect(week.ease).toBe(base.ease);
    expect(week.reviewCount).toBe(base.reviewCount + 1);
  });

  it('defers to the training scheduler when asked to', () => {
    const base = newSchedule(NOW);
    const automatic = scheduleAfterReview(base, 'scheduler', NOW)!;
    // Whatever SM-2 does here, it is SM-2 doing it: the interval is not one of
    // the fixed options and the ease is the scheduler's business.
    expect(automatic.dueAt).toBeGreaterThanOrEqual(NOW);
    expect(automatic.reviewCount).toBe(1);
  });

  it('represents "never" as no schedule at all', () => {
    // Not a date far in the future: nothing then has to guess whether a distant
    // due date means "later" or "no".
    expect(scheduleAfterReview(newSchedule(NOW), 'never', NOW)).toBeUndefined();
  });

  it('starts a schedule for a position that never had one', () => {
    const first = scheduleAfterReview(undefined, 'three-weeks', NOW)!;
    expect(first.intervalDays).toBe(21);
    expect(first.dueAt).toBe(NOW + 21 * DAY_MS);
  });

  it('offers every choice with a plain explanation of what it does', () => {
    expect(SCHEDULING_CHOICES).toHaveLength(6);
    for (const choice of SCHEDULING_CHOICES) {
      expect(choice.label.length).toBeGreaterThan(0);
      expect(choice.detail.length).toBeGreaterThan(0);
    }
  });
});

describe('the review queue', () => {
  it('returns only what is due, soonest first', () => {
    const overdue = { ...newSchedule(NOW), dueAt: NOW - 3 * DAY_MS };
    const dueNow = { ...newSchedule(NOW), dueAt: NOW };
    const later = { ...newSchedule(NOW), dueAt: NOW + 5 * DAY_MS };

    const due = dueReviews(
      [item('later', later), item('due', dueNow), item('overdue', overdue)],
      NOW,
    );

    expect(due.map((entry) => entry.item.id)).toEqual(['overdue', 'due']);
  });

  it('never resurrects a position the player chose not to schedule', () => {
    const unscheduled = item('left-alone');
    expect(dueReviews([unscheduled], NOW)).toEqual([]);
    expect(upcomingReviews([unscheduled], NOW)).toEqual([]);
    expect(reviewScheduleCounts([unscheduled], NOW).scheduled).toBe(0);
  });

  it('counts what is scheduled separately from what is due', () => {
    const counts = reviewScheduleCounts(
      [
        item('a', { ...newSchedule(NOW), dueAt: NOW - DAY_MS }),
        item('b', { ...newSchedule(NOW), dueAt: NOW + 10 * DAY_MS }),
        item('c'),
      ],
      NOW,
    );
    expect(counts).toMatchObject({ scheduled: 2, due: 1 });
  });

  it('says when a position comes back in words a player would use', () => {
    expect(describeNextReview(undefined, NOW)).toBe('Not scheduled');
    expect(describeNextReview({ ...newSchedule(NOW), dueAt: NOW - DAY_MS }, NOW)).toBe('Due now');
    expect(describeNextReview({ ...newSchedule(NOW), dueAt: NOW + DAY_MS }, NOW)).toBe(
      'Due tomorrow',
    );
    expect(describeNextReview({ ...newSchedule(NOW), dueAt: NOW + 9 * DAY_MS }, NOW)).toBe(
      'Due in 9 days',
    );
    expect(describeNextReview({ ...newSchedule(NOW), dueAt: NOW + 62 * DAY_MS }, NOW)).toBe(
      'Due in about 2 months',
    );
  });
});
