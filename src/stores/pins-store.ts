'use client';

/**
 * The handful of things a player keeps coming back to.
 *
 * Its own store rather than a field on preferences: preferences describe how
 * the application looks and behaves, and a list of entity ids that must stay in
 * step with what IndexedDB actually holds is a different kind of thing. Keeping
 * them apart means resetting appearance never drops someone's pins, and a pin
 * pointing at a deleted study is a display problem rather than a corrupt
 * preferences blob.
 *
 * Deliberately flat and capped. Folders, tags and ordering are a
 * project-management system; this is a shortcut list.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type PinKind = 'study' | 'repertoire' | 'game';

export interface Pin {
  readonly kind: PinKind;
  readonly id: string;
  readonly pinnedAt: number;
}

/** Past this it stops being a shortcut list and becomes another thing to manage. */
const MAX_PINS = 12;

interface PinsState {
  pins: readonly Pin[];
  toggle(kind: PinKind, id: string): void;
  isPinned(kind: PinKind, id: string): boolean;
  /** Drop pins whose target no longer exists, after a scan or a delete. */
  retain(existing: (pin: Pin) => boolean): void;
}

export const usePins = create<PinsState>()(
  persist(
    (set, get) => ({
      pins: [],

      toggle: (kind, id) =>
        set((state) => {
          const without = state.pins.filter((pin) => !(pin.kind === kind && pin.id === id));
          if (without.length !== state.pins.length) return { pins: without };
          // Newest first, and the oldest falls off the end rather than the pin
          // being refused — a cap the user has to clear by hand is a nuisance.
          return { pins: [{ kind, id, pinnedAt: Date.now() }, ...without].slice(0, MAX_PINS) };
        }),

      isPinned: (kind, id) => get().pins.some((pin) => pin.kind === kind && pin.id === id),

      retain: (existing) => set((state) => ({ pins: state.pins.filter(existing) })),
    }),
    {
      name: 'kingfisher.pins',
      version: 1,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export const pinnedIds = (pins: readonly Pin[], kind: PinKind): readonly string[] =>
  pins.filter((pin) => pin.kind === kind).map((pin) => pin.id);
