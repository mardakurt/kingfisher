'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';

import { START_FEN } from '@/chess/fen';
import { serializePgn } from '@/chess/pgn';
import { useAnalysis } from '@/stores/analysis-store';
import { useEngine } from '@/stores/engine-store';
import { usePreferences } from '@/stores/preferences-store';
import { useUi } from '@/stores/ui-store';

export interface Command {
  readonly id: string;
  readonly title: string;
  readonly group: string;
  readonly shortcut?: string;
  readonly keywords?: string;
  readonly run: () => void | Promise<void>;
}

/**
 * Everything the palette can do.
 *
 * Commands are built from the same store actions the interface uses, so there
 * is never a second code path that can drift out of step with the buttons.
 */
export function useCommands(): readonly Command[] {
  const router = useRouter();

  return useMemo(() => {
    const analysis = useAnalysis.getState;
    const ui = useUi.getState;
    const prefs = usePreferences.getState;
    const engine = useEngine.getState;

    const startEngine = () => {
      const { engineMultiPv, engineThreads, engineHashMb, engineLimit } = prefs();
      void engine().analyse(
        analysis().tree.nodes[analysis().currentId]?.fen ?? START_FEN,
        engineLimit,
        {
          multiPv: engineMultiPv,
          threads: engineThreads,
          hashMb: engineHashMb,
        },
      );
    };

    const commands: Command[] = [
      {
        id: 'new-analysis',
        title: 'New analysis',
        group: 'Game',
        keywords: 'reset clear board',
        run: () => analysis().newGame(START_FEN),
      },
      {
        id: 'import-pgn',
        title: 'Import PGN or FEN…',
        group: 'Game',
        keywords: 'load open paste game fen position',
        run: () => ui().setImportOpen(true),
      },
      {
        id: 'copy-pgn',
        title: 'Copy PGN to clipboard',
        group: 'Game',
        keywords: 'export save',
        run: async () => {
          await navigator.clipboard.writeText(serializePgn(analysis().tree));
          ui().notify({ tone: 'success', message: 'PGN copied to the clipboard.' });
        },
      },
      {
        id: 'copy-fen',
        title: 'Copy FEN of the current position',
        group: 'Game',
        keywords: 'export position',
        run: async () => {
          const state = analysis();
          const fen = state.tree.nodes[state.currentId]?.fen;
          if (!fen) return;
          await navigator.clipboard.writeText(fen);
          ui().notify({ tone: 'success', message: 'FEN copied to the clipboard.' });
        },
      },
      {
        id: 'flip-board',
        title: 'Flip the board',
        group: 'Board',
        shortcut: 'F',
        run: () => analysis().flip(),
      },
      {
        id: 'toggle-coordinates',
        title: 'Toggle board coordinates',
        group: 'Board',
        run: () => prefs().set('showCoordinates', !prefs().showCoordinates),
      },
      {
        id: 'toggle-theme',
        title: 'Switch between dark and light',
        group: 'Interface',
        keywords: 'dark light appearance',
        run: () => prefs().toggleTheme(),
      },
      {
        id: 'start-engine',
        title: 'Start engine analysis',
        group: 'Engine',
        shortcut: 'E',
        run: startEngine,
      },
      {
        id: 'stop-engine',
        title: 'Stop engine analysis',
        group: 'Engine',
        run: () => engine().stop(),
      },
      {
        id: 'engine-multipv',
        title: 'Cycle engine lines (MultiPV)',
        group: 'Engine',
        keywords: 'variations multipv lines',
        run: () => {
          const next = prefs().engineMultiPv >= 5 ? 1 : prefs().engineMultiPv + 1;
          prefs().set('engineMultiPv', next);
        },
      },
      {
        id: 'show-explorer',
        title: 'Show the database explorer',
        group: 'Panels',
        shortcut: 'D',
        run: () => ui().setRightTab('explorer'),
      },
      {
        id: 'show-engine-panel',
        title: 'Show the engine panel',
        group: 'Panels',
        run: () => ui().setRightTab('engine'),
      },
      {
        id: 'show-notes',
        title: 'Show notes and annotations',
        group: 'Panels',
        run: () => ui().setRightTab('notes'),
      },
      {
        id: 'shortcuts',
        title: 'Keyboard shortcuts',
        group: 'Interface',
        shortcut: '?',
        run: () => ui().setShortcutsOpen(true),
      },
      {
        id: 'settings',
        title: 'Settings',
        group: 'Interface',
        shortcut: '⌘,',
        run: () => ui().setSettingsOpen(true),
      },
      {
        id: 'goto-analysis',
        title: 'Go to Analysis',
        group: 'Navigate',
        run: () => router.push('/analysis'),
      },
    ];

    return commands;
  }, [router]);
}
