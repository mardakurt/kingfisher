'use client';

import { useEffect } from 'react';
import { selectFen, useAnalysis } from '@/stores/analysis-store';
import { useEngine } from '@/stores/engine-store';

/** Every studio route shares this guard, even when the engine panel is closed. */
export function useEnginePositionGuard(): void {
  useEffect(() => {
    let fen = selectFen(useAnalysis.getState());
    useEngine.getState().invalidatePosition(fen);
    return useAnalysis.subscribe((state) => {
      const next = selectFen(state);
      if (next === fen) return;
      fen = next;
      useEngine.getState().invalidatePosition(next);
    });
  }, []);
}
