/**
 * Every durable analysis job, in one shape (Phase 86, P0.3).
 *
 * Kingfisher runs two kinds of engine work that outlive the page: the
 * analysis queue (a game, position by position, stored per position) and deep
 * analysis (a tree deepened from one position, saved after every search).
 * Each kept its own record with its own states. This projects both into one
 * view with one vocabulary, so a person sees in one list what is queued,
 * running, paused, finished, failed or cancelled; what it was given (a game
 * or a position); which engine; what budget; and how far it has got — the
 * checkpoint a resume starts from.
 *
 * It is a projection: the records stay the authority, and nothing here writes.
 * A state the records cannot express is not invented: neither job kind has a
 * "retrying" or "blocked-on-merge" of its own (a write-back that finds its
 * chapter changed is refused and reported where it happens,
 * `analysis-write-back-repository.ts`).
 */

import type { AnalysisQueueJobRecord, DeepAnalysisJobRecord } from '@/persistence/domain';

export type JobState =
  'queued' | 'running' | 'paused' | 'interrupted' | 'completed' | 'failed' | 'cancelled';

export interface AnalysisJobView {
  readonly id: string;
  readonly kind: 'queue' | 'deep';
  readonly state: JobState;
  readonly title: string;
  /** What it was given: a stored game, or a starting position. */
  readonly input: { readonly gameId: string } | { readonly fen: string };
  readonly engine: { readonly id: string; readonly name: string | null };
  /** The budget, in words: per position and in all. */
  readonly budget: string;
  /** How far it has got; `total` is null when the job does not know it in advance. */
  readonly checkpoint: {
    readonly done: number;
    readonly total: number | null;
    readonly unit: string;
  };
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly failure?: string;
}

const describeLimit = (limit: AnalysisQueueJobRecord['limit']): string =>
  limit.kind === 'depth'
    ? `depth ${limit.depth}`
    : limit.kind === 'nodes'
      ? `${limit.nodes.toLocaleString('en-GB')} nodes`
      : limit.kind === 'movetime'
        ? `${(limit.ms / 1000).toLocaleString('en-GB')} s`
        : 'no limit';

/**
 * A queue job, as the queue records it. A job the store says is running but
 * whose owner has stopped beating (a tab closed mid-job) is `interrupted`:
 * the queue's own recovery (`recoverInterrupted`) resumes it from `nextIndex`.
 */
export function fromQueueJob(
  job: AnalysisQueueJobRecord,
  { now, staleAfterMs = 30_000 }: { readonly now: number; readonly staleAfterMs?: number },
): AnalysisJobView {
  const heartbeatStale =
    job.status === 'running' &&
    (job.heartbeatAt === undefined || now - job.heartbeatAt > staleAfterMs);
  return {
    id: job.id,
    kind: 'queue',
    state: heartbeatStale ? 'interrupted' : job.status,
    title: job.gameLabel,
    input: { gameId: job.gameId },
    engine: { id: job.engineId, name: null },
    budget: `${describeLimit(job.limit)} a position · MultiPV ${job.multiPv}${
      job.sides && job.sides !== 'both' ? ` · ${job.sides === 'w' ? 'White' : 'Black'}'s moves` : ''
    }`,
    checkpoint: { done: job.nextIndex, total: job.totalPositions, unit: 'positions' },
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    ...(job.error ? { failure: job.error } : {}),
  };
}

/**
 * A deep analysis. `running` in its record means "being worked on or waiting
 * to be resumed"; which of the two is known only to the page that holds it,
 * so the caller says whether one is active here.
 */
export function fromDeepJob(
  job: DeepAnalysisJobRecord,
  { activeHere }: { readonly activeHere: boolean },
): AnalysisJobView {
  const state: JobState =
    job.status === 'done'
      ? 'completed'
      : job.status === 'stopped'
        ? 'cancelled'
        : job.status === 'failed'
          ? 'failed'
          : activeHere
            ? 'running'
            : 'paused';
  return {
    id: job.id,
    kind: 'deep',
    state,
    title: `Deep analysis${job.resumed ? ` · resumed ${job.resumed}×` : ''}`,
    input: { fen: job.startFen },
    engine: { id: job.engineId, name: job.engineName },
    budget: `${(job.options.msPerPosition / 1000).toLocaleString('en-GB')} s a position · breadth ${job.options.breadth} · up to ${job.options.budget.toLocaleString('en-GB')} positions`,
    checkpoint: { done: job.searched, total: job.options.budget, unit: 'positions searched' },
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    ...(job.error ? { failure: job.error } : {}),
  };
}

const ORDER: Record<JobState, number> = {
  running: 0,
  interrupted: 1,
  paused: 2,
  queued: 3,
  failed: 4,
  completed: 5,
  cancelled: 6,
};

/** Both kinds, what needs attention first, then newest. */
export function jobsView(views: readonly AnalysisJobView[]): readonly AnalysisJobView[] {
  return [...views].sort(
    (a, b) =>
      ORDER[a.state] - ORDER[b.state] || b.updatedAt - a.updatedAt || (a.id < b.id ? -1 : 1),
  );
}
