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
  useEffect(() => {
    // React's hydration snapshot can still contain defaults on the first
    // render. Read the hydrated store before deciding to open the tour.
    const launch = () => {
      if (usePreferences.getState().tourShowOnLaunch) {
        useUi.setState({ tourOpen: true });
      }
    };
    if (usePreferences.persist.hasHydrated()) launch();
    return usePreferences.persist.onFinishHydration(launch);
  }, []);
}
