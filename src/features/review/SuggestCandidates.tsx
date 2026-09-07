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

import { positionKey } from '@/chess/fen';
import { Button } from '@/components/ui/Button';
import { invalidateReview } from '@/features/persistence/queries';
import { getRepositories } from '@/persistence/repositories';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';

import { suggestReviewCandidates, type EvidencePoint } from './candidates';

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
      const repositories = await getRepositories();
      const evidence = await repositories.analysisQueue.evidenceForGame(gameId);

      /*
        Whose decisions this game was analysed for.

        The job carries it, and the most recent one for this game is the answer
        — a player who queued their own game as White asked for their own
        moves, and the review is where that request can actually be honoured.
        Absent means both, which is what every job queued before the control
        existed meant.
      */
      const jobs = await repositories.analysisQueue.list();
      const sides = jobs.filter((job) => job.gameId === gameId).at(-1)?.sides ?? 'both';

      /*
        Stored evidence first, then whatever the tree itself carries. A game
        analysed by the background queue has rows; a game the user walked
        through with the engine on has evaluations on its nodes. Both are the
        same kind of fact, and using both means the suggester works before the
        queue has ever run.
      */
      const points: EvidencePoint[] = [
        ...evidence.map((row) => ({
          nodeId: row.nodeId,
          score: row.score,
          ...(row.pv[0] ? { bestMoveUci: row.pv[0] } : {}),
          ...(row.depth ? { depth: row.depth } : {}),
          /*
            The first move of every line the pass recorded, best first. A
            record written before alternatives were kept, or a MultiPV 1 pass,
            supplies none, and the rule that reads this declines to fire
            without at least two.
          */
          ...(row.alternatives && row.alternatives.length > 0
            ? {
                candidateUcis: [
                  ...(row.pv[0] ? [row.pv[0]] : []),
                  ...row.alternatives.flatMap((line) => (line.pv[0] ? [line.pv[0]] : [])),
                ],
              }
            : {}),
        })),
        ...Object.values(tree.nodes).flatMap((node) =>
          node.evaluation && !evidence.some((row) => row.nodeId === node.id)
            ? [
                {
                  nodeId: node.id,
                  score: node.evaluation.score,
                  ...(node.evaluation.bestMove ? { bestMoveUci: node.evaluation.bestMove } : {}),
                  ...(node.evaluation.depth ? { depth: node.evaluation.depth } : {}),
                },
              ]
            : [],
        ),
      ];

      const candidates = suggestReviewCandidates(tree, points, positionKey, { sides });
      if (candidates.length === 0) {
        notify({
          tone: 'info',
          message: 'Nothing in this game meets the threshold.',
          detail:
            points.length === 0
              ? 'There is no saved engine evidence for it yet. Queue it for background analysis first.'
              : sides === 'both'
                ? 'No single move changed the expected result by ten percentage points or more, and nothing is marked critical.'
                : `No ${sides === 'w' ? 'White' : 'Black'} move changed the expected result by ten percentage points or more. This game was queued for ${sides === 'w' ? 'White' : 'Black'}\u2019s decisions only.`,
        });
        return;
      }

      for (const candidate of candidates) {
        await repositories.review.upsertReviewItem({
          positionKey: candidate.positionKey,
          fen: candidate.fen as never,
          sideToMove: candidate.sideToMove,
          source: 'suggested',
          gameId,
          gameLabel: document.title,
          nodeId: candidate.nodeId,
          ply: candidate.ply,
          ...(candidate.category ? { category: candidate.category } : {}),
          reason: candidate.reason,
          signals: candidate.signals,
        });
      }
      invalidateReview(client);
      notify({
        tone: 'success',
        message: `${candidates.length} position${candidates.length === 1 ? '' : 's'} suggested for review.`,
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
