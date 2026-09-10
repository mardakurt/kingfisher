'use client';

/**
 * React view of the persistence write tracker.
 *
 * The brief (PART P) wants the visible workspace status to reflect
 * the real write state, not just the storage-persistence promise:
 *
 *   'saving'    — at least one readwrite transaction is in flight
 *                 and has not yet settled. The user has just typed
 *                 something; the bytes are not on disk yet.
 *   'saved'     — no in-flight writes, and no failure since the
 *                 last successful write. The "Saved on this device"
 *                 indicator is honest.
 *   'failed'    — a write has rejected since the last successful
 *                 write. The indicator says "Save failed" and a
 *                 retry is offered.
 *
 * The hook is SSR-safe; the first render returns `'saved'`. The
 * tracker is a browser-only singleton, so the second render, on
 * the client, can only become non-saved if a write is actually
 * pending.
 */

import { useEffect, useState } from 'react';

import { getWriteTracker } from './write-tracker';

export type WriteTrackerStatus = 'saved' | 'saving' | 'failed';

export interface UseWriteTrackerResult {
  readonly status: WriteTrackerStatus;
  /** The label of the most recent failed write, if any. */
  readonly failureLabel: string | null;
}

export function useWriteTracker(): UseWriteTrackerResult {
  const [status, setStatus] = useState<WriteTrackerStatus>('saved');
  const [failureLabel, setFailureLabel] = useState<string | null>(null);

  useEffect(() => {
    const tracker = getWriteTracker();
    const evaluate = (): void => {
      const inflight = tracker.inflight();
      if (inflight > 0) {
        setStatus('saving');
        return;
      }
      const last = tracker.lastFailure();
      if (last) {
        setStatus('failed');
        setFailureLabel(last.label);
        return;
      }
      setStatus('saved');
      setFailureLabel(null);
    };
    evaluate();
    return tracker.subscribe(evaluate);
  }, []);

  return { status, failureLabel };
}
