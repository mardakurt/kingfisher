/**
 * How a returning player gets from the public origin into the Studio.
 *
 * One origin serves two surfaces: the landing at `/` for someone who has
 * never seen Kingfisher, and the application at `/analysis` and the other
 * routes for someone who uses it. The landing is what the origin answers
 * with, which is right for the first visit and wrong for the hundredth: a
 * player who types the address is reading marketing copy on the way to
 * their own repertoire.
 *
 * There is no account and therefore nothing server-side to remember a
 * visitor by, and the landing is deliberately static so that it stays fast
 * and indexable. What there is, is the browser: the Studio keeps its work
 * in IndexedDB and `localStorage` on this origin, so "has this browser used
 * the Studio?" is a question `localStorage` can answer on the landing
 * itself. Two keys, both this browser's business and nobody else's:
 *
 *  - `STUDIO_VISITED_KEY` is written by the application shell every time
 *    it mounts. Its presence is what makes a visitor a *returning* one, and
 *    the landing answers it with a "continue" affordance instead of the
 *    tour.
 *  - `AUTO_OPEN_KEY` is a choice the visitor makes on the landing: open the
 *    Studio straight away next time. It is off until they turn it on. With
 *    it on, the landing sends them to the Studio before it has finished
 *    painting, with `location.replace` so the landing does not sit in the
 *    history as a page the back button returns to and re-redirects from.
 *
 * `?stay` on the landing URL turns the redirect off for that visit. It is
 * the way back to the landing for somebody who has opted in — the Studio
 * links to it — and the place where the choice can be undone.
 *
 * A search engine's crawler has no `localStorage`, so it sees the landing
 * exactly as a first-time visitor does, which is what the index should hold.
 * The Mac application never loads the landing; its window opens on
 * `/analysis` (see `desktop/src/main.mjs`).
 */

export const STUDIO_VISITED_KEY = 'kingfisher.studio.visited';
export const AUTO_OPEN_KEY = 'kingfisher.landing.auto-open-studio';
/** The query parameter that keeps a visitor on the landing whatever they chose. */
export const STAY_PARAM = 'stay';

/** The slice of `Storage` this module uses; `localStorage` satisfies it. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Recorded by the application shell on mount. Never throws: storage may be unavailable. */
export function markStudioVisited(store: KeyValueStore | null, now: Date = new Date()): void {
  try {
    store?.setItem(STUDIO_VISITED_KEY, now.toISOString());
  } catch {
    /* Private mode or a full quota: the landing simply treats the next visit as the first. */
  }
}

export function hasVisitedStudio(store: KeyValueStore | null): boolean {
  try {
    return Boolean(store?.getItem(STUDIO_VISITED_KEY));
  } catch {
    return false;
  }
}

export function autoOpenStudio(store: KeyValueStore | null): boolean {
  try {
    return store?.getItem(AUTO_OPEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function setAutoOpenStudio(store: KeyValueStore | null, on: boolean): void {
  try {
    if (on) store?.setItem(AUTO_OPEN_KEY, '1');
    else store?.removeItem(AUTO_OPEN_KEY);
  } catch {
    /* Nothing to do: the choice is a convenience, not work. */
  }
}

export type LandingEntry =
  /** A browser that has never opened the Studio: the landing, as published. */
  | { readonly kind: 'first-visit' }
  /** A browser that has: the landing, with a way to continue where they were. */
  | { readonly kind: 'returning'; readonly autoOpen: boolean }
  /** A browser whose owner asked to skip the landing: go, before it paints. */
  | { readonly kind: 'open-studio' };

/**
 * What the landing should do for this browser. Pure, so the rule is tested
 * without a DOM: `search` is `location.search`, `store` is `localStorage`.
 */
export function landingEntryFor(store: KeyValueStore | null, search: string): LandingEntry {
  if (!hasVisitedStudio(store)) return { kind: 'first-visit' };
  const stay = new URLSearchParams(search).has(STAY_PARAM);
  const autoOpen = autoOpenStudio(store);
  if (autoOpen && !stay) return { kind: 'open-studio' };
  return { kind: 'returning', autoOpen };
}
