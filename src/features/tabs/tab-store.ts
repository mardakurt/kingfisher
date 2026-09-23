'use client';

/**
 * The tab list, as view state.
 *
 * Only the list lives here — ids, places, titles, order, which is active.
 * An inactive tab's board work is in the `drafts` store, where backups find
 * it; see `docs/design/workspace-tabs.md`.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  activate,
  adoptOrphans,
  closeTab,
  moveTab,
  openTab,
  sanitizeTabs,
  updateTab,
  type TabsState,
  type WorkspaceTab,
} from './tab-model';

interface TabStore extends TabsState {
  /** False until the list has been read back and reconciled with the page. */
  ready: boolean;
  /** A title the current route published with `useTabTitle`. Not persisted. */
  published: string | null;
  /** A close waiting for the person to confirm it would discard work. */
  pendingClose: { readonly id: string; readonly reason: string } | null;
  /** True while a switch is capturing one tab and restoring another. */
  switching: boolean;

  init(state: TabsState): void;
  apply(next: (state: TabsState) => TabsState): void;
  open(tab: WorkspaceTab): void;
  close(id: string): void;
  activate(id: string): void;
  update(id: string, patch: Partial<Omit<WorkspaceTab, 'id'>>): void;
  move(id: string, to: number): void;
  adopt(orphans: readonly { readonly id: string; readonly title: string }[]): void;
  publish(title: string | null): void;
  askToClose(pending: TabStore['pendingClose']): void;
  setSwitching(value: boolean): void;
}

const lift =
  (next: (state: TabsState) => TabsState) =>
  (state: TabStore): Partial<TabStore> => {
    const result = next({ tabs: state.tabs, activeId: state.activeId });
    return result.tabs === state.tabs && result.activeId === state.activeId ? {} : result;
  };

export const useTabs = create<TabStore>()(
  persist(
    (set) => ({
      tabs: [],
      activeId: '',
      ready: false,
      published: null,
      pendingClose: null,
      switching: false,

      init: (state) => set({ ...state, ready: true }),
      apply: (next) => set(lift(next)),
      open: (tab) => set(lift((state) => openTab(state, tab))),
      close: (id) => set(lift((state) => closeTab(state, id))),
      activate: (id) => set(lift((state) => activate(state, id))),
      update: (id, patch) => set(lift((state) => updateTab(state, id, patch))),
      move: (id, to) => set(lift((state) => moveTab(state, id, to))),
      adopt: (orphans) => set(lift((state) => adoptOrphans(state, orphans))),
      publish: (title) => set({ published: title }),
      askToClose: (pendingClose) => set({ pendingClose }),
      setSwitching: (switching) => set({ switching }),
    }),
    {
      name: 'kingfisher.workspace-tabs',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ tabs, activeId }) => ({ tabs, activeId }),
      // What comes back is checked, not trusted; `init` runs the check.
      merge: (persisted, current) => {
        const sane = sanitizeTabs(persisted);
        return sane ? { ...current, ...sane } : current;
      },
    },
  ),
);
