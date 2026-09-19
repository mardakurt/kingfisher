import { describe, expect, it } from 'vitest';

import {
  beginSession,
  HELD_KEY,
  releaseHeldDraft,
  SESSION_KEY,
  shouldHoldDraft,
  type SessionStore,
} from './session-launch';

const memory = (): SessionStore & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
};

describe('a fresh launch versus a reload', () => {
  it('the first start of a session is fresh, and marks the session', () => {
    const store = memory();
    expect(beginSession(store, new Date('2026-09-20T10:00:00Z'))).toBe(true);
    expect(store.map.get(SESSION_KEY)).toBe('2026-09-20T10:00:00.000Z');
  });

  it('a second start in the same session is a reload', () => {
    const store = memory();
    beginSession(store);
    expect(beginSession(store)).toBe(false);
    expect(beginSession(store)).toBe(false);
  });

  it('a store that is missing or throws counts as a fresh launch', () => {
    expect(beginSession(null)).toBe(true);
    const broken: SessionStore = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(beginSession(broken)).toBe(true);
  });
});

describe('holding the draft is a decision of the session', () => {
  it('a fresh launch holds it, and every later load of that session holds it too', () => {
    const store = memory();
    expect(shouldHoldDraft(store, beginSession(store))).toBe(true);
    expect(store.map.get(HELD_KEY)).toBe('1');
    // A second page load: not fresh any more, but the session still holds.
    expect(shouldHoldDraft(store, beginSession(store))).toBe(
      false || store.map.get(HELD_KEY) === '1',
    );
    expect(shouldHoldDraft(store, false)).toBe(true);
  });

  it('Continue releases it, so a reload of that session restores the work', () => {
    const store = memory();
    shouldHoldDraft(store, beginSession(store));
    releaseHeldDraft(store);
    expect(store.map.has(HELD_KEY)).toBe(false);
    expect(shouldHoldDraft(store, false)).toBe(false);
  });

  it('a session that never held (a reload of a working session) restores', () => {
    const store = memory();
    beginSession(store);
    expect(shouldHoldDraft(store, false)).toBe(false);
  });

  it('without storage the answer is per-load, and a fresh load still holds', () => {
    expect(shouldHoldDraft(null, true)).toBe(true);
    expect(shouldHoldDraft(null, false)).toBe(false);
  });
});
