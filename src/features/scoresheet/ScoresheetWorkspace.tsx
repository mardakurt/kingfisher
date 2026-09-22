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
import { useAnalysis } from '@/stores/analysis-store';

import { SheetPanel } from './SheetPanel';

export function ScoresheetWorkspace() {
  const openDocument = useAnalysis((state) => state.openDocument);
  const document = useAnalysis((state) => state.document);

  useEffect(() => {
    // Arriving here means starting a sheet, unless one is already in progress.
    if (document.kind === 'untitled' && document.title === 'From the sheet') return;
    openDocument({
      tree: createTree(START_FEN, { Event: '?', Round: '?', White: '?', Black: '?', Result: '*' }),
      document: { kind: 'untitled', title: 'From the sheet' },
    });
    // Once, on entering the route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
