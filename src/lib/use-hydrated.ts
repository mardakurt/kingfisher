'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * False while the server renders and while the page hydrates, true after.
 *
 * For a component whose first render depends on what only the browser knows
 * — a query cache, a registry filled from IndexedDB or the companion — and
 * which hydrates inside a Suspense boundary, late enough for that state to
 * exist: rendering it then would differ from the server's HTML.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
