'use client';

/**
 * The analysis toolbar.
 *
 * Now that documents persist there are far more than six things a user might
 * want here, and a row of twelve buttons is not a toolbar. Only the actions
 * taken constantly stay visible; everything that copies, exports or converts
 * lives behind one menu, where it is also discoverable by name.
 */

import {
  Copy,
  Export,
  Import,
  Menu as MenuIcon,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
} from '@/components/icons';
import { Button, IconButton } from '@/components/ui/Button';
import { Menu, type MenuSection } from '@/components/ui/Menu';
import { START_FEN } from '@/chess/fen';
import { useAnalysis } from '@/stores/analysis-store';
import { usePreferences } from '@/stores/preferences-store';
import { useUi } from '@/stores/ui-store';

import { DocumentHeader } from './DocumentHeader';
import { useCopyActions } from './useCopyActions';

export function Toolbar() {
  const newGame = useAnalysis((state) => state.newGame);
  const setImportOpen = useUi((state) => state.setImportOpen);
  const setSidebarOpen = useUi((state) => state.setSidebarOpen);
  const setSettingsOpen = useUi((state) => state.setSettingsOpen);
  const setSaveToStudyOpen = useUi((state) => state.setSaveToStudyOpen);
  const toggleCommandPalette = useUi((state) => state.toggleCommandPalette);
  const theme = usePreferences((state) => state.theme);
  const toggleTheme = usePreferences((state) => state.toggleTheme);
  const copy = useCopyActions();

  const sections: readonly MenuSection[] = [
    {
      id: 'copy',
      items: [
        { id: 'pgn', label: 'Copy PGN', shortcut: '', icon: <Export />, run: copy.pgn },
        { id: 'fen', label: 'Copy FEN of this position', icon: <Copy />, run: copy.fen },
        { id: 'line', label: 'Copy this line (SAN)', icon: <Copy />, run: copy.sanLine },
        { id: 'uci', label: 'Copy this line (UCI)', icon: <Copy />, run: copy.uciLine },
      ],
    },
    {
      id: 'document',
      items: [
        { id: 'save', label: 'Save to study…', run: () => setSaveToStudyOpen(true) },
        {
          id: 'import',
          label: 'Import PGN or FEN…',
          icon: <Import />,
          run: () => setImportOpen(true),
        },
      ],
    },
  ];

  return (
    <header className="flex h-10 min-w-0 shrink-0 items-center gap-1 overflow-hidden border-b border-line-subtle bg-surface-1 px-1.5 sm:px-2">
      <IconButton
        label="Open navigation"
        className="md:hidden"
        onClick={() => setSidebarOpen(true)}
      >
        <MenuIcon />
      </IconButton>
      <Button aria-label="New analysis" icon={<Plus />} onClick={() => newGame(START_FEN)}>
        <span className="hidden min-[430px]:inline">New</span>
      </Button>
      <Button aria-label="Import PGN or FEN" icon={<Import />} onClick={() => setImportOpen(true)}>
        <span className="hidden min-[430px]:inline">Import</span>
      </Button>

      <Menu
        sections={sections}
        trigger={({ open, toggle, id }) => (
          <Button
            id={id}
            aria-haspopup="menu"
            aria-expanded={open}
            active={open}
            icon={<Export />}
            onClick={toggle}
          >
            <span className="hidden sm:inline">Export</span>
          </Button>
        )}
      />

      <span className="mx-1 hidden h-4 w-px bg-line-subtle sm:block" />

      <div className="hidden min-w-0 flex-1 md:block">
        <DocumentHeader />
      </div>

      <button
        type="button"
        onClick={toggleCommandPalette}
        aria-label="Search commands"
        className="ml-auto flex h-7 shrink-0 items-center gap-2 rounded-[4px] border border-line bg-surface-2 px-2 text-2xs text-tertiary transition-colors hover:border-line-strong hover:text-secondary"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden lg:inline">Search commands</span>
        <kbd className="hidden rounded-[3px] border border-line bg-surface-1 px-1 font-mono text-[10px] lg:inline">
          ⌘K
        </kbd>
      </button>

      <IconButton
        label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        onClick={toggleTheme}
      >
        {theme === 'dark' ? <Sun /> : <Moon />}
      </IconButton>
      <IconButton label="Settings (⌘,)" onClick={() => setSettingsOpen(true)}>
        <Settings />
      </IconButton>
    </header>
  );
}
