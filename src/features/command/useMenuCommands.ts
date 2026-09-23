'use client';

import { useEffect, useRef } from 'react';

import { desktop } from '@/desktop/bridge';
import { usePreferences } from '@/stores/preferences-store';
import { useUi } from '@/stores/ui-store';
import { useWorkspaceLayout } from '@/stores/workspace-layout-store';

import { useCommands, type Command } from './useCommands';

/**
 * Commands the Mac menu asks for that are not rows in the palette: the palette
 * itself, the sidebar, the shortcuts sheet and the theme. Everything else the
 * menu sends is a palette command's own id.
 */
const INTERFACE_COMMANDS: Readonly<Record<string, () => void>> = {
  palette: () => useUi.getState().setCommandPaletteOpen(true),
  shortcuts: () => useUi.getState().setShortcutsOpen(true),
  'sidebar-toggle': () => {
    const layout = useWorkspaceLayout.getState();
    layout.setSidebarCollapsed(!layout.sidebarCollapsed);
  },
  'appearance-light': () => usePreferences.getState().set('theme', 'light'),
  'appearance-dark': () => usePreferences.getState().set('theme', 'dark'),
};

/** The ids the menu may send that are not palette commands. */
export const MENU_INTERFACE_COMMAND_IDS = Object.keys(INTERFACE_COMMANDS);

/**
 * Run the command a menu item names. The palette's own commands are the one
 * implementation of each action; the menu is another way to reach them.
 * Returns whether the id named anything.
 */
export function runMenuCommand(id: string, commands: readonly Command[]): boolean {
  const own = INTERFACE_COMMANDS[id];
  if (own) {
    own();
    return true;
  }
  const command = commands.find((candidate) => candidate.id === id);
  if (!command) return false;
  void command.run();
  return true;
}

/**
 * The Mac menu's application commands (Phase 84), received over the bridge.
 * Mounted once, in the shell; a browser has no bridge and no menu.
 */
export function useMenuCommands(): void {
  const commands = useCommands();
  const latest = useRef(commands);
  useEffect(() => {
    latest.current = commands;
  }, [commands]);

  useEffect(() => {
    const onMenuCommand = desktop()?.onMenuCommand;
    if (typeof onMenuCommand !== 'function') return;
    return onMenuCommand((id) => {
      if (!runMenuCommand(id, latest.current)) {
        useUi.getState().notify({
          tone: 'error',
          message: 'That menu command is not available here.',
          detail: id,
        });
      }
    });
  }, []);
}
