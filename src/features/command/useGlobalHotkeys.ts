'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { positionKey, START_FEN } from '@/chess/fen';
import { useAnalysis } from '@/stores/analysis-store';
import { useEngine } from '@/stores/engine-store';
import { usePreferences } from '@/stores/preferences-store';
import { useShortcuts } from '@/stores/shortcuts-store';
import { useUi } from '@/stores/ui-store';
import { showTool } from '@/features/workspace/select-tool';
import { useCalculation } from '@/features/calculation/calculation-store';

import { resolveAction } from './bindings';

/** `1`–`6` annotate the current move with the six move-quality glyphs. */
const NAG_KEYS: Record<string, number> = { '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6 };

const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  );
};

/** Actions that must keep working while a dialog or a text field has focus. */
const WORKS_WHILE_TYPING = new Set(['palette', 'settings', 'save-to-study']);

/**
 * Global keyboard handling.
 *
 * One listener, one place — and, since Phase 10, one table. The handler no
 * longer matches keys itself: it asks `resolveAction` which action the event
 * is bound to and then does that. A rebind therefore takes effect here without
 * this file being touched, and a binding listed in the reference dialog is
 * necessarily a binding that fires, which was not previously true.
 */
export function useGlobalHotkeys(): void {
  const router = useRouter();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const ui = useUi.getState();

      /*
        Escape is fixed rather than bound. It is the way out of every dialog
        and out of focus mode, so making it rebindable is offering the user a
        way to lock themselves in.
      */
      if (event.key === 'Escape') {
        ui.setCommandPaletteOpen(false);
        ui.setShortcutsOpen(false);
        ui.setSettingsOpen(false);
        ui.setImportOpen(false);
        ui.setSaveToStudyOpen(false);
        ui.setCommentingNodeId(null);
        ui.setMoveMenu(null);
        return;
      }

      const bindings = useShortcuts.getState().bindings();
      const action = resolveAction(bindings, event);
      const typing = isTypingTarget(event.target);

      if (action === null) {
        if (typing) return;
        // NAG digits are a range rather than six table entries, and they are
        // the only keys left that the table does not name.
        const analysis = useAnalysis.getState();
        const nag = NAG_KEYS[event.key];
        if (nag !== undefined && !event.metaKey && !event.ctrlKey) {
          if (analysis.currentId !== analysis.tree.rootId)
            analysis.toggleNag(analysis.currentId, nag);
        }
        return;
      }

      if (typing && !WORKS_WHILE_TYPING.has(action)) return;

      const analysis = useAnalysis.getState();

      switch (action) {
        case 'palette':
          event.preventDefault();
          ui.toggleCommandPalette();
          return;
        case 'settings':
          event.preventDefault();
          ui.setSettingsOpen(true);
          return;
        /*
          Work is already saved continuously, so ⌘S has nothing to flush.
          Rather than swallow the key or let the browser offer to save the
          page, it opens the one save action that does something: filing the
          analysis in a study.
        */
        case 'save-to-study':
          event.preventDefault();
          if (analysis.document.kind !== 'study-chapter') ui.setSaveToStudyOpen(true);
          return;
        case 'undo':
          event.preventDefault();
          analysis.undo();
          return;
        case 'redo':
          event.preventDefault();
          analysis.redo();
          return;
        case 'back':
          event.preventDefault();
          analysis.back();
          return;
        case 'forward':
          event.preventDefault();
          analysis.forward();
          return;
        case 'prev-variation':
          event.preventDefault();
          analysis.previousVariation();
          return;
        case 'next-variation':
          event.preventDefault();
          analysis.nextVariation();
          return;
        case 'promote':
          event.preventDefault();
          analysis.promote(analysis.currentId);
          return;
        case 'demote':
          event.preventDefault();
          analysis.demote(analysis.currentId);
          return;
        case 'start':
          event.preventDefault();
          analysis.toStart();
          return;
        case 'end':
          event.preventDefault();
          analysis.toEnd();
          return;
        case 'delete':
          event.preventDefault();
          analysis.deleteNode(analysis.currentId);
          return;
        case 'shortcuts':
          event.preventDefault();
          ui.setShortcutsOpen(true);
          return;
        case 'comment':
          // Guarding on the root keeps this from opening an editor for a
          // comment that has nowhere sensible to appear before the first move.
          ui.setCommentingNodeId(analysis.currentId);
          return;
        case 'flip':
          analysis.flip();
          return;
        case 'clear-shapes':
          analysis.clearShapes(analysis.currentId);
          return;
        case 'analysis':
          // The same thing the position menu's "Analyse this position" does,
          // so the key and the menu entry cannot come to mean different things.
          router.push('/analysis');
          return;
        case 'model-games':
          showTool(window.location.pathname, 'model-games');
          return;
        case 'repertoire-tool':
          showTool(window.location.pathname, 'repertoire');
          return;
        case 'explorer':
          // Routed through the dock. This used to set `ui.rightTab`, which the
          // tool dock replaced and nothing has read since — so the documented
          // `D` shortcut quietly did nothing at all.
          showTool(window.location.pathname, 'explorer');
          return;
        case 'promote-main':
          analysis.promoteToMain(analysis.currentId);
          return;
        case 'calculate': {
          const fen = analysis.tree.nodes[analysis.currentId]?.fen ?? START_FEN;
          useCalculation.getState().start(fen, positionKey(fen));
          showTool(window.location.pathname, 'calculation');
          return;
        }
        case 'engine': {
          const engine = useEngine.getState();
          if (engine.primary.running) {
            engine.stop('primary');
            return;
          }
          const prefs = usePreferences.getState();
          const fen = analysis.tree.nodes[analysis.currentId]?.fen ?? START_FEN;
          void engine.analyse('primary', fen, prefs.engineLimit, {
            multiPv: prefs.engineMultiPv,
            threads: prefs.engineThreads,
            hashMb: prefs.engineHashMb,
          });
          return;
        }
        default:
          return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [router]);
}
