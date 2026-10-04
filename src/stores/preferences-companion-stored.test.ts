import { describe, expect, it, vi } from 'vitest';

/*
  The companion connection must exist as soon as the preferences do: the
  Library's first query on `/games?db=sqlite:…` runs before any parent effect,
  and an effect-mirrored connection made it fail as "not connected" and stay
  failed while the companion answered (closure audit). Here the pairing is the
  one stored in this browser.
*/
vi.hoisted(() => {
  const entries = new Map<string, string>([
    [
      'kingfisher.preferences',
      JSON.stringify({
        state: { companionUrl: 'http://127.0.0.1:4338', companionToken: 'stored-token' },
        version: 7,
      }),
    ],
  ]);
  const storage = {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key: string) => entries.get(key) ?? null,
    key: (index: number) => [...entries.keys()][index] ?? null,
    removeItem: (key: string) => void entries.delete(key),
    setItem: (key: string, value: string) => void entries.set(key, String(value)),
  };
  (globalThis as { localStorage?: Storage }).localStorage = storage;
});

import { companionConfig } from '@/companion/session';

import { usePreferences } from './preferences-store';

describe('the companion connection', () => {
  it('is configured before any component has rendered', () => {
    expect(companionConfig()).toEqual({ url: 'http://127.0.0.1:4338', token: 'stored-token' });
  });

  it('follows a new pairing, and an unpairing', () => {
    usePreferences.getState().set('companionToken', 'another');
    expect(companionConfig()).toEqual({ url: 'http://127.0.0.1:4338', token: 'another' });
    usePreferences.getState().set('companionUrl', '');
    expect(companionConfig()).toBeNull();
  });
});
