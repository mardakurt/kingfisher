import { describe, expect, it } from 'vitest';

import { channelFor, monthOf, planMonthly } from './monthly.mjs';

const broadcast = (...months) => months.map((month) => `lichess_db_broadcast_${month}.pgn.zst`);
const UPSTREAM = broadcast(
  '2026-01',
  '2026-02',
  '2026-03',
  '2026-04',
  '2026-05',
  '2026-06',
  '2026-07',
  '2026-08',
);

describe('the monthly data cycle', () => {
  it('reads a month from an archive name', () => {
    expect(monthOf('lichess_db_broadcast_2026-08.pgn.zst')).toBe('2026-08');
    expect(monthOf('README')).toBeNull();
  });

  it('does nothing when the live pack already ends on the newest published month', () => {
    // 25 September 2026: August is the newest archive. The calendar says
    // September, and the first status script believed it.
    const plan = planMonthly({
      upstream: UPSTREAM,
      live: broadcast('2026-08', '2026-07', '2026-06', '2026-05', '2026-04', '2026-03'),
      liveVersion: 2,
    });
    expect(plan.rebuild).toBe(false);
    expect(plan.reason).toMatch(/already ends on 2026-08/);
  });

  it('rebuilds over the newest six published months when a new one appears', () => {
    const plan = planMonthly({
      upstream: [...UPSTREAM, ...broadcast('2026-09')],
      live: broadcast('2026-08', '2026-07', '2026-06', '2026-05', '2026-04', '2026-03'),
      liveVersion: 2,
    });
    expect(plan).toMatchObject({
      rebuild: true,
      version: 3,
      months: ['2026-09', '2026-08', '2026-07', '2026-06', '2026-05', '2026-04'],
    });
  });

  it('builds the first version when nothing is live', () => {
    const plan = planMonthly({ upstream: UPSTREAM, live: [], liveVersion: 0 });
    expect(plan.rebuild).toBe(true);
    expect(plan.version).toBe(1);
  });

  it('refuses to move a channel backwards or onto another pack', () => {
    const previous = channelFor({
      id: 'p',
      version: 3,
      directory: 'reference-recent-v3',
      months: [],
      builtAt: '2026-09-25',
    });
    expect(previous.manifest).toBe('reference-recent-v3/manifest.json');
    expect(() =>
      channelFor({ id: 'p', version: 3, directory: 'd', months: [], builtAt: '', previous }),
    ).toThrow(/backwards/);
    expect(() =>
      channelFor({ id: 'q', version: 4, directory: 'd', months: [], builtAt: '', previous }),
    ).toThrow(/names p/);
  });
});
