import { describe, expect, it, vi } from 'vitest';

/*
  A profile that is already connected to Lichess, as it is on disk when the
  application starts: the persisted preferences hold the token before any
  module has run. Stubbed ahead of the hoisted imports, as in
  preferences-store.test.ts, because zustand reads storage at evaluation.
*/
vi.hoisted(() => {
  const entries = new Map<string, string>([
    [
      'kingfisher.preferences',
      JSON.stringify({
        state: { lichessToken: 'stored-token', explorerSourceId: 'lichess-masters' },
        version: 7,
      }),
    ],
  ]);
  (globalThis as { localStorage?: Storage }).localStorage = {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key: string) => entries.get(key) ?? null,
    key: (index: number) => [...entries.keys()][index] ?? null,
    removeItem: (key: string) => void entries.delete(key),
    setItem: (key: string, value: string) => void entries.set(key, String(value)),
  } satisfies Storage;
});

import { hasLichessToken, lichessToken } from '@/database/providers/lichess-auth';

import { usePreferences } from './preferences-store';

describe('the Lichess provider and the stored token', () => {
  /*
    The Explorer's first request on start-up is made before any parent effect
    runs. When the provider learned the token from such an effect, that first
    request went without it and a connected player was told Lichess needed a
    token. The provider must hold it as soon as the preferences exist.
  */
  it('holds a stored token before any component has rendered', () => {
    expect(usePreferences.getState().lichessToken).toBe('stored-token');
    expect(hasLichessToken()).toBe(true);
    expect(lichessToken()).toBe('stored-token');
  });

  it('follows connecting and disconnecting', () => {
    usePreferences.getState().set('lichessToken', '');
    expect(hasLichessToken()).toBe(false);
    usePreferences.getState().set('lichessToken', '  another-token ');
    expect(lichessToken()).toBe('another-token');
  });
});
