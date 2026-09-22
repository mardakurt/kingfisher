import { describe, expect, it, vi } from 'vitest';

import type { GameRecord, GameSummary } from '@/persistence/types';

import { loadAllSeasonGames } from './use-season-games';

const summary = (id: string) => ({ id }) as GameSummary;

describe('loadAllSeasonGames', () => {
  it('walks every search page before reading the full records', async () => {
    const search = vi
      .fn()
      .mockResolvedValueOnce({ games: [summary('a')], total: null, hasMore: true })
      .mockResolvedValueOnce({ games: [summary('b')], total: null, hasMore: true })
      .mockResolvedValueOnce({ games: [summary('c')], total: null, hasMore: false });
    const records = [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as GameRecord[];
    const getMany = vi.fn().mockResolvedValue(records);

    await expect(loadAllSeasonGames({ search, getMany })).resolves.toBe(records);
    expect(search.mock.calls.map(([query]) => query)).toEqual([
      { limit: 1_000, offset: 0 },
      { limit: 1_000, offset: 1_000 },
      { limit: 1_000, offset: 2_000 },
    ]);
    expect(getMany).toHaveBeenCalledWith(['a', 'b', 'c']);
  });
});
