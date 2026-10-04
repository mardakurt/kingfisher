import { describe, expect, it, vi } from 'vitest';

/*
  In the Mac application the pairing comes from the bridge, which the preload
  installs before any page script. It replaces a stale stored token before any
  query can be sent with it.
*/
vi.hoisted(() => {
  const entries = new Map<string, string>([
    [
      'kingfisher.preferences',
      JSON.stringify({
        state: { companionUrl: 'http://127.0.0.1:4338', companionToken: 'stale-token' },
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
  (globalThis as { window?: unknown }).window = {
    kingfisher: {
      platform: 'desktop',
      companion: { url: 'http://127.0.0.1:51234', token: 'launch-token' },
    },
  };
});

import { companionConfig } from '@/companion/session';

import { usePreferences } from './preferences-store';

describe('the companion connection in the Mac application', () => {
  it('is the bridge’s pairing before any component has rendered', () => {
    expect(companionConfig()).toEqual({ url: 'http://127.0.0.1:51234', token: 'launch-token' });
    expect(usePreferences.getState().companionToken).toBe('launch-token');
  });
});
