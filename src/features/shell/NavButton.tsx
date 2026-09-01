'use client';

/**
 * The control that opens the navigation drawer on a phone.
 *
 * Every workspace needs one. The sidebar is hidden below `md`, so a screen
 * without this button is a dead end: you can reach it from Analysis and then
 * have no way back. It hides itself at desktop widths, where the sidebar is
 * always on screen.
 */

import { Menu as MenuIcon } from '@/components/icons';
import { IconButton } from '@/components/ui/Button';
import { useUi } from '@/stores/ui-store';

export function NavButton() {
  const setSidebarOpen = useUi((state) => state.setSidebarOpen);
  return (
    <IconButton
      label="Open navigation"
      className="-ml-0.5 md:hidden"
      onClick={() => setSidebarOpen(true)}
    >
      <MenuIcon />
    </IconButton>
  );
}
