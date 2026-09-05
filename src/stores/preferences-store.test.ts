import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
  The store is the real one; only the browser global it persists through is
  stubbed. It has to exist before the import below, because zustand resolves
  its storage when the module is evaluated — hence `vi.hoisted`, which runs
  ahead of the hoisted imports.
*/
vi.hoisted(() => {
  const entries = new Map<string, string>();
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

import { SETTING_CONTRACTS } from '@/features/shell/settings-contract';

import { DEFAULT_PREFERENCES, resolveAnimationMs, usePreferences } from './preferences-store';

/**
 * The store behind every setting, tested for the three things a settings
 * screen promises: a change sticks, a change survives a reload, and Reset
 * undoes all of it.
 *
 * Generated from `SETTING_CONTRACTS` rather than written out by hand, because
 * a hand-written list is a list that stops mentioning the setting somebody
 * added last week — which is exactly how a preference reaches a release with
 * no coverage at all.
 */

/** A value distinguishable from the default, for any preference's type. */
function differentFrom(value: unknown): unknown {
  if (typeof value === 'boolean') return !value;
  if (typeof value === 'number') return value + 7;
  if (typeof value === 'string') return `${value}-changed`;
  if (Array.isArray(value)) return [...value, 'kingfisher-test-entry'];
  if (value !== null && typeof value === 'object') {
    return { ...(value as object), 'kingfisher-test-key': true };
  }
  return 'kingfisher-test-value';
}

describe('preferences store', () => {
  beforeEach(() => {
    localStorage.clear();
    usePreferences.getState().reset();
  });

  it('starts every preference at its declared default', () => {
    const state = usePreferences.getState();
    for (const key of Object.keys(DEFAULT_PREFERENCES) as (keyof typeof DEFAULT_PREFERENCES)[]) {
      expect(state[key], key).toEqual(DEFAULT_PREFERENCES[key]);
    }
  });

  it('stores a change to every setting under contract', () => {
    for (const contract of SETTING_CONTRACTS) {
      const before = usePreferences.getState()[contract.key];
      const next = differentFrom(before);
      usePreferences.getState().set(contract.key, next as never);
      expect(usePreferences.getState()[contract.key], `${contract.key} did not change`).toEqual(
        next,
      );
    }
  });

  it('restores every setting to its default on reset', () => {
    /*
      Reset is the recovery path for a profile somebody has made unusable, so
      a preference it forgets is a preference the user cannot get back without
      clearing site data. Every key is changed first, so a reset that simply
      did nothing would fail here.
    */
    for (const contract of SETTING_CONTRACTS) {
      const before = usePreferences.getState()[contract.key];
      usePreferences.getState().set(contract.key, differentFrom(before) as never);
    }
    for (const contract of SETTING_CONTRACTS) {
      expect(usePreferences.getState()[contract.key]).not.toEqual(
        DEFAULT_PREFERENCES[contract.key],
      );
    }

    usePreferences.getState().reset();

    for (const contract of SETTING_CONTRACTS) {
      expect(usePreferences.getState()[contract.key], `${contract.key} survived reset`).toEqual(
        DEFAULT_PREFERENCES[contract.key],
      );
    }
  });

  it('writes every setting to storage, so it survives a reload', () => {
    for (const contract of SETTING_CONTRACTS) {
      const before = usePreferences.getState()[contract.key];
      usePreferences.getState().set(contract.key, differentFrom(before) as never);
    }
    // rehydrate() is what a reload does; persist writes synchronously here.
    const raw = localStorage.getItem('kingfisher.preferences');
    expect(raw, 'nothing was persisted at all').not.toBeNull();
    const persisted = JSON.parse(raw ?? '{}').state as Record<string, unknown>;

    const missing = SETTING_CONTRACTS.filter((contract) => !(contract.key in persisted)).map(
      (contract) => contract.key,
    );
    expect(missing, 'settings that would be lost on reload').toEqual([]);
  });

  it('keeps the Lichess token out of storage unless asked to remember it', () => {
    /*
      The one deliberate exception to the rule above, and the reason the test
      names it rather than letting it look like an omission.
    */
    usePreferences.getState().set('lichessToken', 'secret-token');
    usePreferences.getState().set('rememberLichessToken', false);
    const raw = localStorage.getItem('kingfisher.preferences') ?? '{}';
    expect(raw).not.toContain('secret-token');

    usePreferences.getState().set('rememberLichessToken', true);
    usePreferences.getState().set('lichessToken', 'secret-token');
    expect(localStorage.getItem('kingfisher.preferences') ?? '').toContain('secret-token');
  });
});

describe('resolveAnimationMs', () => {
  it('is zero when animation is off, whatever the system says', () => {
    expect(resolveAnimationMs('off')).toBe(0);
  });

  it('is shorter on fast than on normal', () => {
    expect(resolveAnimationMs('fast')).toBeLessThan(resolveAnimationMs('normal'));
    expect(resolveAnimationMs('fast')).toBeGreaterThan(0);
  });
});
