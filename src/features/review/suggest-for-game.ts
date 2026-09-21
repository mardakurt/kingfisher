/**
 * Turn the engine evidence a game already has into review items.
 *
 * Shared by the Review workspace's _Suggest positions_ button and the
 * After-the-round tool, so both produce the same items from the same
 * facts: stored queue evidence first, then whatever evaluations the tree
 * itself carries. Idempotent — running it twice adds nothing.
 */
import { positionKey } from '@/chess/fen';
import type { GameTree } from '@/chess/tree/types';
import type { AnalysisQueueSides } from '@/persistence/domain';
import { getRepositories } from '@/persistence/repositories';

import { suggestReviewCandidates, type EvidencePoint } from './candidates';
import { strategicContextForNode } from './strategic-context';

export interface SuggestForGameResult {
  /** Items written (or refreshed) this run. */
  readonly suggested: number;
  /** Evidence points the suggester read; zero means nothing has analysed the game. */
  readonly points: number;
  readonly sides: AnalysisQueueSides;
}

export async function suggestForGame(input: {
  readonly tree: GameTree;
  readonly gameId: string;
  readonly gameLabel: string;
}): Promise<SuggestForGameResult> {
  const { tree, gameId, gameLabel } = input;
  const repositories = await getRepositories();
  const evidence = await repositories.analysisQueue.evidenceForGame(gameId);

  /*
    Whose decisions this game was analysed for: the most recent job for the
    game says. Absent means both, which is what every job queued before the
    control existed meant.
  */
  const jobs = await repositories.analysisQueue.list();
  const sides = jobs.filter((job) => job.gameId === gameId).at(-1)?.sides ?? 'both';

  const points: EvidencePoint[] = [
    ...evidence.map((row) => ({
      nodeId: row.nodeId,
      score: row.score,
      ...(row.pv[0] ? { bestMoveUci: row.pv[0] } : {}),
      ...(row.depth ? { depth: row.depth } : {}),
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
  for (const candidate of candidates) {
    const transitions = strategicContextForNode(tree, candidate.nodeId);
    await repositories.review.upsertReviewItem({
      positionKey: candidate.positionKey,
      fen: candidate.fen as never,
      sideToMove: candidate.sideToMove,
      source: 'suggested',
      gameId,
      gameLabel,
      nodeId: candidate.nodeId,
      ply: candidate.ply,
      ...(candidate.category ? { category: candidate.category } : {}),
      reason: candidate.reason,
      signals: candidate.signals,
      ...(transitions.length > 0 ? { strategicContext: transitions } : {}),
    });
  }
  return { suggested: candidates.length, points: points.length, sides };
}
