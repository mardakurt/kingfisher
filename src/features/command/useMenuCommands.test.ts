import { vi } from 'vitest';

import { usePreferences } from '@/stores/preferences-store';
import { useUi } from '@/stores/ui-store';
import { useWorkspaceLayout } from '@/stores/workspace-layout-store';

import { runMenuCommand } from './useMenuCommands';
import type { Command } from './useCommands';

vi.mock('next/navigation', () => ({ useRouter: () => ({}), usePathname: () => '/' }));

const command = (id: string, run = vi.fn()): Command => ({ id, title: id, group: 'Test', run });

describe('a Mac menu command reaches the one implementation', () => {
  it('runs the palette command of that id and nothing else', () => {
    const newTab = command('tab-new');
    const close = command('tab-close');
    expect(runMenuCommand('tab-new', [newTab, close])).toBe(true);
    expect(newTab.run).toHaveBeenCalledOnce();
    expect(close.run).not.toHaveBeenCalled();
  });

  it('says so when an id names nothing', () => {
    expect(runMenuCommand('no-such-command', [command('tab-new')])).toBe(false);
  });

  it('opens the palette and the shortcuts, which are not rows in it', () => {
    useUi.getState().setCommandPaletteOpen(false);
    expect(runMenuCommand('palette', [])).toBe(true);
    expect(useUi.getState().commandPaletteOpen).toBe(true);
    expect(runMenuCommand('shortcuts', [])).toBe(true);
    expect(useUi.getState().shortcutsOpen).toBe(true);
  });

  it('toggles the sidebar both ways', () => {
    useWorkspaceLayout.getState().setSidebarCollapsed(false);
    runMenuCommand('sidebar-toggle', []);
    expect(useWorkspaceLayout.getState().sidebarCollapsed).toBe(true);
    runMenuCommand('sidebar-toggle', []);
    expect(useWorkspaceLayout.getState().sidebarCollapsed).toBe(false);
  });

  it('sets the theme the Appearance menu asks for, in the preference itself', () => {
    runMenuCommand('appearance-dark', []);
    expect(usePreferences.getState().theme).toBe('dark');
    runMenuCommand('appearance-light', []);
    expect(usePreferences.getState().theme).toBe('light');
  });
});
