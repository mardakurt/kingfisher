'use client';

/**
 * Playing through a line on a timer, the way a game is replayed on a
 * demonstration board: one move every `AUTOPLAY_INTERVAL_MS`, stopping at the
 * end of the line. It only moves the cursor — `forward()`, the same step as
 * the → key — so nothing about the tree changes, and the engine, explorer and
 * notation follow it as they follow any other step.
 *
 * Started from the end of a line it begins again from the start, which is
 * what a person pressing Play on a finished game means.
 */

import { useEffect } from 'react';

import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';

export const AUTOPLAY_INTERVAL_MS = 1200;

const atEnd = (): boolean => {
  const { tree, currentId } = useAnalysis.getState();
  return (tree.nodes[currentId]?.children.length ?? 0) === 0;
};

/** Start or stop the replay. */
export function toggleAutoplay(): void {
  const ui = useUi.getState();
  if (ui.autoplaying) {
    ui.setAutoplaying(false);
    return;
  }
  const analysis = useAnalysis.getState();
  if (atEnd()) {
    // A line with no moves at all has nothing to replay.
    if (analysis.currentId === analysis.tree.rootId) return;
    analysis.toStart();
  }
  ui.setAutoplaying(true);
}

/** Drives the replay while it is on; mounted once, under the board. */
export function useAutoplay(enabled: boolean): void {
  const playing = useUi((state) => state.autoplaying);
  const setAutoplaying = useUi((state) => state.setAutoplaying);

  useEffect(() => {
    if (!enabled && playing) setAutoplaying(false);
  }, [enabled, playing, setAutoplaying]);

  // A board arrives still and leaves still: a replay is never carried to
  // the next board, nor started by a command run where there was none.
  useEffect(() => {
    setAutoplaying(false);
    return () => setAutoplaying(false);
  }, [setAutoplaying]);

  useEffect(() => {
    if (!playing || !enabled) return;
    const timer = window.setInterval(() => {
      if (atEnd()) {
        setAutoplaying(false);
        return;
      }
      useAnalysis.getState().forward();
      if (atEnd()) setAutoplaying(false);
    }, AUTOPLAY_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, playing, setAutoplaying]);
}
