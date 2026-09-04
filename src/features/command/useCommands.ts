'use client';

import { useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { START_FEN } from '@/chess/fen';
import { BOARD_THEMES, boardTheme } from '@/features/board/themes';
import { PIECE_SETS, pieceSet } from '@/features/board/pieces';
import { serializeMovetext, serializePgn } from '@/chess/pgn';
import { nodePath } from '@/chess/tree/tree';
import { evaluationFromAnalysis } from '@/features/analysis/useEngineSnapshots';
import { formatScore } from '@/chess/evaluation';
import { useAnalysis } from '@/stores/analysis-store';
import { engineDefinitions } from '@/engine/registry';
import { useEngine } from '@/stores/engine-store';
import { usePreferences } from '@/stores/preferences-store';
import { useWorkspaceLayout } from '@/stores/workspace-layout-store';
import { useUi } from '@/stores/ui-store';
import { showTool } from '@/features/workspace/select-tool';

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
  // Which workspace a "show the explorer" command lands in depends on the
  // route the user is looking at, so the commands are rebuilt when it changes.
  const pathname = usePathname();

  return useMemo(() => {
    const analysis = useAnalysis.getState;
    const ui = useUi.getState;
    const prefs = usePreferences.getState;
    const layout = useWorkspaceLayout.getState;
    const engine = useEngine.getState;

    const startEngine = () => {
      const { engineMultiPv, engineThreads, engineHashMb, engineLimit } = prefs();
      void engine().analyse(
        'primary',
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
        id: 'copy-line-san',
        title: 'Copy the current line (SAN)',
        group: 'Game',
        keywords: 'export variation moves movetext',
        run: async () => {
          const state = analysis();
          await navigator.clipboard.writeText(
            serializeMovetext(state.tree, nodePath(state.tree, state.currentId)),
          );
          ui().notify({ tone: 'success', message: 'Line copied to the clipboard.' });
        },
      },
      {
        id: 'copy-line-uci',
        title: 'Copy the current line (UCI move sequence)',
        group: 'Game',
        keywords: 'export engine long algebraic',
        run: async () => {
          const state = analysis();
          const moves = nodePath(state.tree, state.currentId)
            .map((id) => state.tree.nodes[id]?.move?.uci)
            .filter(Boolean);
          await navigator.clipboard.writeText(moves.join(' '));
          ui().notify({ tone: 'success', message: 'UCI move sequence copied.' });
        },
      },
      {
        id: 'save-to-study',
        title: 'Save this analysis to a study…',
        group: 'Study',
        keywords: 'chapter notebook persist file',
        run: () => ui().setSaveToStudyOpen(true),
      },
      {
        id: 'goto-studies',
        title: 'Go to Studies',
        group: 'Navigate',
        keywords: 'chapters notebooks library',
        run: () => router.push('/studies'),
      },
      {
        id: 'goto-games',
        title: 'Search my games',
        group: 'Navigate',
        keywords: 'database collection pgn library find',
        run: () => router.push('/games'),
      },
      {
        id: 'add-comment',
        title: 'Comment on this move…',
        group: 'Editing',
        shortcut: 'C',
        keywords: 'annotate note prose text',
        run: () => ui().setCommentingNodeId(analysis().currentId),
      },
      {
        id: 'promote-variation',
        title: 'Move this variation up',
        group: 'Editing',
        shortcut: '⇧P',
        keywords: 'promote reorder branch sibling',
        run: () => analysis().promote(analysis().currentId),
      },
      {
        id: 'demote-variation',
        title: 'Move this variation down',
        group: 'Editing',
        keywords: 'demote reorder branch sibling',
        run: () => analysis().demote(analysis().currentId),
      },
      {
        id: 'promote-mainline',
        title: 'Make this the main line',
        group: 'Editing',
        shortcut: '⇧M',
        keywords: 'promote mainline primary',
        run: () => analysis().promoteToMain(analysis().currentId),
      },
      {
        id: 'delete-variation',
        title: 'Delete this variation',
        group: 'Editing',
        keywords: 'remove branch side line',
        run: () => analysis().deleteVariation(analysis().currentId),
      },
      {
        id: 'truncate',
        title: 'Delete everything after this move',
        group: 'Editing',
        keywords: 'truncate cut continuation',
        run: () => analysis().truncate(analysis().currentId),
      },
      {
        id: 'insert-best-line',
        title: 'Insert the best engine line',
        group: 'Engine',
        keywords: 'pv principal variation add moves',
        run: () => {
          const state = analysis();
          const snapshot = engine().primary.analysis;
          const node = state.tree.nodes[state.currentId];
          if (!snapshot || !node || snapshot.fen !== node.fen) {
            ui().notify({
              tone: 'info',
              message: 'Analyse this position before inserting the engine line.',
            });
            return;
          }
          const best = snapshot.lines[0];
          if (!best || best.moves.length === 0) return;
          const result = state.insertUciLine(best.moves);
          if (!result.ok) {
            ui().notify({ tone: 'error', message: result.error.message });
          }
        },
      },
      {
        id: 'save-evaluation',
        title: 'Save the engine evaluation to this move',
        group: 'Engine',
        keywords: 'attach snapshot depth score evidence',
        run: () => {
          const state = analysis();
          const snapshot = engine().primary.analysis;
          const node = state.tree.nodes[state.currentId];
          if (!snapshot || !node || snapshot.fen !== node.fen) {
            ui().notify({ tone: 'info', message: 'Analyse this position first.' });
            return;
          }
          const evaluation = evaluationFromAnalysis(
            snapshot,
            engine().primary.identity?.name ?? 'Stockfish',
          );
          if (!evaluation) return;
          state.attachEvaluation(state.currentId, evaluation);
          ui().notify({
            tone: 'success',
            message: `${formatScore(evaluation.score)} at depth ${evaluation.depth} saved.`,
          });
        },
      },
      {
        id: 'clear-pins',
        title: 'Clear pinned engine lines',
        group: 'Engine',
        keywords: 'unpin remove',
        run: () => engine().clearPins(),
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
        title: 'Cycle board coordinates (inside, outside, off)',
        group: 'Board',
        keywords: 'files ranks labels a1 h8',
        run: () => {
          const order = ['inside', 'outside', 'none'] as const;
          const next = order[(order.indexOf(prefs().coordinateStyle) + 1) % order.length];
          prefs().set('coordinateStyle', next ?? 'inside');
        },
      },
      {
        id: 'cycle-piece-set',
        title: 'Switch piece set',
        group: 'Board',
        keywords: 'pieces appearance staunton minimal',
        run: () => {
          const ids = PIECE_SETS.map((set) => set.id);
          const next = ids[(ids.indexOf(prefs().pieceSet) + 1) % ids.length];
          if (next) {
            prefs().set('pieceSet', next);
            ui().notify({ tone: 'info', message: `Piece set: ${pieceSet(next).name}` });
          }
        },
      },
      {
        id: 'cycle-board-theme',
        title: 'Switch board theme',
        group: 'Board',
        keywords: 'colours appearance squares',
        run: () => {
          const ids = BOARD_THEMES.map((theme) => theme.id);
          const next = ids[(ids.indexOf(prefs().boardTheme) + 1) % ids.length];
          if (next) {
            prefs().set('boardTheme', next);
            ui().notify({ tone: 'info', message: `Board: ${boardTheme(next).name}` });
          }
        },
      },
      {
        id: 'toggle-evaluation-graph',
        title: 'Toggle the evaluation graph',
        group: 'Board',
        keywords: 'chart curve advantage',
        run: () => prefs().set('showEvaluationGraph', !prefs().showEvaluationGraph),
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
        id: 'compare-engines',
        title: 'Run two engines on this position',
        group: 'Engine',
        keywords: 'compare second engine lc0 disagreement neural',
        run: () => {
          const { engineMultiPv, engineThreads, engineHashMb, engineLimit } = prefs();
          showTool(pathname, 'engine');
          void engine().compare(
            analysis().tree.nodes[analysis().currentId]?.fen ?? START_FEN,
            engineLimit,
            { multiPv: Math.max(2, engineMultiPv), threads: engineThreads, hashMb: engineHashMb },
          );
        },
      },
      {
        id: 'switch-engine',
        title: 'Switch to the next engine',
        group: 'Engine',
        keywords: 'stockfish lc0 stormphrax choose',
        run: () => {
          // The cycle walks what the selector offers, not everything this
          // build can drive: an engine hidden in Settings should not come back
          // because somebody pressed the shortcut twice.
          const hiddenIds = prefs().hiddenEngineIds;
          const all = engineDefinitions();
          const visible = all.filter((entry) => !hiddenIds.includes(entry.id));
          const definitions = visible.length > 0 ? visible : all;
          const current = engine().primary.engineId;
          const at = definitions.findIndex((entry) => entry.id === current);
          const next = definitions[(at + 1) % definitions.length];
          if (!next) return;
          void engine().selectEngine('primary', next.id);
          prefs().set('primaryEngineId', next.id);
          ui().notify({ tone: 'info', message: `Engine set to ${next.name}.` });
        },
      },
      {
        id: 'show-features',
        title: 'Show position structure',
        group: 'Panels',
        keywords: 'pawn structure isolated passed open files bishop pair',
        run: () => showTool(pathname, 'features'),
      },
      {
        id: 'show-tablebase',
        title: 'Show the tablebase',
        group: 'Panels',
        keywords: 'syzygy endgame dtz proved',
        run: () => showTool(pathname, 'tablebase'),
      },
      {
        id: 'show-assistant',
        title: 'Ask the companion',
        group: 'Panels',
        keywords: 'assistant ai explain plan grounded',
        run: () => showTool(pathname, 'companion'),
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
        run: () => showTool(pathname, 'explorer'),
      },
      {
        id: 'show-engine-panel',
        title: 'Show the engine panel',
        group: 'Panels',
        run: () => showTool(pathname, 'engine'),
      },
      {
        id: 'show-notes',
        title: 'Show notes and annotations',
        group: 'Panels',
        run: () => showTool(pathname, 'notes'),
      },
      {
        id: 'focus-mode',
        title: 'Focus mode — board, tree and one tool',
        group: 'Interface',
        keywords: 'hide chrome distraction deep concentrate',
        run: () => layout().setFocusMode(!layout().focusMode),
      },
      {
        id: 'compact-mode',
        title: 'Compact density — less chrome, same text size',
        group: 'Interface',
        keywords: 'dense tight space laptop',
        run: () => layout().setCompact(!layout().compact),
      },
      {
        id: 'show-calculation',
        title: 'Calculate here, with evidence hidden',
        group: 'Panels',
        shortcut: '⇧C',
        keywords: 'blindfold candidates variation think',
        run: () => showTool(pathname, 'calculation'),
      },
      {
        id: 'show-theory-radar',
        title: 'Show the theory radar',
        group: 'Panels',
        keywords: 'recent new changed trend opening',
        run: () => showTool(pathname, 'theory-radar'),
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
  }, [pathname, router]);
}
