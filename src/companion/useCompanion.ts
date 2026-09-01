'use client';

/**
 * Keeps the module-level companion client in step with the stored preference.
 *
 * The client has to live outside React because engine providers are
 * constructed outside React, but the *configuration* is a user preference like
 * any other. This is the one place the two meet.
 */

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

import { usePreferences } from '@/stores/preferences-store';

import { sqliteProvidersFrom } from '@/database/providers/companion-sqlite';
import { setLichessToken } from '@/database/providers/lichess-auth';
import { setDynamicDatabaseProviders } from '@/database/registry';

import { companionClient, setCompanion } from './session';

export function useCompanionSync(): void {
  const url = usePreferences((state) => state.companionUrl);
  const token = usePreferences((state) => state.companionToken);
  const lichess = usePreferences((state) => state.lichessToken);

  useEffect(() => {
    setCompanion(url && token ? { url, token } : null);
  }, [token, url]);

  /*
    The Lichess provider is constructed outside React too, so its credential is
    mirrored the same way. Grouped here rather than in a second hook because
    both are "a stored secret that a non-React module needs".
  */
  useEffect(() => {
    setLichessToken(lichess);
  }, [lichess]);

  // SQLite collections appear in the explorer's source list only while the
  // companion that owns them is answering.
  const status = useCompanionStatus();
  const databases = status.data?.databases;
  useEffect(() => {
    setDynamicDatabaseProviders(databases ? sqliteProvidersFrom(databases) : []);
  }, [databases]);
}

/** Live status of the companion, or null when none is configured. */
export function useCompanionStatus() {
  const url = usePreferences((state) => state.companionUrl);
  const token = usePreferences((state) => state.companionToken);

  return useQuery({
    queryKey: ['companion', 'status', url, token],
    enabled: Boolean(url && token),
    retry: false,
    staleTime: 5_000,
    refetchInterval: 20_000,
    queryFn: async ({ signal }) => {
      const client = companionClient();
      if (!client) return null;
      return client.status(signal);
    },
  });
}
