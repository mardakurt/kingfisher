'use client';

import { Menu, type MenuSection } from '@/components/ui/Menu';
import { cn } from '@/lib/cn';
import { useAnalysisQueue } from '@/features/analysis-queue/queue-store';
import { useImportJob } from '@/features/shell/import-job-store';
import { useUi } from '@/stores/ui-store';

import {
  describeProgress,
  fromQueueJobs,
  hasFailure,
  summarise,
  type BackgroundActivity,
} from './background-activity';

/**
 * What Kingfisher is doing, in one place in the status bar.
 *
 * Restrained on purpose. It renders **nothing** when nothing is running, which
 * is most of the time — a status area that is always occupied is one people
 * stop reading, and this exists to be noticed. One line when something is
 * happening, and a menu when the user wants the detail.
 *
 * See `background-activity.ts` for the rules; this file is only the surface.
 */
export function BackgroundActivityCentre() {
  const importRunning = useImportJob((state) => state.running);
  const importProgress = useImportJob((state) => state.progress);
  const setImportMinimized = useImportJob((state) => state.setMinimized);
  const queueJobs = useAnalysisQueue((state) => state.jobs);
  const queueRunning = useAnalysisQueue((state) => state.running);
  const queueError = useAnalysisQueue((state) => state.error);
  const setImportOpen = useUi((state) => state.setImportOpen);

  const activities: BackgroundActivity[] = [];

  if (importRunning) {
    activities.push({
      id: 'pgn-import',
      label: 'PGN import',
      state: 'running',
      progress:
        importProgress && importProgress.total > 0
          ? importProgress.completed / importProgress.total
          : null,
      detail: importProgress
        ? describeProgress(importProgress.completed, importProgress.total, 'game')
        : null,
    });
  }

  const queue = fromQueueJobs(queueJobs, queueRunning);
  if (queue) activities.push(queue);
  if (queueError) {
    activities.push({
      id: 'analysis-queue-error',
      label: 'Analysis queue',
      state: 'failed',
      progress: null,
      detail: queueError,
    });
  }

  const line = summarise(activities);
  if (line === null) return null;

  const sections: readonly MenuSection[] = [
    {
      id: 'activities',
      items: activities.map((entry) => ({
        id: entry.id,
        label: `${entry.label} — ${STATE_LABEL[entry.state]}${
          entry.detail ? ` · ${entry.detail}` : ''
        }`,
        run: () => {
          /*
            The menu takes you to the surface that owns the work rather than
            trying to control it from here. A second set of pause and cancel
            buttons is a second thing to keep correct, and getting it wrong
            would mean cancelling the wrong job from a status bar.
          */
          if (entry.id === 'pgn-import') {
            setImportMinimized(false);
            setImportOpen(true);
          }
        },
      })),
    },
  ];

  const failing = hasFailure(activities);

  return (
    <Menu
      align="end"
      sections={sections}
      trigger={({ toggle, open, id }) => (
        <button
          type="button"
          id={id}
          onClick={toggle}
          aria-expanded={open}
          aria-haspopup="menu"
          data-background-activity
          className={cn(
            'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[3px] px-1.5 text-[10.5px] transition-colors hover:bg-surface-2',
            failing ? 'text-negative' : 'text-secondary',
          )}
        >
          <span
            aria-hidden
            className={cn(
              'h-1.5 w-1.5 shrink-0 rounded-full',
              failing ? 'bg-negative' : 'animate-pulse bg-accent',
            )}
          />
          {line}
        </button>
      )}
    />
  );
}

const STATE_LABEL = {
  running: 'running',
  paused: 'paused',
  completed: 'completed',
  failed: 'failed',
} as const;
