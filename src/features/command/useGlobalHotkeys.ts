'use client';

import { useEffect } from 'react';

import { START_FEN } from '@/chess/fen';
import { useAnalysis } from '@/stores/analysis-store';
import { useEngine } from '@/stores/engine-store';
import { usePreferences } from '@/stores/preferences-store';
import { useUi } from '@/stores/ui-store';
import { showTool } from '@/features/workspace/select-tool';

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

/**
 * Global keyboard handling.
 *
 * One listener, one place. Every binding is also listed in `shortcuts.ts`, so
 * the reference dialog cannot fall out of date without someone noticing.
 */
export function useGlobalHotkeys(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      const ui = useUi.getState();

      if (modifier && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        ui.toggleCommandPalette();
        return;
      }
      if (modifier && event.key === ',') {
        event.preventDefault();
        ui.setSettingsOpen(true);
        return;
      }
      /*
        Work is already saved continuously, so ⌘S has nothing to flush. Rather
        than swallow the key or let the browser offer to save the page, it opens
        the one save action that does something: filing the analysis in a study.
      */
      if (modifier && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (useAnalysis.getState().document.kind !== 'study-chapter') {
          ui.setSaveToStudyOpen(true);
        }
        return;
      }
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
      if (isTypingTarget(event.target)) return;

      const analysis = useAnalysis.getState();

      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) analysis.redo();
        else analysis.undo();
        return;
      }
      if (modifier) return;

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          analysis.back();
          return;
        case 'ArrowRight':
          event.preventDefault();
          analysis.forward();
          return;
        case 'ArrowUp':
          event.preventDefault();
          if (event.shiftKey) analysis.promote(analysis.currentId);
          else analysis.previousVariation();
          return;
        case 'ArrowDown':
          event.preventDefault();
          if (event.shiftKey) analysis.demote(analysis.currentId);
          else analysis.nextVariation();
          return;
        case 'Home':
          event.preventDefault();
          analysis.toStart();
          return;
        case 'End':
          event.preventDefault();
          analysis.toEnd();
          return;
        case 'Delete':
        case 'Backspace':
          event.preventDefault();
          analysis.deleteNode(analysis.currentId);
          return;
        case '?':
          event.preventDefault();
          ui.setShortcutsOpen(true);
          return;
        default:
          break;
      }

      const key = event.key.toLowerCase();

      if (NAG_KEYS[event.key] !== undefined && analysis.currentId !== analysis.tree.rootId) {
        analysis.toggleNag(analysis.currentId, NAG_KEYS[event.key] as number);
        return;
      }

      if (key === 'c') {
        // Guarding on the root keeps `C` from opening an editor for a comment
        // that has nowhere sensible to appear before the first move.
        ui.setCommentingNodeId(analysis.currentId);
        return;
      }
      if (key === 'f') {
        analysis.flip();
        return;
      }
      if (key === 'x') {
        analysis.clearShapes(analysis.currentId);
        return;
      }
      if (key === 'd') {
        // Routed through the dock. This used to set `ui.rightTab`, which the
        // tool dock replaced and nothing has read since — so the documented
        // `D` shortcut quietly did nothing at all.
        showTool(window.location.pathname, 'explorer');
        return;
      }
      if (key === 'p' && event.shiftKey) {
        analysis.promote(analysis.currentId);
        return;
      }
      if (key === 'm' && event.shiftKey) {
        analysis.promoteToMain(analysis.currentId);
        return;
      }
      if (key === 'e') {
        const engine = useEngine.getState();
        if (engine.primary.running) {
          engine.stop('primary');
        } else {
          const prefs = usePreferences.getState();
          const fen = analysis.tree.nodes[analysis.currentId]?.fen ?? START_FEN;
          void engine.analyse('primary', fen, prefs.engineLimit, {
            multiPv: prefs.engineMultiPv,
            threads: prefs.engineThreads,
            hashMb: prefs.engineHashMb,
          });
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
