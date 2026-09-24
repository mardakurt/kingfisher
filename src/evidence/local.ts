/**
 * The evaluations this machine holds, as the exchange file carries them:
 * every stored engine answer from the analysis queue, and every position a
 * saved deep analysis searched itself. Nothing received from another file is
 * sent on — a file carries what its exporter's own engines found.
 */

import type { DeepNode } from '@/engine/deepen';
import type { DeepAnalysisJobRecord, StoredEngineEvidenceRecord } from '@/persistence/domain';
import { STORE_NAMES } from '@/persistence/schema/migrations';
import type { AppRepositories } from '@/persistence/types';

import type { LocalEvaluation } from './exchange';

function fromTree(job: DeepAnalysisJobRecord): LocalEvaluation[] {
  const out: LocalEvaluation[] = [];
  const walk = (node: DeepNode) => {
    if (node.evaluation) {
      out.push({
        fen: node.fen,
        engine: job.engineName,
        depth: node.evaluation.depth,
        nodes: node.evaluation.nodes,
        timeMs: node.evaluation.timeMs,
        score: node.evaluation.score,
        pv: [node.evaluation.bestMove],
        analysedAt: job.finishedAt ?? job.updatedAt,
      });
    }
    for (const child of node.children) walk(child);
  };
  walk(job.root as DeepNode);
  return out;
}

export async function localEvaluations(
  repositories: AppRepositories,
): Promise<readonly LocalEvaluation[]> {
  const evidence = await repositories.raw.getAll<StoredEngineEvidenceRecord>(
    STORE_NAMES.engineEvidence,
  );
  const jobs = await repositories.raw.getAll<DeepAnalysisJobRecord>(STORE_NAMES.deepAnalysisJobs);
  return [
    ...evidence.map((record) => ({
      fen: record.fen,
      engine: record.engineName,
      depth: record.depth,
      nodes: record.nodes,
      timeMs: record.timeMs,
      score: record.score,
      pv: record.pv,
      ...(record.alternatives ? { alternatives: record.alternatives } : {}),
      analysedAt: record.analysedAt,
    })),
    ...jobs.filter((job) => job.status !== 'failed').flatMap(fromTree),
  ];
}
