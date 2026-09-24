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

import { selectSaveState, useAnalysis } from '@/stores/analysis-store';

import { useWriteTracker } from './use-write-tracker';

type Status = 'saved' | 'saving' | 'failed' | 'edited';

const dotClassFor = (status: Status): string => {
  if (status === 'saving' || status === 'edited') return 'bg-tertiary';
  if (status === 'failed') return 'bg-negative';
  return 'bg-positive';
};

const labelFor = (status: Status, failureLabel: string | null): string => {
  if (status === 'saving') return 'Saving…';
  if (status === 'edited') return 'Edited';
  if (status === 'failed') {
    if (failureLabel) return `Save failed: ${failureLabel}`;
    return 'Save failed';
  }
  return 'Saved';
};

const detailFor = (status: Status, failureLabel: string | null): string => {
  if (status === 'edited') {
    return 'Your last change will be written to local storage in a moment.';
  }
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
  const tracked = useWriteTracker();
  /*
    Phase 84: the tracker sees writes in flight, not changes waiting for one.
    In the 900 ms autosave debounce it said "Saved — your last change is on
    local storage" about a move that was not; a change not yet written is
    "Edited", as a Mac document window says it.
  */
  const pending = useAnalysis(
    (state) => state.document.kind === 'study-chapter' && selectSaveState(state) === 'unsaved',
  );
  const status: Status = tracked.status === 'saved' && pending ? 'edited' : tracked.status;
  const failureLabel = tracked.failureLabel;

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
