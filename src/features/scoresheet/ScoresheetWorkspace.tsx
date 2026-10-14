'use client';

/**
 * The over-the-board game, from the sheet to the board.
 *
 * See `docs/design/scoresheet.md`. The board and the dock are the
 * workspace's own; the rail holds the sheet, the entry line, the flags and
 * the game details. A new session starts from the initial position with the
 * profile's own name where the sheet would carry it.
 */

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { createTree } from '@/chess/tree/tree';
import { START_FEN } from '@/chess/fen';
import { Pencil } from '@/components/icons';
import { WorkspaceFrame } from '@/features/workspace/WorkspaceFrame';
import { workspaceRestored } from '@/features/persistence/useWorkspacePersistence';
import { boardHoldsWork, openInNewTab } from '@/features/tabs/tab-actions';
import { NEW_TAB_HREF } from '@/features/tabs/tab-model';
import { useAnalysis } from '@/stores/analysis-store';

import { SheetPanel } from './SheetPanel';

const SHEET_TITLE = 'From the sheet';
const SHEET_HREF = '/scoresheet';

function openSheet(): void {
  useAnalysis.getState().openDocument({
    tree: createTree(START_FEN, {
      Event: '?',
      Round: '?',
      White: '?',
      Black: '?',
      Result: '*',
    }),
    document: { kind: 'untitled', title: SHEET_TITLE },
  });
}

export function ScoresheetWorkspace() {
  const router = useRouter();
  /*
    Nothing can be typed until the sheet is on the board. Waiting for the
    restore opened a window in which the entry line wrote to whatever
    document was there, and the fresh sheet then replaced it: WebKit settles
    the restore late enough to lose the first move typed.
  */
  const [ready, setReady] = useState(false);
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
    void workspaceRestored().then(async () => {
      if (cancelled) return;
      const { document } = useAnalysis.getState();
      if (document.kind === 'untitled' && document.title === SHEET_TITLE) {
        setReady(true);
        return;
      }
      /*
        The board is shared by every page. Opening the sheet on top of an
        unsaved analysis replaced it with an empty board, without a word:
        one click on "Scoresheet" in the sidebar and the moves were gone.
        Work nobody has saved goes to its own tab first — back on the
        analysis board, where it was made — and the sheet takes a new one.
        When no tab can be opened the sheet stays shut rather than take the
        board; the notice says why.
      */
      if (boardHoldsWork()) {
        const opened = await openInNewTab(router, openSheet, {
          href: SHEET_HREF,
          leaving: NEW_TAB_HREF,
        });
        if (!cancelled && opened) setReady(true);
        return;
      }
      openSheet();
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <WorkspaceFrame
      workspace="scoresheet"
      title="Scoresheet"
      subtitle="Your over-the-board game, from the sheet to the board"
      icon={<Pencil className="h-4 w-4 text-accent-ink" />}
      rail={{ label: 'Sheet', width: 320, content: <SheetPanel ready={ready} /> }}
      board={{ mode: 'interactive', showEvaluationArtifacts: false }}
    />
  );
}
