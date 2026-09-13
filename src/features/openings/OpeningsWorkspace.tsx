'use client';

/**
 * The Openings route, in two modes.
 *
 * *Explorer* is the board: a position, and the evidence about it. *Library* is
 * the index: 3,810 named openings you can search by code, name, nickname,
 * moves or position, without knowing the line first.
 *
 * They are one route rather than two because they are one activity — you look
 * something up in order to put it on the board — and the switch keeps the
 * board's workspace mounted underneath, so going back does not lose the line
 * you were in the middle of.
 */

import { useCallback } from 'react';

import { Opening, Plus } from '@/components/icons';
import { Segmented } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { WorkspaceFrame } from '@/features/workspace/WorkspaceFrame';
import { OpeningLibrary } from './OpeningLibrary';
import { useAnalysis } from '@/stores/analysis-store';
import { usePreferences } from '@/stores/preferences-store';

export function OpeningsWorkspace() {
  const mode = usePreferences((state) => state.openingsMode);
  const setMode = usePreferences((state) => state.set);
  const newGame = useAnalysis((state) => state.newGame);

  /*
    A position handed over in the address is a request to *see* it, and the
    library is not where a position can be seen. "Open this position in
    Explorer" navigated here for nine phases and, whenever the route was left
    in Library mode, showed the index instead of the board.
  */
  const showExplorer = useCallback(() => setMode('openingsMode', 'explorer'), [setMode]);

  return (
    <WorkspaceFrame
      workspace="openings"
      title="Openings"
      subtitle={
        mode === 'library'
          ? 'Every named opening, searchable by code, name, moves or position.'
          : 'Research one source at a time; compare database, engine and repertoire evidence.'
      }
      icon={<Opening />}
      actions={
        <>
          <Segmented
            items={[
              { id: 'library', label: 'Library' },
              { id: 'explorer', label: 'Explorer' },
            ]}
            value={mode}
            onChange={(value) => setMode('openingsMode', value)}
          />
          {mode === 'explorer' ? (
            <Button icon={<Plus />} onClick={() => newGame()}>
              New line
            </Button>
          ) : null}
        </>
      }
      onPositionFromUrl={showExplorer}
      /*
        The library replaces the whole workspace rather than the board alone:
        it is an index, and an index beside a dock of position tools would be
        answering a question nobody asked of it. Switching back keeps the line
        that was on the board, because the board's state is the store's.
      */
      takeover={mode === 'library' ? <OpeningLibrary /> : undefined}
      board={{ mode: 'interactive', showEvaluationArtifacts: true }}
    />
  );
}
