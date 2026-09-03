'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  clampDockWidth,
  clampLowerHeight,
  DEFAULT_ARRANGEMENT,
  moveModule,
  type WorkspaceArrangement,
  type WorkspaceModuleId,
  type WorkspaceRegion,
} from '@/features/workspace/layout-model';
import {
  DEFAULT_PINNED_TOOLS,
  PRESET_ARRANGEMENTS,
  WORKSPACE_PRESETS,
  type WorkspacePreset,
} from '@/features/workspace/presets';
import type { WorkspaceToolId } from '@/features/workspace/modules';
import { debouncedStorage } from '@/lib/debounced-storage';

export type { WorkspaceToolId } from '@/features/workspace/modules';
export type { WorkspacePreset } from '@/features/workspace/presets';

/**
 * A layout the user saved and named.
 *
 * It stores arrangement only — never which study was open or which position
 * the board was on. "Tournament Prep" is a shape of workspace, and restoring
 * it should not drag last month's document back onto the screen with it.
 */
export interface SavedLayout {
  readonly id: string;
  readonly name: string;
  readonly arrangement: WorkspaceArrangement;
}

/**
 * Layouts are stored per device class, not per pixel width.
 *
 * A phone cannot honour a three-region desktop arrangement and should not try:
 * §9's rule is that the desktop layout must not corrupt the mobile one. Two
 * buckets is enough — the difference that matters is "is there room for a
 * side dock at all", and inventing a tablet variant would just give the user a
 * third arrangement to keep in sync by hand.
 */
export type DeviceClass = 'desktop' | 'compact';

interface WorkspaceLayoutState {
  sidebarCollapsed: boolean;
  preset: WorkspacePreset;
  /** Arrangements keyed `${device}:${workspace}`. */
  arrangements: Record<string, WorkspaceArrangement>;
  savedLayouts: readonly SavedLayout[];
  /** Tools kept permanently visible in the tab strip, per workspace. */
  pinnedTools: Record<string, readonly WorkspaceToolId[]>;
  focusMode: boolean;
  compact: boolean;
  setSidebarCollapsed(value: boolean): void;
  setFocusMode(value: boolean): void;
  setCompact(value: boolean): void;
  setPreset(workspace: string, device: DeviceClass, value: WorkspacePreset): void;
  arrangementFor(workspace: string, device: DeviceClass): WorkspaceArrangement;
  updateArrangement(
    workspace: string,
    device: DeviceClass,
    change: (current: WorkspaceArrangement) => WorkspaceArrangement,
  ): void;
  setActiveModule(
    workspace: string,
    device: DeviceClass,
    region: WorkspaceRegion,
    module: WorkspaceModuleId,
  ): void;
  moveModuleTo(
    workspace: string,
    device: DeviceClass,
    module: WorkspaceModuleId,
    region: WorkspaceRegion,
  ): void;
  setDockWidth(workspace: string, device: DeviceClass, value: number): void;
  setLowerHeight(workspace: string, device: DeviceClass, value: number): void;
  setDockCollapsed(workspace: string, device: DeviceClass, value: boolean): void;
  resetWorkspace(workspace: string, device: DeviceClass): void;
  resetAllLayouts(): void;
  saveLayout(name: string, workspace: string, device: DeviceClass): void;
  applyLayout(id: string, workspace: string, device: DeviceClass): void;
  deleteLayout(id: string): void;
  togglePinned(workspace: string, tool: WorkspaceToolId): void;
  pinnedFor(workspace: string): readonly WorkspaceToolId[];
}

const key = (workspace: string, device: DeviceClass) => `${device}:${workspace}`;

export const useWorkspaceLayout = create<WorkspaceLayoutState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      preset: 'analysis',
      arrangements: {},
      savedLayouts: [],
      pinnedTools: {},
      focusMode: false,
      compact: false,

      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setFocusMode: (focusMode) => set({ focusMode }),
      setCompact: (compact) => set({ compact }),

      arrangementFor: (workspace, device) =>
        get().arrangements[key(workspace, device)] ?? DEFAULT_ARRANGEMENT,

      updateArrangement: (workspace, device, change) =>
        set((state) => {
          const id = key(workspace, device);
          const current = state.arrangements[id] ?? DEFAULT_ARRANGEMENT;
          return { arrangements: { ...state.arrangements, [id]: change(current) } };
        }),

      setPreset: (workspace, device, preset) =>
        set((state) => ({
          preset,
          arrangements: {
            ...state.arrangements,
            [key(workspace, device)]: PRESET_ARRANGEMENTS[preset],
          },
        })),

      setActiveModule: (workspace, device, region, module) =>
        get().updateArrangement(workspace, device, (current) => ({
          ...current,
          active: { ...current.active, [region]: module },
        })),

      moveModuleTo: (workspace, device, module, region) =>
        get().updateArrangement(workspace, device, (current) =>
          moveModule(current, module, region),
        ),

      setDockWidth: (workspace, device, value) =>
        get().updateArrangement(workspace, device, (current) => ({
          ...current,
          dockWidth: clampDockWidth(value),
        })),

      setLowerHeight: (workspace, device, value) =>
        get().updateArrangement(workspace, device, (current) => ({
          ...current,
          lowerHeight: clampLowerHeight(value),
        })),

      setDockCollapsed: (workspace, device, value) =>
        get().updateArrangement(workspace, device, (current) => ({
          ...current,
          dockCollapsed: value,
        })),

      /*
        Reset removes the entry rather than writing the default into it, so a
        workspace the user has never touched and one they have reset are the
        same thing. Storing an explicit "this is the default" record is how
        saved layouts start silently pinning themselves to an old default.
      */
      resetWorkspace: (workspace, device) =>
        set((state) => {
          const { [key(workspace, device)]: _removed, ...rest } = state.arrangements;
          return { arrangements: rest };
        }),

      resetAllLayouts: () => set({ arrangements: {}, pinnedTools: {}, preset: 'analysis' }),

      saveLayout: (name, workspace, device) =>
        set((state) => {
          const arrangement = state.arrangements[key(workspace, device)] ?? DEFAULT_ARRANGEMENT;
          const trimmed = name.trim();
          if (trimmed === '') return state;
          // Saving over an existing name replaces it: the alternative is a
          // list of six layouts called "Tournament Prep".
          const existing = state.savedLayouts.find(
            (entry) => entry.name.toLowerCase() === trimmed.toLowerCase(),
          );
          const entry: SavedLayout = {
            id: existing?.id ?? `layout-${Date.now().toString(36)}`,
            name: trimmed,
            arrangement,
          };
          return {
            savedLayouts: existing
              ? state.savedLayouts.map((item) => (item.id === existing.id ? entry : item))
              : [...state.savedLayouts, entry],
          };
        }),

      applyLayout: (id, workspace, device) =>
        set((state) => {
          const layout = state.savedLayouts.find((entry) => entry.id === id);
          if (!layout) return state;
          return {
            arrangements: {
              ...state.arrangements,
              [key(workspace, device)]: layout.arrangement,
            },
          };
        }),

      deleteLayout: (id) =>
        set((state) => ({
          savedLayouts: state.savedLayouts.filter((entry) => entry.id !== id),
        })),

      togglePinned: (workspace, tool) =>
        set((state) => {
          const current = state.pinnedTools[workspace] ?? DEFAULT_PINNED_TOOLS;
          const next = current.includes(tool)
            ? current.filter((entry) => entry !== tool)
            : [...current, tool];
          return { pinnedTools: { ...state.pinnedTools, [workspace]: next } };
        }),

      pinnedFor: (workspace) => get().pinnedTools[workspace] ?? DEFAULT_PINNED_TOOLS,
    }),
    {
      name: 'kingfisher.workspace-layout',
      version: 3,
      /*
        Debounced, because §60's complaint is real: the old resize handler
        called `setToolDockWidth` on every pointermove, and zustand's persist
        middleware serialises the whole store and writes localStorage
        synchronously on every set. Dragging a panel across the screen was
        several hundred synchronous JSON writes on the pointer thread.
      */
      storage: createJSONStorage(() => debouncedStorage(250)),
      /**
       * Version 2 stored one global dock width, one collapsed flag and a map
       * of active tool per route. All three have equivalents here, so they are
       * carried across rather than dropped: making every user re-arrange every
       * workspace after an update is exactly the failure §35 names.
       */
      migrate: (persisted, version) => {
        if (persisted === null || typeof persisted !== 'object') return persisted;
        const state = persisted as Record<string, unknown>;
        if (version >= 3) return state;

        const width = typeof state.toolDockWidth === 'number' ? state.toolDockWidth : 420;
        const collapsed = state.toolDockCollapsed === true;
        const activeTools = (state.activeTools ?? {}) as Record<string, string>;
        const arrangements: Record<string, WorkspaceArrangement> = {};
        for (const [workspace, tool] of Object.entries(activeTools)) {
          arrangements[key(workspace, 'desktop')] = {
            ...DEFAULT_ARRANGEMENT,
            dockWidth: clampDockWidth(width),
            dockCollapsed: collapsed,
            active: { dock: tool as WorkspaceModuleId },
          };
        }
        return {
          sidebarCollapsed: state.sidebarCollapsed === true,
          compact: state.compact === true,
          preset: WORKSPACE_PRESETS.some((entry) => entry.id === state.preset)
            ? (state.preset as WorkspacePreset)
            : 'analysis',
          arrangements,
          savedLayouts: [],
          pinnedTools: {},
        };
      },
      // Focus mode is deliberately excluded: it is a thing you enter for
      // twenty minutes of hard analysis and leave, and restoring it on next
      // launch presents a chrome-less application to somebody who has
      // forgotten they turned it on.
      partialize: ({ focusMode: _focus, ...rest }) => rest,
    },
  ),
);
