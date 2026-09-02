'use client';

import { useEffect } from 'react';

import { getRepositories } from '@/persistence/repositories';
import { useEngine } from '@/stores/engine-store';
import { useAnalysisQueue } from './queue-store';

/** Lifecycle bridge: persisted jobs stay idle until the user explicitly starts them. */
export function AnalysisQueueProvider() {
  const interactive = useEngine((state) => state.primary.running || state.secondary.running);
  const refresh = useAnalysisQueue((state) => state.refresh);
  const setForegroundActive = useAnalysisQueue((state) => state.setForegroundActive);

  useEffect(() => {
    void (async () => {
      /*
        A job left `running` by a closed tab has no owner and would otherwise
        be invisible to `claimNext` forever. Recovering it to `paused` states
        the truth — it is resumable, and nothing is analysing it — without
        starting heavy engine work nobody asked for on this launch.
      */
      try {
        await (await getRepositories()).analysisQueue.recoverInterrupted();
      } catch {
        // Recovery is best-effort; refresh still reports whatever is stored.
      }
      await refresh();
    })();
  }, [refresh]);

  useEffect(() => {
    setForegroundActive(interactive);
  }, [interactive, setForegroundActive]);

  return null;
}
