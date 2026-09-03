/**
 * One answer to "what is Kingfisher doing?".
 *
 * Long-running work accumulated a surface each: PGN import had a dialog that
 * could be minimised, the analysis queue had its own dialog on Games,
 * structure backfill reported inside the Databases route, and integrity
 * repair inside Diagnostics. Each was reasonable where it was built, and
 * together they meant the only way to find out whether anything was still
 * running was to remember which route had started it — §31's complaint.
 *
 * This module is the shape of that answer, not the surface. It is pure so the
 * states can be tested without mounting four subsystems, and so the surface
 * can be a strip, a menu or a badge without the rules moving.
 */

export type ActivityState = 'running' | 'paused' | 'completed' | 'failed';

export interface BackgroundActivity {
  readonly id: string;
  /** What it is, in the user's terms. */
  readonly label: string;
  readonly state: ActivityState;
  /** Fraction complete, or null when the work cannot say. */
  readonly progress: number | null;
  /** A short factual line: "2 of 40 games", "quota exceeded". */
  readonly detail: string | null;
}

/**
 * The single line the status bar shows.
 *
 * Failures first, because a failed job is the only one that needs a decision;
 * then running work, because that is what the user is waiting for. Completed
 * and paused work is reachable from the menu but does not claim the strip —
 * a status area that keeps announcing finished work is one people stop
 * reading, which is the same failure as toast spam in a quieter font.
 */
export function summarise(activities: readonly BackgroundActivity[]): string | null {
  const failed = activities.filter((entry) => entry.state === 'failed');
  if (failed.length === 1) return `${failed[0]?.label} failed`;
  if (failed.length > 1) return `${failed.length} background tasks failed`;

  const running = activities.filter((entry) => entry.state === 'running');
  if (running.length === 0) return null;
  if (running.length === 1) {
    const only = running[0] as BackgroundActivity;
    return only.detail ? `${only.label} · ${only.detail}` : only.label;
  }
  return `${running.length} background tasks running`;
}

/** Whether anything needs the user's attention rather than just their patience. */
export const hasFailure = (activities: readonly BackgroundActivity[]): boolean =>
  activities.some((entry) => entry.state === 'failed');

/** "2 of 40 games" — plural handled once, rather than at four call sites. */
export function describeProgress(completed: number, total: number, unit: string): string | null {
  if (total <= 0) return null;
  return `${completed} of ${total} ${total === 1 ? unit : `${unit}s`}`;
}

/**
 * Analysis-queue rows collapsed into one activity.
 *
 * The queue is many database rows and one piece of work as far as the user is
 * concerned: "eleven games queued" is the fact, not eleven separate entries
 * that would crowd out everything else in the list.
 */
export function fromQueueJobs(
  jobs: readonly {
    readonly status: string;
    readonly nextIndex: number;
    readonly totalPositions: number;
  }[],
  running: boolean,
): BackgroundActivity | null {
  const active = jobs.filter((job) => job.status === 'pending' || job.status === 'running');
  const failed = jobs.filter((job) => job.status === 'failed');
  if (active.length === 0 && failed.length === 0) return null;

  const positions = active.reduce((sum, job) => sum + job.totalPositions, 0);
  const done = active.reduce((sum, job) => sum + job.nextIndex, 0);

  if (active.length === 0) {
    return {
      id: 'analysis-queue',
      label: 'Analysis queue',
      state: 'failed',
      progress: null,
      detail: describeProgress(failed.length, failed.length, 'game') ?? null,
    };
  }

  return {
    id: 'analysis-queue',
    label: 'Analysis queue',
    // Queued-but-stopped is paused, not running: a queue that reports itself
    // as running while the engine is idle is a status line that lies.
    state: running ? 'running' : 'paused',
    progress: positions > 0 ? done / positions : null,
    detail: describeProgress(active.length, active.length, 'game'),
  };
}
