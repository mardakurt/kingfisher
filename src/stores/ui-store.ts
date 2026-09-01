'use client';

/**
 * Transient interface state: which panel is showing, what is open, what the
 * user was just told. None of it is worth persisting, and none of it belongs
 * in the analysis store, where a re-render for "the palette opened" would
 * invalidate board memoisation.
 */

import { create } from 'zustand';

export type RightPanelTab = 'engine' | 'compare' | 'explorer' | 'features' | 'notes' | 'game';
export type WorkspacePanelTab = 'moves' | RightPanelTab;
export type BottomPanelTab = 'moves' | 'headers';

/** Where a move's context menu was summoned from, in viewport coordinates. */
export interface MoveMenuTarget {
  readonly nodeId: string;
  readonly x: number;
  readonly y: number;
}

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
  saveToStudyOpen: boolean;
  addToRepertoireOpen: boolean;
  trainingCaptureOpen: boolean;
  modelGameOpen: boolean;
  /** The move whose comment is being edited, or null. */
  commentingNodeId: string | null;
  /** The move whose context menu is open, with where to draw it. */
  moveMenu: MoveMenuTarget | null;
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
  setSaveToStudyOpen(open: boolean): void;
  setAddToRepertoireOpen(open: boolean): void;
  setTrainingCaptureOpen(open: boolean): void;
  setModelGameOpen(open: boolean): void;
  setCommentingNodeId(nodeId: string | null): void;
  setMoveMenu(target: MoveMenuTarget | null): void;
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
  saveToStudyOpen: false,
  addToRepertoireOpen: false,
  trainingCaptureOpen: false,
  modelGameOpen: false,
  commentingNodeId: null,
  moveMenu: null,
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
  setSaveToStudyOpen: (saveToStudyOpen) => set({ saveToStudyOpen }),
  setAddToRepertoireOpen: (addToRepertoireOpen) => set({ addToRepertoireOpen }),
  setTrainingCaptureOpen: (trainingCaptureOpen) => set({ trainingCaptureOpen }),
  setModelGameOpen: (modelGameOpen) => set({ modelGameOpen }),
  setCommentingNodeId: (commentingNodeId) => set({ commentingNodeId }),
  setMoveMenu: (moveMenu) => set({ moveMenu }),
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
