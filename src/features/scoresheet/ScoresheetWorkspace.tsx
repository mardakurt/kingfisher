'use client';

/**
 * The over-the-board game, from the sheet to the board.
 *
 * See `docs/design/scoresheet.md`. The board and the dock are the
 * workspace's own; the rail holds the sheet, the entry line, the flags and
 * the game details. A new session starts from the initial position with the
 * profile's own name where the sheet would carry it.
 */

import { useEffect } from 'react';

import { createTree } from '@/chess/tree/tree';
import { START_FEN } from '@/chess/fen';
import { Pencil } from '@/components/icons';
import { WorkspaceFrame } from '@/features/workspace/WorkspaceFrame';
import { workspaceRestored } from '@/features/persistence/useWorkspacePersistence';
import { useAnalysis } from '@/stores/analysis-store';

import { SheetPanel } from './SheetPanel';

const SHEET_TITLE = 'From the sheet';

export function ScoresheetWorkspace() {
  useEffect(() => {
    /*
      Arriving here means starting a sheet, unless one is already in
      progress. "Already" has to wait for the reload's draft restore: decided
      at mount, the page saw the default document, opened a blank sheet, and
      the moves typed before the reload were replaced by it — every one of
      them, on the page whose job is not to lose a game. Workspace tabs wait
      on the same promise for the same reason.
    */
    let cancelled = false;
    void workspaceRestored().then(() => {
      if (cancelled) return;
      const { document, openDocument } = useAnalysis.getState();
      if (document.kind === 'untitled' && document.title === SHEET_TITLE) return;
      openDocument({
        tree: createTree(START_FEN, {
          Event: '?',
          Round: '?',
          White: '?',
          Black: '?',
          Result: '*',
        }),
        document: { kind: 'untitled', title: SHEET_TITLE },
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <WorkspaceFrame
      workspace="scoresheet"
      title="Scoresheet"
      subtitle="Your over-the-board game, from the sheet to the board"
      icon={<Pencil className="h-4 w-4 text-accent" />}
      rail={{ label: 'Sheet', width: 320, content: <SheetPanel /> }}
      board={{ mode: 'interactive', showEvaluationArtifacts: false }}
    />
  );
}
