'use client';

/**
 * "Are we in the middle of a save?"
 *
 * The application persists every editor mutation through TanStack
 * Query's mutation cache. The `phase3Keys` namespace
 * (`useWorkspaceMutation`) is the one writers go through; the
 * general `useMutation` cache is the broader net. The PWA update
 * banner reads the union of those to decide whether forcing a
 * reload would lose work.
 *
 * `isSaving` is true while a mutation is in flight. `hasFailed`
 * stays true until the user dismisses the failure toast that the
 * mutation already produced — the application surfaces a real
 * error there, so the banner is free to stay quiet.
 */

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export interface UnsavedWorkState {
  readonly isSaving: boolean;
  readonly hasFailed: boolean;
}

const EMPTY: UnsavedWorkState = { isSaving: false, hasFailed: false };

export function useUnsavedWork(): UnsavedWorkState {
  const client = useQueryClient();
  const [state, setState] = useState<UnsavedWorkState>(EMPTY);

  useEffect(() => {
    let scheduled: ReturnType<typeof setTimeout> | null = null;
    const cache = client.getMutationCache();
    const recompute = () => {
      const all = cache.getAll();
      const isSaving = all.some((m) => m.state.isPaused || m.state.status === 'pending');
      const hasFailed = all.some((m) => m.state.status === 'error');
      setState((prev) =>
        prev.isSaving === isSaving && prev.hasFailed === hasFailed
          ? prev
          : { isSaving, hasFailed }
      );
    };
    const schedule = () => {
      if (scheduled) return;
      scheduled = setTimeout(() => {
        scheduled = null;
        recompute();
      }, 50);
    };
    recompute();
    const unsubscribe = cache.subscribe(schedule);
    return () => {
      unsubscribe();
      if (scheduled) clearTimeout(scheduled);
    };
  }, [client]);

  return state;
}
