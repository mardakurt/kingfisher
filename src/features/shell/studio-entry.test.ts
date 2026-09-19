import { describe, expect, it } from 'vitest';

import {
  AUTO_OPEN_KEY,
  autoOpenStudio,
  hasVisitedStudio,
  landingEntryFor,
  markStudioVisited,
  setAutoOpenStudio,
  STUDIO_VISITED_KEY,
  studioAutoOpenScript,
  type KeyValueStore,
} from './studio-entry';

const memory = (): KeyValueStore & { readonly map: Map<string, string> } => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
};

/** `localStorage` in a private window: every access throws. */
const broken: KeyValueStore = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
  removeItem: () => {
    throw new Error('SecurityError');
  },
};

describe('studio entry', () => {
  it('a browser that has never opened the Studio gets the landing as published', () => {
    expect(landingEntryFor(memory(), '')).toEqual({ kind: 'first-visit' });
    expect(landingEntryFor(null, '')).toEqual({ kind: 'first-visit' });
  });

  it('the shell records the visit, and the landing then offers to continue', () => {
    const store = memory();
    markStudioVisited(store, new Date('2026-09-19T10:00:00Z'));
    expect(store.map.get(STUDIO_VISITED_KEY)).toBe('2026-09-19T10:00:00.000Z');
    expect(hasVisitedStudio(store)).toBe(true);
    expect(landingEntryFor(store, '')).toEqual({ kind: 'returning', autoOpen: false });
  });

  it('opting in skips the landing, and ?stay keeps it for one visit', () => {
    const store = memory();
    markStudioVisited(store);
    setAutoOpenStudio(store, true);
    expect(store.map.get(AUTO_OPEN_KEY)).toBe('1');
    expect(autoOpenStudio(store)).toBe(true);
    expect(landingEntryFor(store, '')).toEqual({ kind: 'open-studio' });
    expect(landingEntryFor(store, '?utm=x')).toEqual({ kind: 'open-studio' });
    // The way back: the landing, with the choice visible so it can be undone.
    expect(landingEntryFor(store, '?stay')).toEqual({ kind: 'returning', autoOpen: true });
    expect(landingEntryFor(store, '?stay=1&x=y')).toEqual({ kind: 'returning', autoOpen: true });
  });

  it('opting out removes the key rather than writing a second value', () => {
    const store = memory();
    markStudioVisited(store);
    setAutoOpenStudio(store, true);
    setAutoOpenStudio(store, false);
    expect(store.map.has(AUTO_OPEN_KEY)).toBe(false);
    expect(landingEntryFor(store, '')).toEqual({ kind: 'returning', autoOpen: false });
  });

  it('auto-open without a recorded visit never fires', () => {
    // The visit marker is what makes a browser a returning one; a stray
    // auto-open key on its own (cleared site data, a restored profile) must
    // not send a visitor who has not used the Studio into it.
    const store = memory();
    setAutoOpenStudio(store, true);
    expect(landingEntryFor(store, '')).toEqual({ kind: 'first-visit' });
  });

  it('storage that throws is a first visit, and writes are swallowed', () => {
    expect(() => markStudioVisited(broken)).not.toThrow();
    expect(() => setAutoOpenStudio(broken, true)).not.toThrow();
    expect(hasVisitedStudio(broken)).toBe(false);
    expect(autoOpenStudio(broken)).toBe(false);
    expect(landingEntryFor(broken, '')).toEqual({ kind: 'first-visit' });
  });
});

describe('the inline script agrees with the rule', () => {
  /** Run the script in a fake window and report whether it redirected. */
  const run = (store: KeyValueStore, search: string): string | null => {
    let replaced: string | null = null;
    const window = {
      localStorage: store,
      location: {
        search,
        replace: (url: string) => {
          replaced = url;
        },
      },
    };
    // The script names only `window`, `URLSearchParams` and `JSON`-safe
    // literals; a Function with `window` as its one parameter runs it.
    new Function('window', studioAutoOpenScript('/analysis'))(window);
    return replaced;
  };

  it('redirects exactly when landingEntryFor says open-studio', () => {
    const cases: readonly { store: KeyValueStore; search: string }[] = [
      { store: memory(), search: '' },
      {
        store: (() => {
          const s = memory();
          markStudioVisited(s);
          return s;
        })(),
        search: '',
      },
      {
        store: (() => {
          const s = memory();
          markStudioVisited(s);
          setAutoOpenStudio(s, true);
          return s;
        })(),
        search: '',
      },
      {
        store: (() => {
          const s = memory();
          markStudioVisited(s);
          setAutoOpenStudio(s, true);
          return s;
        })(),
        search: '?stay',
      },
      {
        store: (() => {
          const s = memory();
          setAutoOpenStudio(s, true);
          return s;
        })(),
        search: '',
      },
      { store: broken, search: '' },
    ];
    for (const { store, search } of cases) {
      const expected = landingEntryFor(store, search).kind === 'open-studio' ? '/analysis' : null;
      expect(run(store, search)).toBe(expected);
    }
  });

  it('never throws, even when storage does', () => {
    expect(() => run(broken, '')).not.toThrow();
  });
});
