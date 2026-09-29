'use client';

/**
 * The two controls that are the same on every route: the command palette and
 * Settings.
 *
 * They were drawn once, inside the board routes' `WorkspaceFrame` header, and
 * nowhere else — so six of the twenty-two application routes had no way to
 * reach either of them except by remembering the shortcut. A person who
 * learned "Settings is the control at the right of the header" lost it on the
 * Library, on Players, on Databases, on Recent, on Search and on the Position
 * page; on Search and on Players the header's trailing region was empty, and
 * the two controls that had been the last thing in it were simply absent.
 *
 * `FrameHeader` and `PageHeader` are different components for good reasons —
 * the first measures room for folding actions and owns the position menu, the
 * second is a plain title row — but the controls at the end of them are the
 * same control, and a control that is the same must be the same component or
 * the two headers drift apart again. `e2e/header-controls.spec.ts` holds
 * every route to carrying them.
 */

import { Search, Settings } from '@/components/icons';
import { IconButton } from '@/components/ui/Button';
import { useUi } from '@/stores/ui-store';

export function GlobalControls({ className }: { readonly className?: string }) {
  const setSettingsOpen = useUi((state) => state.setSettingsOpen);
  const toggleCommandPalette = useUi((state) => state.toggleCommandPalette);

  return (
    <div className={`flex shrink-0 items-center gap-1.5 ${className ?? ''}`}>
      {/*
        Search commands keeps a longer label than Position or Set up, so the
        threshold for it is wider: at `mid` (900 px) the rest of the toolbar
        has the room it needs without the search button pushing the theme
        toggle off the right edge. Below that the icon and the kbd stay, so
        the shortcut is still discoverable.
      */}
      <button
        type="button"
        onClick={toggleCommandPalette}
        aria-label="Search commands"
        className="flex h-8 shrink-0 items-center gap-2 rounded-[var(--radius-control)] bg-surface-2 px-3 text-xs text-tertiary transition-colors hover:bg-surface-3 hover:text-secondary active:bg-surface-press"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden mid:inline">Search commands</span>
        <kbd className="hidden rounded-[4px] bg-surface-1 px-1 font-mono text-[10px] mid:inline">
          ⌘K
        </kbd>
      </button>
      {/*
        `aria-keyshortcuts` rather than a shortcut inside the name. The sidebar
        carries the same control, and when both spelled their shortcut as text
        the two announced themselves as "Settings comma" and "Settings, comma" —
        one command, two names a person could not tell apart. Both now name
        what they do and let the platform announce the key.
      */}
      <IconButton label="Settings" aria-keyshortcuts="Meta+," onClick={() => setSettingsOpen(true)}>
        <Settings />
      </IconButton>
    </div>
  );
}

/** The hairline that separates a route's own actions from the common ones. */
export const ControlDivider = () => (
  <span className="mx-1 hidden h-4 w-px bg-line-subtle sm:block" aria-hidden />
);
