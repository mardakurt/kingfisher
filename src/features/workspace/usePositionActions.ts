'use client';

/**
 * The one implementation of every position action.
 *
 * Written once here so the board's context menu, the toolbar menu, the command
 * palette and the keyboard all *do the same thing* — including the parts that
 * are easy to forget at a call site, like pushing a research stop before
 * navigating away so "back to …" works from wherever the action landed.
 */

import { useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { positionKey } from '@/chess/fen';
import { createTree } from '@/chess/tree/tree';
import type { Fen } from '@/chess/types';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';
import { useResearchHistory } from '@/stores/research-history-store';
import { showTool } from '@/features/workspace/select-tool';
import { useCalculation } from '@/features/calculation/calculation-store';

import { positionActionSections, type PositionActionHandlers } from './position-actions';

export interface UsePositionActionsOptions {
  readonly fen: Fen;
  /** What the current route should be called in a "back to …" control. */
  readonly label: string;
  /** Route-specific state to restore on the way back. */
  readonly context?: Readonly<Record<string, unknown>>;
  readonly hasSession?: boolean;
  readonly onAddToPreparation?: () => void;
  readonly onSaveEndgame?: () => void;
}

export function usePositionActions(options: UsePositionActionsOptions) {
  const router = useRouter();
  const pathname = usePathname() ?? '/analysis';
  const ui = useUi();
  const openDocument = useAnalysis((state) => state.openDocument);
  const push = useResearchHistory((state) => state.push);

  const key = positionKey(options.fen);

  /** Record where we are before a hand-off, so returning restores context. */
  const depart = useCallback(() => {
    push({
      href: pathname,
      label: options.label,
      fen: options.fen,
      ...(options.context ? { context: options.context } : {}),
    });
  }, [push, pathname, options.label, options.fen, options.context]);

  const handlers: PositionActionHandlers = {
    analyse: () => {
      depart();
      router.push('/analysis');
    },
    explore: () => showTool(pathname, 'explorer'),
    calculate: () => {
      useCalculation.getState().start(options.fen, key);
      showTool(pathname, 'calculation');
    },
    setup: () => ui.setPositionSetupOpen(true),
    playFromHere: () => showTool(pathname, 'play'),
    report: () => showTool(pathname, 'report'),
    findModelGames: () => showTool(pathname, 'model-games'),
    searchStructure: () => showTool(pathname, 'features'),
    addToRepertoire: () => ui.setAddToRepertoireOpen(true),
    saveToStudy: () => ui.setSaveToStudyOpen(true),
    createTraining: () => ui.setTrainingCaptureOpen(true),
    ...(options.onAddToPreparation ? { addToPreparation: options.onAddToPreparation } : {}),
    /*
      Without a route-supplied handler, this hands the position to the endgame
      lab rather than doing nothing. A menu entry that silently does nothing is
      worse than one that is absent.
    */
    saveEndgame: () => {
      if (options.onSaveEndgame) {
        options.onSaveEndgame();
        return;
      }
      depart();
      openDocument({
        tree: createTree(options.fen, { Event: 'Endgame', Result: '*' }),
        document: { kind: 'untitled', title: 'Endgame' },
      });
      router.push('/endgame');
    },
    copyFen: () => {
      void navigator.clipboard
        .writeText(options.fen)
        .then(() => ui.notify({ tone: 'success', message: 'FEN copied.' }))
        .catch(() => ui.notify({ tone: 'error', message: 'Could not reach the clipboard.' }));
    },
  };

  const sections = positionActionSections(
    {
      fen: options.fen,
      positionKey: key,
      route: pathname,
      ...(options.hasSession !== undefined ? { hasSession: options.hasSession } : {}),
    },
    handlers,
  );

  return { sections, handlers, depart, openDocument };
}
