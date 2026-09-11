'use client';

/**
 * A quiet save-state indicator for the Study editing surface.
 *
 * Phase 39 (PART D-E): the sidebar's "Saved on this device" line
 * is honest about the write tracker, but a player in the middle of
 * editing a study is unlikely to be looking at the sidebar. This
 * component renders the *same* write-tracker truth (no new state,
 * no duplicate logic) in a compact form, close to the move tree
 * where the work is actually happening.
 *
 * The visible states are:
 *
 *   - "Saving…" while a write is in flight,
 *   - "Saved" once everything is on disk,
 *   - "Save failed" if a write has rejected since the last success,
 *     with the failed-record label so the user knows what was at
 *     risk.
 *
 * This component does NOT add a "Save" button. Autosave is the
 * model. It does NOT replace the sidebar status. It is a quiet
 * mirror of the same signal at the editing surface, so a user who
 * is reading a study does not have to scan the chrome to know
 * whether their last keystroke is on disk.
 *
 * The status reflects only what `useWriteTracker` reports; the
 * `persistence` half of the saved-state model is the sidebar's
 * concern (see `StoragePersistenceStatus`). Keeping the two
 * surfaces split by role is what lets each stay quiet: the
 * sidebar owns "is the browser keeping my work", the study owns
 * "is my last edit on disk".
 */

import { useWriteTracker } from './use-write-tracker';

const dotClassFor = (status: 'saved' | 'saving' | 'failed'): string => {
  if (status === 'saving') return 'bg-tertiary';
  if (status === 'failed') return 'bg-negative';
  return 'bg-positive';
};

const labelFor = (status: 'saved' | 'saving' | 'failed', failureLabel: string | null): string => {
  if (status === 'saving') return 'Saving…';
  if (status === 'failed') {
    if (failureLabel) return `Save failed: ${failureLabel}`;
    return 'Save failed';
  }
  return 'Saved';
};

const detailFor = (status: 'saved' | 'saving' | 'failed', failureLabel: string | null): string => {
  if (status === 'saving') {
    return 'Your last change is being written to local storage.';
  }
  if (status === 'failed') {
    return failureLabel
      ? `Kingfisher could not save "${failureLabel}". Try again, or download a backup from the sidebar status.`
      : 'Kingfisher could not save this change locally. Try again, or download a backup from the sidebar status.';
  }
  return 'Your last change is on local storage.';
};

export function StudySaveStatus(): React.ReactElement {
  const { status, failureLabel } = useWriteTracker();

  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] text-tertiary"
      data-study-save-status={status}
      data-study-save-failure={failureLabel ?? ''}
      role="status"
      aria-live="polite"
      title={detailFor(status, failureLabel)}
    >
      <span
        aria-hidden
        className={`inline-block h-1 w-1 shrink-0 rounded-full ${dotClassFor(status)}`}
      />
      <span>{labelFor(status, failureLabel)}</span>
    </span>
  );
}
