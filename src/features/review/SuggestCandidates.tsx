'use client';

/**
 * Asking the queue for candidates from the analysed game on the board.
 *
 * A button, never a background job. The suggester reads engine evidence the
 * background queue already stored, so running it costs nothing — but a review
 * queue that fills itself while you are working is a queue you stop trusting,
 * and the first thing a player does with an inbox they did not ask for is
 * ignore all of it.
 *
 * What comes back is idempotent: running it twice adds nothing, refreshes the
 * reason on entries still waiting, and leaves anything already dealt with
 * exactly as it was.
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button';
import { invalidateReview } from '@/features/persistence/queries';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';

import { suggestForGame } from './suggest-for-game';

export function SuggestCandidatesButton() {
  const client = useQueryClient();
  const notify = useUi((state) => state.notify);
  const document = useAnalysis((state) => state.document);
  const tree = useAnalysis((state) => state.tree);
  const [busy, setBusy] = useState(false);

  const gameId = document.kind === 'database-game' ? document.gameId : null;
  if (!gameId) return null;

  const run = async () => {
    setBusy(true);
    try {
      const { suggested, points, sides } = await suggestForGame({
        tree,
        gameId,
        gameLabel: document.title,
      });
      if (suggested === 0) {
        notify({
          tone: 'info',
          message: 'Nothing in this game meets the threshold.',
          detail:
            points === 0
              ? 'There is no saved engine evidence for it yet. Queue it for background analysis first.'
              : sides === 'both'
                ? 'No single move changed the expected result by ten percentage points or more, and nothing is marked critical.'
                : `No ${sides === 'w' ? 'White' : 'Black'} move changed the expected result by ten percentage points or more. This game was queued for ${sides === 'w' ? 'White' : 'Black'}\u2019s decisions only.`,
        });
        return;
      }
      invalidateReview(client);
      notify({
        tone: 'success',
        message: `${suggested} position${suggested === 1 ? '' : 's'} suggested for review.`,
        detail: 'Each one shows the facts behind it. Ignore any that do not interest you.',
      });
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'The suggestions could not be built.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button onClick={() => void run()} disabled={busy}>
      {busy ? 'Reading…' : 'Suggest positions'}
    </Button>
  );
}
