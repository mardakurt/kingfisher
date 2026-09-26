'use client';

/**
 * Every durable analysis job in one list (Phase 86, P0.3): the analysis
 * queue's games and the deep analyses, in one vocabulary — what each was
 * given, which engine, what budget, how far it has got and what state it is
 * in (`src/engine/jobs.ts`). Read-only; each kind is run and stopped where
 * it lives, and the list says where.
 */

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Dialog } from '@/components/ui/Dialog';
import { fromDeepJob, fromQueueJob, jobsView, type AnalysisJobView } from '@/engine/jobs';
import { getRepositories } from '@/persistence/repositories';
import { useDeepen } from '@/features/engine/deepen-store';

const STATE_LABEL: Record<AnalysisJobView['state'], string> = {
  queued: 'Queued',
  running: 'Running',
  paused: 'Paused — resumes from its checkpoint',
  interrupted: 'Interrupted — resumes from its checkpoint',
  completed: 'Finished',
  failed: 'Failed',
  cancelled: 'Stopped',
};

export function AnalysisJobsDialog({ onClose }: { readonly onClose: () => void }) {
  const [now] = useState(() => Date.now());
  const activeDeep = useDeepen((state) => (state.status === 'running' ? state.jobId : null));
  const jobs = useQuery({
    queryKey: ['analysis-jobs', activeDeep],
    queryFn: async () => {
      const repositories = await getRepositories();
      const [queue, deep] = await Promise.all([
        repositories.analysisQueue.list(),
        repositories.deepAnalysis.list(),
      ]);
      return jobsView([
        ...queue.map((job) => fromQueueJob(job, { now })),
        ...deep.map((job) => fromDeepJob(job, { activeHere: job.id === activeDeep })),
      ]);
    },
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title="Analysis jobs"
      description="Engine work that outlives the page: the analysis queue in the Library, and deep analyses from the Engine panel. Each is saved as it goes and resumes from where it stopped."
      width="w-[680px]"
    >
      <div className="text-xs" data-analysis-jobs>
        {jobs.isPending ? (
          <p role="status">Reading the jobs…</p>
        ) : jobs.isError ? (
          <p role="alert" className="text-negative">
            The jobs could not be read:{' '}
            {jobs.error instanceof Error ? jobs.error.message : 'unknown error'}
          </p>
        ) : (jobs.data ?? []).length === 0 ? (
          <p className="text-secondary">
            No analysis jobs. Queue games from the Library, or start a deep analysis from the Engine
            panel.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {(jobs.data ?? []).map((job) => (
              <li
                key={`${job.kind}:${job.id}`}
                data-analysis-job={job.state}
                className="rounded-[6px] border border-line bg-surface-inset p-2.5"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-primary">{job.title}</span>
                  <span className="shrink-0 text-[10.5px] text-secondary">
                    {STATE_LABEL[job.state]}
                  </span>
                </div>
                <p className="mt-0.5 text-[10.5px] text-tertiary">
                  {job.kind === 'queue' ? 'Analysis queue' : 'Deep analysis'} ·{' '}
                  {job.engine.name ?? job.engine.id} · {job.budget}
                </p>
                <p className="mt-0.5 text-[10.5px] text-tertiary tabular">
                  {job.checkpoint.done.toLocaleString()}
                  {job.checkpoint.total !== null
                    ? ` of ${job.checkpoint.total.toLocaleString()}`
                    : ''}{' '}
                  {job.checkpoint.unit}
                  {job.failure ? ` · ${job.failure}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
