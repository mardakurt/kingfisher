'use client';

/**
 * First-run tour launcher.
 *
 * On every app launch this hook asks: has the user said "don't show on
 * launch"? If not, it opens the tour. The preference lives in the
 * standard preferences store, so the same lookup works on the web (the
 * IndexedDB-backed persistence layer) and on the desktop (the same
 * layer, with the desktop profile directory backing the localStorage
 * equivalent).
 *
 * The hook is fire-and-forget: the tour opens a moment after boot, and
 * the user can dismiss it before it appears, after it appears, or
 * anywhere in between.
 */

import { useEffect } from 'react';

import { usePreferences } from '@/stores/preferences-store';
import { useUi } from '@/stores/ui-store';

export function useFirstRunTour(): void {
  const showOnLaunch = usePreferences((state) => state.tourShowOnLaunch);

  useEffect(() => {
    /*
     * The hook runs on every launch. The first time, the preference is
     * `true` by default; the user can flip it to false from the tour's
     * "Don't show on launch" checkbox or from the Help menu. A user who
     * has flipped it back to true (Help → Replay tour, when wired) gets
     * the tour back at the next launch.
     */
    if (!showOnLaunch) return;
    useUi.setState({ tourOpen: true });
  }, [showOnLaunch]);
}