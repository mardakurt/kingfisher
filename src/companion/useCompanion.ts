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

import { companionClient, setCompanion } from './session';

export function useCompanionSync(): void {
  const url = usePreferences((state) => state.companionUrl);
  const token = usePreferences((state) => state.companionToken);

  useEffect(() => {
    setCompanion(url && token ? { url, token } : null);
  }, [token, url]);
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
