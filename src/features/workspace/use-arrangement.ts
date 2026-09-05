'use client';

import { useMemo } from 'react';

import { useMediaQuery } from '@/hooks/use-media-query';
import { useWorkspaceLayout, type DeviceClass } from '@/stores/workspace-layout-store';

import { usePreferences } from '@/stores/preferences-store';

import {
  activeInRegion,
  BOARD_PRIORITIES,
  DEFAULT_ARRANGEMENT,
  modulesInRegion,
  policyMoveTreeHome,
  regionOf,
  resolveArrangement,
  type BoardPriority,
  type ResolvedArrangement,
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

/**
 * A laptop, in the dimension that actually constrains a chessboard.
 *
 * The board on a 1280x720 screen is limited by height, not width, and by a
 * wide margin — so the notation panel's default is smaller there. 860px is
 * chosen so that 1440x900 (the commonest large laptop) is *not* short, and
 * 1366x768 and 1280x720 are.
 */
export const useShortScreen = (): boolean => !useMediaQuery('(min-height: 860px)');

export interface WorkspaceArrangementView {
  readonly device: DeviceClass;
  readonly wide: boolean;
  readonly priority: BoardPriority;
  /** The largest board the current policy will draw. */
  readonly maxBoard: number;
  readonly arrangement: ResolvedArrangement;
  readonly available: readonly { readonly id: WorkspaceModuleId; readonly home: WorkspaceRegion }[];
  readonly dockModules: readonly WorkspaceModuleId[];
  readonly lowerModules: readonly WorkspaceModuleId[];
  readonly activeDock: WorkspaceModuleId | null;
  readonly activeLower: WorkspaceModuleId | null;
  /**
   * Modules the compact layout folded in from the lower region.
   *
   * They stay visible in the tab strip rather than being pushed into More: on
   * a desktop they had a panel of their own, and demoting the move tree to a
   * menu entry because the screen got narrower loses it exactly where it is
   * hardest to find again.
   */
  readonly foldedFromLower: readonly WorkspaceModuleId[];
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
  const shortScreen = useShortScreen();
  const priority = usePreferences((state) => state.boardPriority);
  const stored = useWorkspaceLayout((state) => state.arrangements[`${device}:${workspace}`]);
  /*
    A stored arrangement wins only where it actually says something. It records
    what the user did — which tab is selected, where a module was dragged, a
    width they set by hand — and is silent about everything else, so the board
    policy still governs the dimensions nobody chose.

    The alternative, which this replaced, was to let any stored arrangement
    override the policy wholesale. Selecting a tool tab writes an arrangement,
    so a single click on Engine froze that workspace's dock width and notation
    height at the policy in force at that moment, and Board priority never
    moved anything again.
  */
  const arrangement = resolveArrangement(stored ?? DEFAULT_ARRANGEMENT, priority, shortScreen);
  const withMoveTree = options.withMoveTree ?? false;

  return useMemo(() => {
    const available = [
      ...toolsForWorkspace(workspace).map((id) => ({
        id: id as WorkspaceModuleId,
        home: WORKSPACE_MODULES[id].home,
      })),
      /*
        The notation panel's home is the policy's, not the module table's:
        Maximum folds it into the dock, and that is most of the difference
        between Maximum and Large.
      */
      ...(withMoveTree
        ? [{ id: MOVE_TREE_MODULE.id as WorkspaceModuleId, home: policyMoveTreeHome(priority) }]
        : []),
    ];
    /*
      On a narrow screen the lower panel and the dock are the same bottom
      sheet, so everything placed in either is folded into one list. This is
      §9's rule made concrete: the phone honours *what* the user chose to have
      available without pretending it has room for the desktop's geometry.
    */
    const inLower = modulesInRegion(arrangement, available, 'lower');
    const dockModules = wide
      ? modulesInRegion(arrangement, available, 'dock')
      : [...modulesInRegion(arrangement, available, 'dock'), ...inLower];
    const lowerModules = wide ? inLower : [];

    return {
      device,
      wide,
      priority,
      maxBoard: BOARD_PRIORITIES[priority].maxBoard,
      arrangement,
      available,
      dockModules,
      lowerModules,
      foldedFromLower: wide ? [] : inLower,
      activeDock: activeInRegion(arrangement, dockModules, 'dock'),
      activeLower: activeInRegion(arrangement, lowerModules, 'lower'),
      moveTreeInPrimary:
        !withMoveTree ||
        regionOf(arrangement, MOVE_TREE_MODULE.id, policyMoveTreeHome(priority)) === 'primary',
    };
  }, [arrangement, device, priority, wide, withMoveTree, workspace]);
}
