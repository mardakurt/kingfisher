import { describe, expect, it } from 'vitest';

import { localDay, readRehearsed, writeRehearsed } from './rehearsed';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, String(value)),
  };
}

describe('the day’s rehearsals', () => {
  it('are kept for the day they were made, and only that day', () => {
    const storage = memoryStorage();
    writeRehearsed('2026-09-27', ['a', 'b'], storage);
    expect(readRehearsed('2026-09-27', storage)).toEqual(['a', 'b']);
    // Tomorrow is a new session.
    expect(readRehearsed('2026-09-28', storage)).toEqual([]);
  });

  it('read as none when the record is damaged or storage refuses', () => {
    const storage = memoryStorage();
    storage.setItem('kingfisher.daily.rehearsed', '{not json');
    expect(readRehearsed('2026-09-27', storage)).toEqual([]);
    storage.setItem(
      'kingfisher.daily.rehearsed',
      JSON.stringify({ day: '2026-09-27', ids: [1, 'x'] }),
    );
    expect(readRehearsed('2026-09-27', storage)).toEqual(['x']);
    const refusing = {
      ...memoryStorage(),
      setItem: () => {
        throw new Error('quota');
      },
    } as Storage;
    expect(() => writeRehearsed('2026-09-27', ['a'], refusing)).not.toThrow();
    expect(readRehearsed('2026-09-27', null)).toEqual([]);
  });

  it('names the local calendar day', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05');
  });
});
