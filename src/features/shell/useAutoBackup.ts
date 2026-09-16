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

import { getRepositories } from '@/persistence/repositories';
import { ensureBackup, mostRecentBackup } from '@/features/shell/auto-backup';

interface AutoBackupState {
  lastBackupAt: number | null;
  status: 'idle' | 'checking' | 'running' | 'failed';
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
      const repositories = await getRepositories();
      const recent = await mostRecentBackup(repositories.raw);
      if (cancelled) return;
      const lastBackupAt = recent?.createdAt ?? null;
      setState({ lastBackupAt });

      const preferences = repositories.raw as unknown as Readonly<Record<string, unknown>>;
      const prefs = JSON.parse(
        typeof window === 'undefined' ? '{}' : window.localStorage.getItem('kingfisher.preferences') ?? '{}',
      ) as Record<string, unknown>;
      const enabled = (prefs.autoBackupEnabled as boolean | undefined) ?? true;
      const scheduleDays = (prefs.autoBackupReminderDays as number | undefined) ?? 7;
      const retention = (prefs.autoBackupRetention as number | undefined) ?? 3;

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