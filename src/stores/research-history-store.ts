'use client';

/**
 * Where you came from, so getting back is one action.
 *
 * Research is not a tree walk, it is a series of departures: repertoire →
 * model game → structure search → analysis → back to the repertoire. The
 * browser's own history is the wrong tool for that, because the interesting
 * part is not the URL — it is the *context*: which position, which filters,
 * which evidence source, which opponent. Coming back to `/repertoire` with all
 * of that reset is coming back to a different place.
 *
 * So this records departures explicitly. A route pushes an entry when it hands
 * off somewhere else, saying what it was showing; the destination offers "back
 * to …" with that label, and restoring puts the context back.
 *
 * Deliberately session-scoped and bounded. It is a convenience for the trail
 * being walked right now, not a document — persisting it would mean restoring
 * a week-old research context on startup, which is not what anybody wants, and
 * would raise a stale-position problem for no benefit.
 */

import { create } from 'zustand';

export interface ResearchStop {
  readonly id: string;
  /** Where to go back to. */
  readonly href: string;
  /** What the user will recognise: "Najdorf repertoire", "Carlsen preparation". */
  readonly label: string;
  /** The position that was on the board, when the route had one. */
  readonly fen?: string;
  /**
   * Anything the route needs to rebuild what the user was looking at.
   *
   * Opaque here on purpose: the history has no business understanding an
   * explorer filter set, and a typed union of every route's state would have
   * to change every time a route gains a control.
   */
  readonly context?: Readonly<Record<string, unknown>>;
  readonly at: number;
}

/** Long enough for a real research trail, short enough to stay a convenience. */
export const MAX_STOPS = 12;

interface ResearchHistoryState {
  readonly stops: readonly ResearchStop[];
  /** The stop a route consumed, so it can restore and clear in one pass. */
  push(stop: Omit<ResearchStop, 'id' | 'at'>, now?: number): void;
  /** The most recent stop, or null. What "← Back to …" reads from. */
  last(): ResearchStop | null;
  /** Remove and return the most recent stop. */
  pop(): ResearchStop | null;
  clear(): void;
}

export const useResearchHistory = create<ResearchHistoryState>((set, get) => ({
  stops: [],

  push: (stop, now = Date.now()) =>
    set((state) => {
      const entry: ResearchStop = { ...stop, id: `stop-${now}-${state.stops.length}`, at: now };
      /*
        Departing twice from the same place is one departure. Without this, a
        route that pushes on every hand-off fills the stack with copies of
        itself and "back" walks through six identical entries.
      */
      const withoutRepeat =
        state.stops.at(-1)?.href === entry.href && state.stops.at(-1)?.fen === entry.fen
          ? state.stops.slice(0, -1)
          : state.stops;
      return { stops: [...withoutRepeat, entry].slice(-MAX_STOPS) };
    }),

  last: () => get().stops.at(-1) ?? null,

  pop: () => {
    const stop = get().stops.at(-1) ?? null;
    if (stop) set((state) => ({ stops: state.stops.slice(0, -1) }));
    return stop;
  },

  clear: () => set({ stops: [] }),
}));

/**
 * Read a route's own context back off a stop.
 *
 * A tiny helper rather than a cast at each call site, so a route that changed
 * its context shape gets `undefined` instead of a value of the wrong type.
 */
export function stopContext<T>(stop: ResearchStop | null, key: string): T | undefined {
  const value = stop?.context?.[key];
  return value === undefined ? undefined : (value as T);
}
