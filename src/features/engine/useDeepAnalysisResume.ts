'use client';

/**
 * Once per page: pick up a deep analysis the last page left running, or say
 * that one finished while nobody was looking (`resumeDeepen`). Waits for the
 * engines to be discoverable — a native engine is registered by the
 * companion's status — so a resumed run finds the engine it started with.
 */

import { useEffect } from 'react';

import { useUi } from '@/stores/ui-store';

import { resumeDeepen } from './deepen-store';

const SETTLE_MS = 1_500;

/** Asked once per page, however often the shell mounts. */
let asked = false;

export function useDeepAnalysisResume(): void {
  const notify = useUi((state) => state.notify);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (asked) return;
      asked = true;
      void resumeDeepen().then((outcome) => {
        if (outcome === 'resumed') {
          notify({
            tone: 'info',
            message: 'Deep analysis picked up where it stopped.',
            detail: 'It is saved after every position; see the Engine panel.',
          });
        } else if (outcome === 'finished-unseen') {
          notify({
            tone: 'success',
            message: 'A deep analysis finished while Kingfisher was not showing it.',
            detail: 'Its report is in the Engine panel.',
          });
        }
      });
    }, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [notify]);
}
