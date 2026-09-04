'use client';

import { create } from 'zustand';

import type { ProviderHealthState } from '@/database/types';
import type { LinkedAccountRecord } from '@/persistence/domain';
import { getRepositories } from '@/persistence/repositories';
import { syncAccount } from '@/sync/account-sync';
import { SyncFetchError } from '@/sync/types';

/**
 * What the last sync of one account did, in the terms the user is owed.
 *
 * §25: an account that failed to sync must never be reported as an account
 * with no games. `state` is the same vocabulary a database provider reports,
 * so "rate limited" and "network error" mean here exactly what they mean
 * there, and a failure is a failure rather than an empty result.
 */
export interface AccountSyncState {
  readonly running: boolean;
  readonly state: ProviderHealthState;
  readonly message: string;
  readonly remedy?: string;
  readonly imported: number;
  readonly duplicates: number;
  readonly at: number;
}

interface AccountSyncStore {
  /** Keyed by linked-account id. */
  readonly runs: Readonly<Record<string, AccountSyncState>>;
  syncNow(account: LinkedAccountRecord): Promise<void>;
  cancel(accountId: string): void;
  clear(accountId: string): void;
}

const controllers = new Map<string, AbortController>();

export const useAccountSync = create<AccountSyncStore>((set, get) => ({
  runs: {},

  syncNow: async (account) => {
    if (get().runs[account.id]?.running) return;

    const controller = new AbortController();
    controllers.set(account.id, controller);
    const patch = (value: AccountSyncState) =>
      set((current) => ({ runs: { ...current.runs, [account.id]: value } }));

    patch({
      running: true,
      state: 'loading',
      message: 'Syncing…',
      imported: 0,
      duplicates: 0,
      at: Date.now(),
    });

    const repositories = await getRepositories();
    try {
      await repositories.linkedAccounts.update(account.id, (current) => ({
        ...current,
        lastSyncStartedAt: Date.now(),
      }));

      const result = await syncAccount(account, repositories.games, {
        signal: controller.signal,
        ...(await lichessToken()),
      });

      /*
        Cursors are written only after the import they describe has landed.
        A cursor advanced before the write would turn a failed import into
        permanently skipped games — the one failure mode of an incremental
        sync that the user could never detect or recover from.
      */
      await repositories.linkedAccounts.update(account.id, (current) => ({
        ...current,
        ...(result.cursor.lastGameTimestamp !== undefined
          ? { lastGameTimestamp: result.cursor.lastGameTimestamp }
          : {}),
        ...(result.cursor.monthEtags !== undefined ? { monthEtags: result.cursor.monthEtags } : {}),
        ...(result.cursor.lastSyncedMonth !== undefined
          ? { lastSyncedMonth: result.cursor.lastSyncedMonth }
          : {}),
        lastSyncCompletedAt: Date.now(),
        lastSyncStatus: 'success',
        lastError: undefined,
        importedCount: current.importedCount + result.imported,
        duplicatesSkipped: current.duplicatesSkipped + result.duplicates,
      }));

      patch({
        running: false,
        state: 'ready',
        message:
          result.imported > 0
            ? `${result.imported} new ${result.imported === 1 ? 'game' : 'games'}.`
            : 'Up to date.',
        imported: result.imported,
        duplicates: result.duplicates,
        at: Date.now(),
      });
    } catch (error) {
      const failure =
        error instanceof SyncFetchError
          ? { state: error.state, message: error.message, remedy: error.remedy }
          : {
              state: 'network-error' as ProviderHealthState,
              message: error instanceof Error ? error.message : 'The sync failed.',
              remedy: undefined,
            };

      await repositories.linkedAccounts
        .update(account.id, (current) => ({
          ...current,
          lastSyncCompletedAt: Date.now(),
          lastSyncStatus: 'error',
          lastError: failure.message,
        }))
        .catch(() => {
          // The sync already failed; failing to record that must not throw again.
        });

      patch({
        running: false,
        state: failure.state,
        message: failure.message,
        ...(failure.remedy ? { remedy: failure.remedy } : {}),
        imported: 0,
        duplicates: 0,
        at: Date.now(),
      });
    } finally {
      controllers.delete(account.id);
    }
  },

  cancel: (accountId) => controllers.get(accountId)?.abort(),

  clear: (accountId) =>
    set((current) => {
      const { [accountId]: _removed, ...rest } = current.runs;
      return { runs: rest };
    }),
}));

/**
 * The Lichess token the explorer may already hold.
 *
 * Read lazily and only when syncing, so this module does not depend on the
 * preferences store at import time. Absent is fine: a token only raises the
 * rate allowance, it is not needed to read public games.
 */
async function lichessToken(): Promise<{ lichessToken?: string }> {
  const { usePreferences } = await import('@/stores/preferences-store');
  const token = usePreferences.getState().lichessToken;
  return token ? { lichessToken: token } : {};
}
