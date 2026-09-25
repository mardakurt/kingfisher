'use client';

/**
 * A page's unsubmitted fields, kept per tab (Phase 85).
 *
 * Phase 83's tabs bring back a tab's place (its address) and its board work.
 * A half-typed opponent name or a filter not yet applied lived only in the
 * page's React state, so leaving the tab and coming back threw it away — the
 * one thing a person switching between a preparation and an analysis to check
 * a line expects to find where they left it.
 *
 * `useTabField` is `useState` whose value is filed under the active tab, the
 * route **and its query**: coming back to the same place in the same tab
 * finds the value; arriving at a new query (a link to another player's
 * preparation) starts from what that address says. It is view state, like the
 * tab list: kept in `sessionStorage` for the window's life, never in a backup,
 * and forgotten when its tab is closed.
 */

import { useCallback, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { useTabs } from './tab-store';

interface TabFieldsState {
  values: Readonly<Record<string, unknown>>;
  set(key: string, value: unknown): void;
  /** Drop every field filed under this tab. */
  forgetTab(tabId: string): void;
}

const memoryStorage = (): Storage => {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, value),
  };
};

export const useTabFields = create<TabFieldsState>()(
  persist(
    (set) => ({
      values: {},
      set: (key, value) => set((state) => ({ values: { ...state.values, [key]: value } })),
      forgetTab: (tabId) =>
        set((state) => ({
          values: Object.fromEntries(
            Object.entries(state.values).filter(([key]) => !key.startsWith(`${tabId}|`)),
          ),
        })),
    }),
    {
      name: 'kingfisher.tab-fields',
      // Read after the page has mounted: the server rendered the initial values,
      // and a restored value on the first client render would not match it.
      skipHydration: true,
      storage: createJSONStorage(() => {
        try {
          return typeof sessionStorage === 'undefined' ? memoryStorage() : sessionStorage;
        } catch {
          return memoryStorage();
        }
      }),
    },
  ),
);

export const tabFieldKey = (tabId: string, place: string, field: string): string =>
  `${tabId}|${place}|${field}`;

/** `useState`, kept for the active tab at this address. */
export function useTabField<T>(
  field: string,
  initial: T,
): readonly [T, (next: T | ((previous: T) => T)) => void] {
  const tabId = useTabs((state) => state.activeId);
  const pathname = usePathname();
  // Not `useSearchParams`, which would need a Suspense boundary on every page using this.
  const query = typeof window === 'undefined' ? '' : window.location.search.slice(1);
  useEffect(() => {
    if (!useTabFields.persist.hasHydrated()) void useTabFields.persist.rehydrate();
  }, []);
  const key = tabFieldKey(tabId, `${pathname}${query ? `?${query}` : ''}`, field);
  const stored = useTabFields((state) => state.values[key]) as T | undefined;
  const value = stored === undefined ? initial : stored;
  const setValue = useCallback(
    (next: T | ((previous: T) => T)) => {
      const store = useTabFields.getState();
      const previous = (store.values[key] as T | undefined) ?? initial;
      store.set(key, typeof next === 'function' ? (next as (p: T) => T)(previous) : next);
    },
    // `initial` is read only when nothing is filed yet; a new initial is a new address.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  return [value, setValue] as const;
}

// A closed tab's fields go with it.
useTabs.subscribe((state, previous) => {
  if (state.tabs === previous.tabs) return;
  const open = new Set(state.tabs.map((tab) => tab.id));
  for (const tab of previous.tabs) {
    if (!open.has(tab.id)) useTabFields.getState().forgetTab(tab.id);
  }
});
