'use client';

import { Menu, type MenuSection } from '@/components/ui/Menu';
import { cn } from '@/lib/cn';
import { useAnalysisQueue } from '@/features/analysis-queue/queue-store';
import { useImportJob } from '@/features/shell/import-job-store';
import { useTransferJob } from '@/features/databases/transfer-job-store';
import { useAccountSync } from '@/stores/account-sync-store';
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
  const transferRunning = useTransferJob((state) => state.running);
  const transferLabel = useTransferJob((state) => state.label);
  const transferKind = useTransferJob((state) => state.kind);
  const transferProgress = useTransferJob((state) => state.progress);
  const queueJobs = useAnalysisQueue((state) => state.jobs);
  const queueRunning = useAnalysisQueue((state) => state.running);
  const queueError = useAnalysisQueue((state) => state.error);
  const syncRuns = useAccountSync((state) => state.runs);
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

  /*
    A bulk database operation. Progress has no denominator — the source's own
    page cursor is the only thing that knows how far there is to go — so this
    reports the counts it has rather than a fraction it would have to invent.
  */
  if (transferRunning) {
    activities.push({
      id: 'database-transfer',
      label: transferKind === 'move' ? 'Moving games' : 'Copying games',
      state: 'running',
      progress: null,
      detail: transferProgress
        ? `${transferLabel ?? ''} · ${transferProgress.written.toLocaleString()} written`.trim()
        : transferLabel,
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

  /*
    A sync is shown while it runs and while it is failed, but not once it has
    quietly succeeded: "Lichess sync completed" is exactly the finished-work
    announcement this strip exists not to make. The Accounts panel keeps the
    outcome; this only reports what is happening or what went wrong.
  */
  for (const [accountId, run] of Object.entries(syncRuns)) {
    const label = `${accountId.split(':')[0] === 'lichess' ? 'Lichess' : 'Chess.com'} sync`;
    if (run.running) {
      activities.push({ id: accountId, label, state: 'running', progress: null, detail: null });
    } else if (run.state !== 'ready' && run.state !== 'loading') {
      activities.push({
        id: accountId,
        label,
        state: 'failed',
        progress: null,
        detail: run.message,
      });
    }
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
