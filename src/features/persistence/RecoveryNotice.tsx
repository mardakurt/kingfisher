'use client';

/**
 * "There is newer work here than the version you are looking at."
 *
 * Only shown when the two genuinely differ. A recovery prompt that appears
 * after every tidy session teaches people to dismiss it without reading, which
 * is exactly the habit that loses work the one time it mattered.
 *
 * The saved chapter is what is on the board while this is up, so the user is
 * never looking at content they have not been told the provenance of.
 */

import { Info } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';

export function RecoveryNotice() {
  const recovery = useAnalysis((state) => state.recovery);
  const accept = useAnalysis((state) => state.acceptRecovery);
  const discard = useAnalysis((state) => state.discardRecovery);
  const notify = useUi((state) => state.notify);

  if (!recovery) return null;

  return (
    <div
      role="alert"
      className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-accent/40 bg-accent/10 px-4 py-2.5"
    >
      <Info className="h-4 w-4 shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-primary">
          Unsaved work was found for “{recovery.chapterTitle}”.
        </p>
        <p className="text-xs text-secondary">
          Edited {ago(recovery.draftedAt)}, after the version now on the board was saved{' '}
          {ago(recovery.savedAt)}. The board is showing the saved version.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          variant="accent"
          onClick={() => {
            accept();
            notify({
              tone: 'success',
              message: 'Recovered work restored. It will save in a moment.',
            });
          }}
        >
          Recover analysis
        </Button>
        <Button onClick={discard}>Discard recovered draft</Button>
      </div>
    </div>
  );
}

/** Coarse on purpose: "4 minutes ago" is the useful part, not the seconds. */
function ago(at: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 60) return 'less than a minute ago';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
