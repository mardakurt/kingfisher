'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type WorkspacePreset =
  'analysis' | 'study' | 'opening-research' | 'preparation' | 'minimal-board';
export type WorkspaceToolId =
  | 'engine'
  | 'explorer'
  | 'database'
  | 'repertoire'
  | 'model-games'
  | 'personal-results'
  | 'features'
  | 'transpositions'
  | 'theory-radar'
  | 'calculation'
  | 'guess-the-move'
  | 'tablebase'
  | 'companion'
  | 'document'
  | 'notes';

interface WorkspaceLayoutState {
  sidebarCollapsed: boolean;
  toolDockCollapsed: boolean;
  toolDockWidth: number;
  preset: WorkspacePreset;
  /** Last tool per route; switching workspaces must not carry an unrelated tab. */
  activeTools: Record<string, WorkspaceToolId>;
  /** Legacy fallback retained for existing persisted version-1 layouts. */
  activeTool: WorkspaceToolId;
  /**
   * Everything except board, move tree and the selected tool is hidden.
   *
   * Not persisted, and not a preset. Focus is a thing you enter for twenty
   * minutes of hard analysis and leave; restoring it on next launch would
   * present a chrome-less application to somebody who has forgotten they
   * turned it on, with no obvious way out.
   */
  focusMode: boolean;
  /**
   * Denser chrome, so more of the window is board, tree and evidence.
   *
   * Persisted, because it is a standing preference about how somebody likes
   * their workstation rather than a mode. It reduces padding and chrome
   * height; it does not reduce text size or hit targets, which would trade
   * legibility for density and is the usual way "compact" goes wrong.
   */
  compact: boolean;
  setSidebarCollapsed(value: boolean): void;
  setFocusMode(value: boolean): void;
  setCompact(value: boolean): void;
  setToolDockCollapsed(value: boolean): void;
  setToolDockWidth(value: number): void;
  setPreset(value: WorkspacePreset): void;
  setActiveTool(workspace: string, value: WorkspaceToolId): void;
}

const PRESET_LAYOUTS: Record<
  WorkspacePreset,
  Pick<
    WorkspaceLayoutState,
    'sidebarCollapsed' | 'toolDockCollapsed' | 'toolDockWidth' | 'activeTool'
  >
> = {
  analysis: {
    sidebarCollapsed: false,
    toolDockCollapsed: false,
    toolDockWidth: 420,
    activeTool: 'engine',
  },
  study: {
    sidebarCollapsed: false,
    toolDockCollapsed: false,
    toolDockWidth: 440,
    activeTool: 'notes',
  },
  'opening-research': {
    sidebarCollapsed: false,
    toolDockCollapsed: false,
    toolDockWidth: 520,
    activeTool: 'explorer',
  },
  preparation: {
    sidebarCollapsed: false,
    toolDockCollapsed: false,
    toolDockWidth: 480,
    activeTool: 'database',
  },
  'minimal-board': {
    sidebarCollapsed: true,
    toolDockCollapsed: true,
    toolDockWidth: 420,
    activeTool: 'engine',
  },
};

export const useWorkspaceLayout = create<WorkspaceLayoutState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toolDockCollapsed: false,
      toolDockWidth: 420,
      preset: 'analysis',
      activeTools: {
        analysis: 'engine',
        studies: 'engine',
        repertoire: 'document',
        openings: 'explorer',
        games: 'engine',
        preparation: 'document',
      },
      activeTool: 'engine',
      focusMode: false,
      compact: false,
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setFocusMode: (focusMode) => set({ focusMode }),
      setCompact: (compact) => set({ compact }),
      setToolDockCollapsed: (toolDockCollapsed) => set({ toolDockCollapsed }),
      setToolDockWidth: (toolDockWidth) =>
        set({ toolDockWidth: Math.min(640, Math.max(320, Math.round(toolDockWidth))) }),
      setPreset: (preset) => set({ preset, ...PRESET_LAYOUTS[preset] }),
      setActiveTool: (workspace, activeTool) =>
        set((state) => ({
          activeTool,
          activeTools: { ...state.activeTools, [workspace]: activeTool },
        })),
    }),
    {
      name: 'kingfisher.workspace-layout',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      // Focus mode is deliberately excluded: see its declaration above.
      partialize: ({ focusMode: _focus, ...rest }) => rest,
    },
  ),
);
