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
  setSidebarCollapsed(value: boolean): void;
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
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
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
    },
  ),
);
