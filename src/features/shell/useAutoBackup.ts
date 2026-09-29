'use client';

/**
 * One-time auto-backup check on app launch.
 *
 * Mounted once near the root. Decides whether a backup is due, runs it,
 * and exposes the result via a small Zustand-friendly store the
 * status-bar indicator reads.
 *
 * The backup is fire-and-forget from the user's perspective: the app
 * loads as quickly as it did before, and the status bar updates when
 * the run finishes. A failed run leaves `lastBackupAt` at whatever it
 * was, so the next launch will try again.
 */

import { useEffect } from 'react';
import { create } from 'zustand';

import { usePreferences } from '@/stores/preferences-store';
import { portablePreferences } from '@/stores/portable-preferences';

import { getRepositories } from '@/persistence/repositories';
import { ensureBackup, mostRecentBackup } from '@/features/shell/auto-backup';
import { installedReferenceSources } from '@/reference/manager';

interface AutoBackupState {
  lastBackupAt: number | null;
  status: 'idle' | 'checking' | 'running' | 'failed' | 'unavailable';
  setState: (next: Partial<AutoBackupState>) => void;
}

export const useAutoBackupState = create<AutoBackupState>((merge) => ({
  lastBackupAt: null,
  status: 'idle',
  setState: (next) => merge(next),
}));

/**
 * The hook the app shell calls. Loads the last-backup timestamp on
 * mount, then fires `ensureBackup` exactly once.
 */
export function useAutoBackup(): void {
  const setState = useAutoBackupState((state) => state.setState);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setState({ status: 'checking' });

      /*
        Reading the store is the step that can fail for reasons the run itself
        cannot: IndexedDB is unavailable in a private window, refused by a
        blocked-storage policy, or holds a database this build cannot open. It
        used to be unguarded, and both consequences were false statements. The
        rejection escaped as an unhandled promise, and `status` stayed at
        `checking` — which the indicator renders as its most alarming state, a
        red "No backup yet", on a workspace that may hold a backup from
        yesterday. An unknown is not a zero: `unavailable` says the store could
        not be read, which is what happened and is a different thing to act on.
      */
      let repositories: Awaited<ReturnType<typeof getRepositories>>;
      let recent: Awaited<ReturnType<typeof mostRecentBackup>>;
      try {
        repositories = await getRepositories();
        recent = await mostRecentBackup(repositories.raw);
      } catch {
        if (cancelled) return;
        setState({ status: 'unavailable' });
        return;
      }

      if (cancelled) return;
      const lastBackupAt = recent?.createdAt ?? null;
      setState({ lastBackupAt });

      const prefs = usePreferences.getState();
      const preferences = portablePreferences(prefs);
      const enabled = prefs.autoBackupEnabled;
      const scheduleDays = prefs.autoBackupReminderDays;
      const retention = prefs.autoBackupRetention;

      if (!enabled) {
        setState({ status: 'idle' });
        return;
      }

      setState({ status: 'running' });
      const result = await ensureBackup(repositories.raw, preferences, {
        lastBackupAt,
        enabled,
        scheduleDays,
        retention,
        referenceSources: installedReferenceSources(),
      });
      if (cancelled) return;
      if (result.status === 'succeeded') {
        setState({ lastBackupAt: result.createdAt, status: 'idle' });
      } else if (result.status === 'failed') {
        setState({ status: 'failed' });
      } else {
        setState({ status: 'idle' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setState]);
}
