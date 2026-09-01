import { beforeEach, describe, expect, it } from 'vitest';

import { START_FEN } from '@/chess/fen';
import { createMemoryRepositories } from '@/persistence/repositories';
import type { AppRepositories } from '@/persistence/types';
import type { ScheduleState } from '@/persistence/domain';

import {
  DAY_MS,
  MAX_EASE,
  MIN_EASE,
  countQueue,
  describeInterval,
  grade,
  isDue,
  newSchedule,
  orderQueue,
  previewGrades,
  stageOf,
} from './schedule';

/**
 * A fixed instant. Every test drives the clock explicitly, so nothing here can
 * fail because it ran at midnight or in a different time zone.
 */
const T0 = Date.UTC(2026, 0, 15, 12, 0, 0);
const days = (n: number) => n * DAY_MS;

describe('a new item', () => {
  it('is due immediately and counts as new', () => {
    const state = newSchedule(T0);
    expect(state.dueAt).toBe(T0);
    expect(isDue(state, T0)).toBe(true);
    expect(stageOf(state)).toBe('new');
    expect(state.reviewCount).toBe(0);
  });
});

describe('grading', () => {
  it('walks the learning steps before ease applies', () => {
    let state = newSchedule(T0);

    state = grade(state, 'good', T0);
    expect(state.intervalDays).toBe(0);
    expect(state.streak).toBe(1);
    expect(stageOf(state)).toBe('learning');

    state = grade(state, 'good', T0 + days(1));
    expect(state.intervalDays).toBe(1);

    state = grade(state, 'good', T0 + days(2));
    expect(state.intervalDays).toBe(3);
    expect(stageOf(state)).toBe('learning');
  });

  it('multiplies by the ease factor once the item is being reviewed', () => {
    let state: ScheduleState = {
      ...newSchedule(T0),
      streak: 3,
      intervalDays: 3,
      ease: 2.5,
      reviewCount: 3,
    };

    state = grade(state, 'good', T0);
    // 3 days × ease 2.5 = 7.5, rounded.
    expect(state.intervalDays).toBe(8);
    expect(state.dueAt).toBe(T0 + days(8));
    expect(stageOf(state)).toBe('review');
  });

  it('becomes mature once the interval reaches three weeks', () => {
    const state: ScheduleState = {
      ...newSchedule(T0),
      streak: 6,
      intervalDays: 30,
      reviewCount: 6,
    };
    expect(stageOf(state)).toBe('mature');
  });

  it('shortens the step for "hard" without failing the item', () => {
    const base: ScheduleState = {
      ...newSchedule(T0),
      streak: 4,
      intervalDays: 10,
      ease: 2.5,
      reviewCount: 4,
    };

    const hard = grade(base, 'hard', T0);
    const good = grade(base, 'good', T0);

    expect(hard.intervalDays).toBeLessThan(good.intervalDays);
    expect(hard.streak).toBe(5);
    expect(hard.lapses).toBe(0);
    expect(hard.ease).toBeLessThan(base.ease);
  });

  it('lets "easy" leave the learning steps instead of drilling a known item', () => {
    const graduated = grade(newSchedule(T0), 'easy', T0);
    expect(graduated.intervalDays).toBeGreaterThan(grade(newSchedule(T0), 'good', T0).intervalDays);
    expect(graduated.dueAt).toBeGreaterThan(T0);
    expect(stageOf(graduated)).toBe('learning');
  });

  it('rewards "easy" with more ease and a longer interval', () => {
    const base: ScheduleState = {
      ...newSchedule(T0),
      streak: 4,
      intervalDays: 10,
      ease: 2.5,
      reviewCount: 4,
    };
    const easy = grade(base, 'easy', T0);
    expect(easy.ease).toBeGreaterThan(base.ease);
    expect(easy.intervalDays).toBeGreaterThan(10);
  });

  /**
   * The deliberate departure from textbook SM-2. Forgetting one move of a line
   * should cost a step, not a month of accumulated progress.
   */
  it('costs a step on a lapse rather than resetting to zero', () => {
    const base: ScheduleState = {
      ...newSchedule(T0),
      streak: 5,
      intervalDays: 20,
      ease: 2.4,
      reviewCount: 5,
    };

    const lapsed = grade(base, 'again', T0);

    expect(lapsed.streak).toBe(4);
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.intervalDays).toBe(1);
    expect(lapsed.ease).toBeLessThan(base.ease);
  });

  it('brings a barely-learned item straight back on a lapse', () => {
    const base: ScheduleState = { ...newSchedule(T0), streak: 1, intervalDays: 1, reviewCount: 1 };
    const lapsed = grade(base, 'again', T0);
    expect(lapsed.intervalDays).toBe(0);
    expect(isDue(lapsed, T0)).toBe(true);
  });

  it('clamps ease at both ends however it is graded', () => {
    let low = { ...newSchedule(T0), ease: MIN_EASE };
    for (let i = 0; i < 10; i += 1) low = grade(low, 'again', T0);
    expect(low.ease).toBe(MIN_EASE);

    let high = { ...newSchedule(T0), ease: MAX_EASE };
    for (let i = 0; i < 10; i += 1) high = grade(high, 'easy', T0);
    expect(high.ease).toBe(MAX_EASE);
  });

  it('never schedules further out than a year', () => {
    let state: ScheduleState = {
      ...newSchedule(T0),
      streak: 20,
      intervalDays: 300,
      ease: 2.8,
      reviewCount: 20,
    };
    state = grade(state, 'easy', T0);
    expect(state.intervalDays).toBe(365);
  });

  it('counts every review, successful or not', () => {
    let state = newSchedule(T0);
    state = grade(state, 'good', T0);
    state = grade(state, 'again', T0);
    state = grade(state, 'hard', T0);
    expect(state.reviewCount).toBe(3);
  });
});

describe('the queue', () => {
  const at = (dueAt: number, reviewCount = 1): { schedule: ScheduleState } => ({
    schedule: { ...newSchedule(dueAt), dueAt, reviewCount },
  });

  it('counts what is due and what stage each item is in', () => {
    const counts = countQueue(
      [
        newSchedule(T0),
        { ...newSchedule(T0), dueAt: T0 + days(5), streak: 2, reviewCount: 2 },
        { ...newSchedule(T0), dueAt: T0 - days(1), streak: 8, intervalDays: 40, reviewCount: 8 },
      ],
      T0,
    );

    expect(counts.total).toBe(3);
    expect(counts.due).toBe(2);
    expect(counts.new).toBe(1);
    expect(counts.learning).toBe(1);
    expect(counts.mature).toBe(1);
  });

  it('clears the oldest backlog first and leaves new material until last', () => {
    const ordered = orderQueue(
      [
        { id: 'new', ...at(T0 - days(9), 0) },
        { id: 'recent', ...at(T0 - days(1)) },
        { id: 'oldest', ...at(T0 - days(6)) },
        { id: 'future', ...at(T0 + days(3)) },
      ],
      T0,
    );

    expect(ordered.map((item) => item.id)).toEqual(['oldest', 'recent', 'new']);
  });

  it('previews what each button would schedule', () => {
    const preview = previewGrades(
      { ...newSchedule(T0), streak: 4, intervalDays: 10, ease: 2.5, reviewCount: 4 },
      T0,
    );
    expect(preview.again).toBeLessThan(preview.hard);
    expect(preview.hard).toBeLessThan(preview.good);
    expect(preview.good).toBeLessThanOrEqual(preview.easy);
  });

  it('describes intervals the way a person would say them', () => {
    expect(describeInterval(0)).toBe('today');
    expect(describeInterval(1)).toBe('tomorrow');
    expect(describeInterval(9)).toBe('9 days');
    expect(describeInterval(60)).toBe('2 months');
    expect(describeInterval(400)).toBe('1 year');
  });
});

describe('training persistence', () => {
  let repositories: AppRepositories;

  beforeEach(() => {
    repositories = createMemoryRepositories();
  });

  const input = {
    mode: 'best-move' as const,
    positionKey: 'k',
    fen: START_FEN,
    sideToMove: 'w' as const,
    prompt: 'Find the best move.',
    solutionUci: ['e2e4'],
    solutionSan: ['e4'],
    candidatesUci: [],
    plans: [],
    tags: ['opening'],
  };

  it('creates an item that is due immediately', async () => {
    const item = await repositories.training.create(input as never, T0);
    expect(item.schedule.dueAt).toBe(T0);
    expect((await repositories.training.due(T0)).map((entry) => entry.id)).toEqual([item.id]);
  });

  /** The scenario the brief specifies: create, review, grade, reload, check. */
  it('advances the schedule and remembers it across a reload', async () => {
    const item = await repositories.training.create(input as never, T0);

    await repositories.training.review(item.id, 'good', true, T0);
    const afterFirst = await repositories.training.get(item.id);
    expect(afterFirst?.schedule.streak).toBe(1);

    const second = await repositories.training.review(item.id, 'good', true, T0 + days(1));
    expect(second.schedule.intervalDays).toBe(1);
    expect(second.schedule.dueAt).toBe(T0 + days(1) + days(1));

    // Re-reading is what a reload does to a repository.
    const reloaded = await repositories.training.get(item.id);
    expect(reloaded?.schedule.dueAt).toBe(second.schedule.dueAt);
    expect(reloaded?.schedule.reviewCount).toBe(2);

    // And it is no longer in today's queue.
    expect(await repositories.training.due(T0 + days(1))).toEqual([]);
  });

  it('keeps a review history alongside the schedule', async () => {
    const item = await repositories.training.create(input as never, T0);
    await repositories.training.review(item.id, 'good', true, T0);
    await repositories.training.review(item.id, 'again', false, T0 + days(1));

    const history = await repositories.training.history(item.id);
    expect(history).toHaveLength(2);
    expect(history[0]?.grade).toBe('again');
    expect(history[0]?.correct).toBe(false);
  });

  it('deletes an item together with its history', async () => {
    const item = await repositories.training.create(input as never, T0);
    await repositories.training.review(item.id, 'good', true, T0);

    await repositories.training.delete(item.id);

    expect(await repositories.training.get(item.id)).toBeNull();
    expect(await repositories.training.history(item.id)).toEqual([]);
  });

  it('refuses to review an item that has been deleted', async () => {
    const item = await repositories.training.create(input as never, T0);
    await repositories.training.delete(item.id);
    await expect(repositories.training.review(item.id, 'good', true, T0)).rejects.toThrow(
      /no longer exists/i,
    );
  });

  it('counts the items attached to a position', async () => {
    await repositories.training.create({ ...input, positionKey: 'shared' } as never, T0);
    await repositories.training.create({ ...input, positionKey: 'shared' } as never, T0);
    await repositories.training.create({ ...input, positionKey: 'other' } as never, T0);

    expect(await repositories.training.countByPosition('shared')).toBe(2);
    expect(await repositories.training.countByPosition('other')).toBe(1);
  });
});
