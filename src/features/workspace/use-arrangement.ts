'use client';

import { useMemo } from 'react';

import { useMediaQuery } from '@/hooks/use-media-query';
import { useWorkspaceLayout, type DeviceClass } from '@/stores/workspace-layout-store';

import {
  activeInRegion,
  DEFAULT_ARRANGEMENT as DEFAULTS,
  modulesInRegion,
  regionOf,
  type WorkspaceArrangement,
  type WorkspaceModuleId,
  type WorkspaceRegion,
} from './layout-model';
import { MOVE_TREE_MODULE, toolsForWorkspace, WORKSPACE_MODULES } from './modules';

/**
 * Whether this screen can hold a side dock at all.
 *
 * The same breakpoint the dock has always used to decide between a right-hand
 * column and a bottom sheet. Reusing it as the device class means a layout is
 * saved under the shape it was actually arranged in, so rotating a tablet
 * cannot write a phone-shaped arrangement over a desktop one.
 */
export function useDeviceClass(): DeviceClass {
  return useMediaQuery('(min-width: 1100px)') ? 'desktop' : 'compact';
}

export interface WorkspaceArrangementView {
  readonly device: DeviceClass;
  readonly wide: boolean;
  readonly arrangement: WorkspaceArrangement;
  readonly available: readonly { readonly id: WorkspaceModuleId; readonly home: WorkspaceRegion }[];
  readonly dockModules: readonly WorkspaceModuleId[];
  readonly lowerModules: readonly WorkspaceModuleId[];
  readonly activeDock: WorkspaceModuleId | null;
  readonly activeLower: WorkspaceModuleId | null;
  readonly moveTreeInPrimary: boolean;
}

/**
 * Everything a workspace needs to know about its own arrangement.
 *
 * Both the dock and the lower panel read this, so the two can never disagree
 * about where a module lives — which is the failure mode a second copy of
 * this resolution logic would guarantee.
 */
export function useWorkspaceArrangement(
  workspace: string,
  options: { readonly withMoveTree?: boolean } = {},
): WorkspaceArrangementView {
  const device = useDeviceClass();
  const wide = device === 'desktop';
  const arrangement = useWorkspaceLayout(
    (state) => state.arrangements[`${device}:${workspace}`] ?? DEFAULTS,
  );
  const withMoveTree = options.withMoveTree ?? false;

  return useMemo(() => {
    const available = [
      ...toolsForWorkspace(workspace).map((id) => ({
        id: id as WorkspaceModuleId,
        home: WORKSPACE_MODULES[id].home,
      })),
      ...(withMoveTree
        ? [{ id: MOVE_TREE_MODULE.id as WorkspaceModuleId, home: MOVE_TREE_MODULE.home }]
        : []),
    ];
    /*
      On a narrow screen the lower panel and the dock are the same bottom
      sheet, so everything placed in either is folded into one list. This is
      §9's rule made concrete: the phone honours *what* the user chose to have
      available without pretending it has room for the desktop's geometry.
    */
    const dockModules = wide
      ? modulesInRegion(arrangement, available, 'dock')
      : [
          ...modulesInRegion(arrangement, available, 'dock'),
          ...modulesInRegion(arrangement, available, 'lower'),
        ];
    const lowerModules = wide ? modulesInRegion(arrangement, available, 'lower') : [];

    return {
      device,
      wide,
      arrangement,
      available,
      dockModules,
      lowerModules,
      activeDock: activeInRegion(arrangement, dockModules, 'dock'),
      activeLower: activeInRegion(arrangement, lowerModules, 'lower'),
      moveTreeInPrimary:
        !withMoveTree ||
        regionOf(arrangement, MOVE_TREE_MODULE.id, MOVE_TREE_MODULE.home) === 'primary',
    };
  }, [arrangement, device, wide, withMoveTree, workspace]);
}
