'use client';

/**
 * Selecting a dock tool from outside the dock.
 *
 * The command palette and the keyboard shortcuts have to be able to say "show
 * the explorer" without knowing which workspace is on screen. Before the tool
 * dock existed they set `ui.rightTab`; the dock replaced that panel and
 * nothing ever read the value again, so the `D` shortcut and six palette
 * entries silently did nothing for a whole phase. They are all routed through
 * here now, so a future layout change breaks one function rather than eight
 * call sites that fail quietly.
 */

import type { WorkspaceToolId } from '@/stores/workspace-layout-store';
import { useWorkspaceLayout } from '@/stores/workspace-layout-store';

/** The dock's key for a pathname. Must match the table in WorkspaceToolDock. */
export function workspaceForPath(pathname: string): string {
  const segment = pathname.split('/')[1] ?? '';
  return segment === '' ? 'analysis' : segment;
}

/**
 * Show a tool in whichever workspace is on screen.
 *
 * Also un-collapses the dock: a request to show something that leaves it
 * hidden is the same dead control in a new costume.
 */
export function showTool(pathname: string, tool: WorkspaceToolId): void {
  const layout = useWorkspaceLayout.getState();
  layout.setToolDockCollapsed(false);
  layout.setActiveTool(workspaceForPath(pathname), tool);
}
