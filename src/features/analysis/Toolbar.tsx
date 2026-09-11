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
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
  Target,
} from '@/components/icons';
import { Button, IconButton } from '@/components/ui/Button';
import { Menu, type MenuSection } from '@/components/ui/Menu';
import { START_FEN } from '@/chess/fen';
import type { CriticalCategory } from '@/chess/tree/types';
import { useAnalysis } from '@/stores/analysis-store';
import { usePreferences } from '@/stores/preferences-store';
import { useUi } from '@/stores/ui-store';

import { DocumentHeader } from './DocumentHeader';
import { useCopyActions } from './useCopyActions';
import { usePositionActions } from '@/features/workspace/usePositionActions';
import { NavButton } from '@/features/shell/NavButton';

const CRITICAL_CATEGORIES: readonly { id: CriticalCategory; label: string }[] = [
  { id: 'opening', label: 'Opening' },
  { id: 'calculation', label: 'Calculation' },
  { id: 'strategy', label: 'Strategy' },
  { id: 'endgame', label: 'Endgame' },
  { id: 'time-trouble', label: 'Time trouble' },
];

export function Toolbar() {
  const newGame = useAnalysis((state) => state.newGame);
  const currentId = useAnalysis((state) => state.currentId);
  const critical = useAnalysis((state) => state.tree.nodes[state.currentId]?.meta.critical);
  const setCritical = useAnalysis((state) => state.setCritical);
  const setImportOpen = useUi((state) => state.setImportOpen);
  const setSettingsOpen = useUi((state) => state.setSettingsOpen);
  const setSaveToStudyOpen = useUi((state) => state.setSaveToStudyOpen);
  const setAddToRepertoireOpen = useUi((state) => state.setAddToRepertoireOpen);
  const setTrainingCaptureOpen = useUi((state) => state.setTrainingCaptureOpen);
  const setModelGameOpen = useUi((state) => state.setModelGameOpen);
  const toggleCommandPalette = useUi((state) => state.toggleCommandPalette);
  const theme = usePreferences((state) => state.theme);
  const toggleTheme = usePreferences((state) => state.toggleTheme);
  const copy = useCopyActions();
  const fen = useAnalysis((state) => state.tree.nodes[state.currentId]?.fen ?? START_FEN);
  const documentTitle = useAnalysis((state) => state.document.title);
  const positionActions = usePositionActions({ fen, label: documentTitle || 'this analysis' });

  const sections: readonly MenuSection[] = [
    {
      id: 'copy',
      items: [
        { id: 'pgn', label: 'Copy PGN', shortcut: '', icon: <Export />, run: copy.pgn },
        { id: 'fen', label: 'Copy FEN', icon: <Copy />, run: copy.fen },
        { id: 'line', label: 'Copy this line (SAN)', icon: <Copy />, run: copy.sanLine },
        { id: 'uci', label: 'Copy this line (UCI)', icon: <Copy />, run: copy.uciLine },
      ],
    },
    {
      id: 'document',
      items: [
        { id: 'save', label: 'Save to study…', run: () => setSaveToStudyOpen(true) },
        {
          id: 'repertoire',
          label: 'Add to repertoire…',
          run: () => setAddToRepertoireOpen(true),
        },
        {
          id: 'training',
          label: 'Create training position…',
          run: () => setTrainingCaptureOpen(true),
        },
        {
          id: 'model-game',
          label: 'Mark as model game…',
          run: () => setModelGameOpen(true),
        },
        {
          id: 'import',
          label: 'Import PGN or FEN…',
          icon: <Import />,
          run: () => setImportOpen(true),
        },
      ],
    },
    {
      /*
        Critical positions carry a category because "come back to this" and
        "I miscalculated here" lead to different work later. The categories are
        listed rather than hidden behind a submenu: five explicit items are
        easier to hit, and the current one shows as already chosen.
      */
      id: 'critical',
      items: [
        ...CRITICAL_CATEGORIES.map((entry) => ({
          id: `critical-${entry.id}`,
          label:
            critical === entry.id ? `Critical: ${entry.label} ✓` : `Mark critical — ${entry.label}`,
          run: () => setCritical(currentId, entry.id),
        })),
        ...(critical
          ? [
              {
                id: 'critical-clear',
                label: 'Unmark critical position',
                run: () => setCritical(currentId, null),
              },
            ]
          : []),
      ],
    },
  ];

  return (
    /*
      No `overflow-hidden` here. The document menu is positioned against this
      header, so clipping the header clipped the menu to its own 40px height —
      every item below the first was invisible and unclickable. Overflow is
      contained by the children that can actually grow (the document title
      truncates, the rest are fixed-width controls) rather than by cutting the
      row that anchors a popover.
    */
    <header className="flex min-h-14 min-w-0 shrink-0 items-center gap-1.5 border-b border-line-subtle bg-surface-1 px-2 sm:px-4">
      <NavButton />
      <Button aria-label="New analysis" icon={<Plus />} onClick={() => newGame(START_FEN)}>
        <span className="hidden xs:inline">New</span>
      </Button>
      <Button aria-label="Import PGN or FEN" icon={<Import />} onClick={() => setImportOpen(true)}>
        <span className="hidden xs:inline">Import</span>
      </Button>

      {/*
        Everything you can do with the position on the board, from the one
        definition shared with the command palette and the keyboard. Kept as a
        menu rather than as buttons: twelve controls around a board is how a
        workspace stops looking like a chess application.
      */}
      <Menu
        sections={positionActions.sections}
        trigger={({ open, toggle, id }) => (
          <Button
            id={id}
            aria-label="Position actions"
            aria-haspopup="menu"
            aria-expanded={open}
            active={open}
            icon={<Target />}
            onClick={toggle}
          >
            <span className="hidden sm:inline">Position</span>
          </Button>
        )}
      />

      <Menu
        sections={sections}
        trigger={({ open, toggle, id }) => (
          <Button
            id={id}
            /* The label is hidden below `sm`, so the button needs a name of
               its own or it reaches a screen reader as an unnamed control. */
            aria-label="Document actions"
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
        className="ml-auto flex h-9 shrink-0 items-center gap-2 rounded-[4px] border border-line bg-surface-2 px-3 text-xs text-tertiary transition-colors hover:border-line-strong hover:text-secondary"
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
