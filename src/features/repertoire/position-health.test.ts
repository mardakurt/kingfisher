import { describe, expect, it } from 'vitest';

import type { RepertoireMove, ScheduleState } from '@/persistence/domain';

import { relativeDays, soonestSchedule, summariseMoves } from './position-health';

const move = (san: string, role: RepertoireMove['role']): RepertoireMove => ({
  uci: 'e2e4' as RepertoireMove['uci'],
  san: san as RepertoireMove['san'],
  role,
  updatedAt: 0,
});

const schedule = (dueAt: number): ScheduleState => ({
  streak: 1,
  intervalDays: 4,
  ease: 2.5,
  dueAt,
  lastReviewedAt: null,
  reviewCount: 1,
  lapses: 0,
});

describe('summariseMoves', () => {
  it('reports the first main move as the response', () => {
    const summary = summariseMoves([move('c5', 'main'), move('e5', 'alternative')]);
    expect(summary.mainResponse).toBe('c5');
    expect(summary.alternatives).toEqual(['e5']);
  });

  it('keeps rejected moves, because rediscovering them wastes the same afternoon twice', () => {
    expect(summariseMoves([move('Nf6', 'avoid')]).avoided).toEqual(['Nf6']);
  });

  it('reports no response rather than inventing one when nothing is marked main', () => {
    expect(summariseMoves([move('d5', 'candidate')]).mainResponse).toBeNull();
  });
});

describe('soonestSchedule', () => {
  it('picks the item that will bring the position back first', () => {
    expect(soonestSchedule([schedule(500), schedule(100), schedule(900)])?.dueAt).toBe(100);
  });

  it('has nothing to report when the position is not scheduled', () => {
    expect(soonestSchedule([])).toBeNull();
  });
});

describe('relativeDays', () => {
  const now = 1_700_000_000_000;
  const day = 86_400_000;

  it('rounds to whole days, matching the scheduler resolution', () => {
    expect(relativeDays(now + 4 * day, now)).toBe('in 4 days');
    expect(relativeDays(now - 18 * day, now)).toBe('18 days ago');
  });

  it('names the days either side of now', () => {
    expect(relativeDays(now, now)).toBe('today');
    expect(relativeDays(now + day, now)).toBe('tomorrow');
    expect(relativeDays(now - day, now)).toBe('yesterday');
  });
});
