'use client';

/**
 * The one control focus mode leaves on screen.
 *
 * A mode that hides the navigation has to say, permanently and unmistakably,
 * that it is on and how to leave. Anything subtler produces a user who thinks
 * the application has broken.
 */

import { Button } from '@/components/ui/Button';
import { useWorkspaceLayout } from '@/stores/workspace-layout-store';

export function FocusModeBar() {
  const setFocusMode = useWorkspaceLayout((state) => state.setFocusMode);
  return (
    <footer className="flex h-7 shrink-0 items-center gap-2 border-t border-line-subtle bg-surface-1 px-2 sm:px-3">
      <span className="text-[10px] uppercase tracking-[0.1em] text-accent">Focus</span>
      <span className="text-[10px] text-tertiary">
        Navigation hidden. The command palette still works.
      </span>
      <Button className="ml-auto" onClick={() => setFocusMode(false)}>
        Exit focus <span className="ml-1 text-tertiary">Esc</span>
      </Button>
    </footer>
  );
}
