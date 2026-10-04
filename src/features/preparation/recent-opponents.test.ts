import { beforeEach, describe, expect, it } from 'vitest';

import { RECENT_OPPONENTS, recentOpponents, rememberOpponent } from './recent-opponents';

describe('recent opponents', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    globalThis.localStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    } as Storage;
  });

  it('keeps the newest first, each name once whatever its case', () => {
    rememberOpponent('Carlsen, Magnus');
    rememberOpponent('Ding, Liren');
    expect(rememberOpponent('carlsen, magnus')).toEqual(['carlsen, magnus', 'Ding, Liren']);
    expect(recentOpponents()).toEqual(['carlsen, magnus', 'Ding, Liren']);
  });

  it('keeps a bounded list and ignores an empty search', () => {
    for (let index = 0; index < RECENT_OPPONENTS + 3; index += 1) rememberOpponent(`P${index}`);
    expect(recentOpponents()).toHaveLength(RECENT_OPPONENTS);
    expect(recentOpponents()[0]).toBe(`P${RECENT_OPPONENTS + 2}`);
    expect(rememberOpponent('   ')).toHaveLength(RECENT_OPPONENTS);
  });

  it('reads a corrupted store as no list', () => {
    localStorage.setItem('kingfisher.recent-opponents.v1', '{not json');
    expect(recentOpponents()).toEqual([]);
  });
});
