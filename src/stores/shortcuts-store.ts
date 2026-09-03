'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Binding } from '@/features/command/bindings';
import { DEFAULT_BINDINGS, REBINDABLE_SHORTCUTS } from '@/features/command/shortcuts';

interface ShortcutsState {
  /** Overrides only. An action absent here uses its default binding. */
  overrides: Readonly<Record<string, Binding>>;
  setBinding(action: string, binding: Binding): void;
  resetBinding(action: string): void;
  resetAll(): void;
  /** Defaults merged with overrides — what the handler actually resolves against. */
  bindings(): Readonly<Record<string, Binding>>;
  replaceAll(overrides: Readonly<Record<string, Binding>>): void;
}

/** Overrides for actions this build still has, with plausible bindings. */
function sanitise(raw: unknown): Record<string, Binding> {
  if (raw === null || typeof raw !== 'object') return {};
  const known = new Set(REBINDABLE_SHORTCUTS.map((shortcut) => shortcut.id));
  const result: Record<string, Binding> = {};
  for (const [action, binding] of Object.entries(raw as Record<string, unknown>)) {
    if (!known.has(action)) continue;
    if (typeof binding !== 'string' || binding === '' || binding.length > 24) continue;
    result[action] = binding;
  }
  return result;
}

export const useShortcuts = create<ShortcutsState>()(
  persist(
    (set, get) => ({
      overrides: {},
      setBinding: (action, binding) =>
        set((state) => ({ overrides: { ...state.overrides, [action]: binding } })),
      resetBinding: (action) =>
        set((state) => {
          const { [action]: _removed, ...rest } = state.overrides;
          return { overrides: rest };
        }),
      resetAll: () => set({ overrides: {} }),
      bindings: () => ({ ...DEFAULT_BINDINGS, ...get().overrides }),
      replaceAll: (overrides) => set({ overrides: sanitise(overrides) }),
    }),
    {
      name: 'kingfisher.shortcuts',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      /*
        §34: a stored override naming an action this build no longer has, or
        holding something that is not a key description, must not reach the
        handler. Dropping it here means a preference file damaged across
        versions costs the user that binding rather than their keyboard.
      */
      migrate: (persisted) => ({
        overrides: sanitise((persisted as { overrides?: unknown } | null)?.overrides),
      }),
      merge: (persisted, current) => ({
        ...current,
        overrides: sanitise((persisted as { overrides?: unknown } | null)?.overrides),
      }),
    },
  ),
);
