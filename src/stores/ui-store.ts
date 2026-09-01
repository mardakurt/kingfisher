'use client';

/**
 * Transient interface state: which panel is showing, what is open, what the
 * user was just told. None of it is worth persisting, and none of it belongs
 * in the analysis store, where a re-render for "the palette opened" would
 * invalidate board memoisation.
 */

import { create } from 'zustand';

export type RightPanelTab = 'engine' | 'explorer' | 'notes';
export type WorkspacePanelTab = 'moves' | RightPanelTab;
export type BottomPanelTab = 'moves' | 'headers';

export interface Notice {
  readonly id: string;
  readonly tone: 'info' | 'error' | 'success';
  readonly message: string;
  readonly detail?: string;
}

interface UiState {
  commandPaletteOpen: boolean;
  shortcutsOpen: boolean;
  settingsOpen: boolean;
  importOpen: boolean;
  sidebarOpen: boolean;
  rightTab: RightPanelTab;
  workspaceTab: WorkspacePanelTab;
  bottomTab: BottomPanelTab;
  notices: Notice[];

  setCommandPaletteOpen(open: boolean): void;
  toggleCommandPalette(): void;
  setShortcutsOpen(open: boolean): void;
  setSettingsOpen(open: boolean): void;
  setImportOpen(open: boolean): void;
  setSidebarOpen(open: boolean): void;
  setRightTab(tab: RightPanelTab): void;
  setWorkspaceTab(tab: WorkspacePanelTab): void;
  setBottomTab(tab: BottomPanelTab): void;
  notify(notice: Omit<Notice, 'id'>): void;
  dismiss(id: string): void;
}

let noticeId = 0;

export const useUi = create<UiState>((set) => ({
  commandPaletteOpen: false,
  shortcutsOpen: false,
  settingsOpen: false,
  importOpen: false,
  sidebarOpen: false,
  rightTab: 'engine',
  workspaceTab: 'moves',
  bottomTab: 'moves',
  notices: [],

  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
  toggleCommandPalette: () => set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setImportOpen: (importOpen) => set({ importOpen }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setRightTab: (rightTab) => set({ rightTab }),
  setWorkspaceTab: (workspaceTab) => set({ workspaceTab }),
  setBottomTab: (bottomTab) => set({ bottomTab }),

  notify: (notice) => {
    const id = `notice-${++noticeId}`;
    set((state) => ({ notices: [...state.notices, { ...notice, id }] }));
    // Errors stay until dismissed; confirmations get out of the way.
    if (notice.tone !== 'error') {
      setTimeout(() => {
        set((state) => ({ notices: state.notices.filter((item) => item.id !== id) }));
      }, 4000);
    }
  },
  dismiss: (id) => set((state) => ({ notices: state.notices.filter((item) => item.id !== id) })),
}));
