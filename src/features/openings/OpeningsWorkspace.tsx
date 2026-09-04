'use client';

/**
 * The Openings route, in two modes.
 *
 * *Explorer* is the board: a position, and the evidence about it. *Library* is
 * the index: 3,810 named openings you can search by code, name, nickname,
 * moves or position, without knowing the line first.
 *
 * They are one route rather than two because they are one activity — you look
 * something up in order to put it on the board — and the switch keeps the
 * board's workspace mounted underneath, so going back does not lose the line
 * you were in the middle of.
 */

import { Opening, Plus, Search, Settings } from '@/components/icons';
import { Segmented } from '@/components/ui/Tabs';
import { Button, IconButton } from '@/components/ui/Button';
import { CanonicalBoardSurface } from '@/features/workspace/CanonicalBoardSurface';
import { WorkspaceLowerPanel } from '@/features/workspace/WorkspaceLowerPanel';
import { WorkspaceToolDock } from '@/features/workspace/WorkspaceToolDock';
import { NavButton } from '@/features/shell/NavButton';
import { OpeningLibrary } from './OpeningLibrary';
import { useAnalysis } from '@/stores/analysis-store';
import { usePreferences } from '@/stores/preferences-store';
import { useUi } from '@/stores/ui-store';

export function OpeningsWorkspace() {
  const mode = usePreferences((state) => state.openingsMode);
  const setMode = usePreferences((state) => state.set);
  const newGame = useAnalysis((state) => state.newGame);
  const toggleCommandPalette = useUi((state) => state.toggleCommandPalette);
  const setSettingsOpen = useUi((state) => state.setSettingsOpen);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex min-h-14 shrink-0 items-center gap-2 border-b border-line-subtle bg-surface-1 px-3 md:px-5">
        <NavButton />
        <Opening className="h-5 w-5 shrink-0 text-accent" />
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-primary">Openings</h1>
          <p className="hidden truncate text-xs text-tertiary sm:block">
            {mode === 'library'
              ? 'Every named opening, searchable by code, name, moves or position.'
              : 'Research one source at a time; compare database, engine and repertoire evidence.'}
          </p>
        </div>
        <Segmented
          className="ml-auto"
          items={[
            { id: 'library', label: 'Library' },
            { id: 'explorer', label: 'Explorer' },
          ]}
          value={mode}
          onChange={(value) => setMode('openingsMode', value)}
        />
        {mode === 'explorer' ? (
          <Button icon={<Plus />} onClick={() => newGame()}>
            New line
          </Button>
        ) : null}
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
      {mode === 'library' ? (
        <OpeningLibrary />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto wide:flex-row wide:overflow-hidden">
          <section className="flex min-h-0 min-w-0 flex-1 flex-col">
            <CanonicalBoardSurface
              mode="interactive"
              className="min-h-[520px] min-w-0 flex-1 px-2 py-2 sm:px-3 wide:min-h-0"
            />
            <WorkspaceLowerPanel workspace="openings" />
          </section>
          <WorkspaceToolDock workspace="openings" />
        </div>
      )}
    </div>
  );
}
