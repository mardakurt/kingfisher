'use client';

import { useEffect } from 'react';
import { selectFen, useAnalysis } from '@/stores/analysis-store';
import { useEngine } from '@/stores/engine-store';
import { usePreferences } from '@/stores/preferences-store';

/** Every studio route shares this guard, even when the engine panel is closed. */
export function useEnginePositionGuard(): void {
  useEffect(() => {
    let fen = selectFen(useAnalysis.getState());
    useEngine.getState().invalidatePosition(fen);
    const unsubscribePosition = useAnalysis.subscribe((state) => {
      const next = selectFen(state);
      if (next === fen) return;
      fen = next;
      useEngine.getState().invalidatePosition(next);
    });
    const unsubscribeConfig = usePreferences.subscribe((state, previous) => {
      if (
        state.engineMultiPv === previous.engineMultiPv &&
        state.engineThreads === previous.engineThreads &&
        state.engineHashMb === previous.engineHashMb &&
        state.engineLimit === previous.engineLimit
      )
        return;
      useEngine.getState().reconfigureRunning(state.engineLimit, {
        multiPv: state.engineMultiPv,
        threads: state.engineThreads,
        hashMb: state.engineHashMb,
      });
    });
    return () => {
      unsubscribePosition();
      unsubscribeConfig();
    };
  }, []);
}
