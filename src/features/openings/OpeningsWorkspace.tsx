'use client';

import { Opening, Plus, Search, Settings } from '@/components/icons';
import { Button, IconButton } from '@/components/ui/Button';
import { CanonicalBoardSurface } from '@/features/workspace/CanonicalBoardSurface';
import { WorkspaceLowerPanel } from '@/features/workspace/WorkspaceLowerPanel';
import { WorkspaceToolDock } from '@/features/workspace/WorkspaceToolDock';
import { NavButton } from '@/features/shell/NavButton';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';

export function OpeningsWorkspace() {
  const newGame = useAnalysis((state) => state.newGame);
  const toggleCommandPalette = useUi((state) => state.toggleCommandPalette);
  const setSettingsOpen = useUi((state) => state.setSettingsOpen);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex min-h-14 shrink-0 items-center gap-2 border-b border-line-subtle bg-surface-1 px-3 md:px-5">
        <NavButton />
        <Opening className="h-5 w-5 shrink-0 text-accent" />
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-primary">Opening Explorer</h1>
          <p className="hidden truncate text-xs text-tertiary sm:block">
            Research one source at a time; compare database, engine and repertoire evidence.
          </p>
        </div>
        <Button icon={<Plus />} className="ml-auto" onClick={() => newGame()}>
          New line
        </Button>
        <button
          type="button"
          onClick={toggleCommandPalette}
          className="hidden h-9 items-center gap-2 rounded-[4px] border border-line bg-surface-2 px-3 text-xs text-tertiary hover:text-primary lg:flex"
        >
          <Search className="h-4 w-4" />
          Search commands
          <kbd className="font-mono text-[10px]">⌘K</kbd>
        </button>
        <IconButton label="Settings" onClick={() => setSettingsOpen(true)}>
          <Settings />
        </IconButton>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto wide:flex-row wide:overflow-hidden">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <CanonicalBoardSurface
            mode="interactive"
            className="min-h-[560px] min-w-0 flex-1 px-3 py-4 sm:px-5 wide:min-h-0"
          />
          <WorkspaceLowerPanel workspace="openings" />
        </section>
        <WorkspaceToolDock workspace="openings" />
      </div>
    </div>
  );
}
