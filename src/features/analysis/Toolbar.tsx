'use client';

import { Export, Import, Menu, Moon, Plus, Search, Settings, Sun } from '@/components/icons';
import { Button, IconButton } from '@/components/ui/Button';
import { START_FEN } from '@/chess/fen';
import { useAnalysis } from '@/stores/analysis-store';
import { usePreferences } from '@/stores/preferences-store';
import { useUi } from '@/stores/ui-store';

export function Toolbar() {
  const newGame = useAnalysis((state) => state.newGame);
  const exportPgn = useAnalysis((state) => state.exportPgn);
  const setImportOpen = useUi((state) => state.setImportOpen);
  const setSidebarOpen = useUi((state) => state.setSidebarOpen);
  const setSettingsOpen = useUi((state) => state.setSettingsOpen);
  const toggleCommandPalette = useUi((state) => state.toggleCommandPalette);
  const notify = useUi((state) => state.notify);
  const theme = usePreferences((state) => state.theme);
  const toggleTheme = usePreferences((state) => state.toggleTheme);

  const copyPgn = async () => {
    try {
      await navigator.clipboard.writeText(exportPgn());
      notify({ tone: 'success', message: 'PGN copied to the clipboard.' });
    } catch {
      notify({ tone: 'error', message: 'The clipboard is not available in this context.' });
    }
  };

  return (
    <header className="flex h-10 min-w-0 shrink-0 items-center gap-1 overflow-hidden border-b border-line-subtle bg-surface-1 px-1.5 sm:px-2">
      <IconButton
        label="Open navigation"
        className="md:hidden"
        onClick={() => setSidebarOpen(true)}
      >
        <Menu />
      </IconButton>
      <Button aria-label="New analysis" icon={<Plus />} onClick={() => newGame(START_FEN)}>
        <span className="hidden min-[430px]:inline">New</span>
      </Button>
      <Button aria-label="Import PGN or FEN" icon={<Import />} onClick={() => setImportOpen(true)}>
        <span className="hidden min-[430px]:inline">Import</span>
      </Button>
      <span className="hidden sm:inline-flex">
        <Button icon={<Export />} onClick={copyPgn}>
          Copy PGN
        </Button>
      </span>

      <span className="mx-1 hidden h-4 w-px bg-line-subtle sm:block" />

      <div className="hidden min-w-0 md:block">
        <GameTitle />
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

/** Who is playing, when the loaded game says so. */
function GameTitle() {
  const headers = useAnalysis((state) => state.tree.headers);
  const white = headers.White;
  const black = headers.Black;

  if (!white || !black || (white === '?' && black === '?')) {
    return <span className="truncate text-2xs text-tertiary">Untitled analysis</span>;
  }

  return (
    <div className="flex min-w-0 items-baseline gap-2 truncate text-xs">
      <span className="truncate text-primary">{white}</span>
      <span className="text-tertiary">–</span>
      <span className="truncate text-primary">{black}</span>
      {headers.Result && headers.Result !== '*' && (
        <span className="shrink-0 text-tertiary tabular">{headers.Result}</span>
      )}
      {headers.Event && headers.Event !== '?' && (
        <span className="shrink-0 truncate text-tertiary">· {headers.Event}</span>
      )}
    </div>
  );
}
