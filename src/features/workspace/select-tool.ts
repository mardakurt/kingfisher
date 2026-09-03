'use client';

/**
 * Selecting a workspace tool from outside the workspace.
 *
 * The command palette and the keyboard shortcuts have to be able to say "show
 * the explorer" without knowing which workspace is on screen, or which region
 * the user has since moved the explorer to. Before the tool dock existed they
 * set `ui.rightTab`; the dock replaced that panel and nothing ever read the
 * value again, so the `D` shortcut and six palette entries silently did
 * nothing for a whole phase. They are all routed through here, so a future
 * layout change breaks one function rather than eight call sites that fail
 * quietly.
 */

import { regionOf } from '@/features/workspace/layout-model';
import { toolsForWorkspace, WORKSPACE_MODULES } from '@/features/workspace/modules';
import type { WorkspaceToolId } from '@/features/workspace/modules';
import { useWorkspaceLayout, type DeviceClass } from '@/stores/workspace-layout-store';

/** The workspace key for a pathname. Must match the table in `modules.ts`. */
export function workspaceForPath(pathname: string): string {
  const segment = pathname.split('/')[1] ?? '';
  return segment === '' ? 'analysis' : segment;
}

/**
 * The device class, outside React.
 *
 * `useDeviceClass` cannot be called from a keydown handler, and the two must
 * agree or a shortcut writes to the arrangement the screen is not showing.
 * Both read the same media query for that reason.
 */
export function currentDeviceClass(): DeviceClass {
  if (typeof window === 'undefined') return 'desktop';
  return window.matchMedia('(min-width: 1100px)').matches ? 'desktop' : 'compact';
}

/**
 * Show a tool in whichever workspace is on screen.
 *
 * Selects it in the region it actually lives in — a user who moved the engine
 * to the lower panel and then pressed `E` should see the engine, not have the
 * dock silently select a tool that is not there. Also un-collapses the dock:
 * a request to show something that leaves it hidden is the same dead control
 * in a new costume.
 */
export function showTool(pathname: string, tool: WorkspaceToolId): void {
  const layout = useWorkspaceLayout.getState();
  const workspace = workspaceForPath(pathname);
  const device = currentDeviceClass();
  if (!toolsForWorkspace(workspace).includes(tool)) return;

  const arrangement = layout.arrangementFor(workspace, device);
  const region = regionOf(arrangement, tool, WORKSPACE_MODULES[tool].home);
  // On a narrow screen the lower panel is folded into the dock, so a tool
  // placed there is still shown by un-collapsing the dock.
  if (region === 'dock' || device === 'compact') {
    layout.setDockCollapsed(workspace, device, false);
  }
  layout.setActiveModule(workspace, device, device === 'compact' ? 'dock' : region, tool);
}
