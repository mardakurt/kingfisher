'use client';

import { useQuery } from '@tanstack/react-query';

import type { Fen } from '@/chess/types';
import { databaseProviderById } from '@/database/registry';
import type { ExplorerFilters, ExplorerResult } from '@/database/types';

/**
 * Explorer lookups are server/cache state, so they live in TanStack Query:
 * keyed by position and filters, cached across navigation, cancelled when the
 * user moves on. Putting them in a client store would mean reimplementing all
 * of that badly.
 */
export function useExplorer(sourceId: string, fen: Fen, filters: ExplorerFilters) {
  return useQuery<ExplorerResult>({
    queryKey: ['explorer', sourceId, fen, filters],
    queryFn: async ({ signal }) => {
      const provider = databaseProviderById(sourceId);
      if (!provider) throw new Error(`Unknown database: ${sourceId}`);
      return provider.explore({ fen, filters, limit: 15 }, signal);
    },
    /**
     * `navigator.onLine` is a poor oracle — captive portals, VPNs and embedded
     * browsers all report offline while requests succeed, and the default
     * `online` mode would leave the panel spinning instead of trying. Attempt
     * the request regardless and let a real failure produce a real message.
     */
    networkMode: 'offlineFirst',
    retry: (failureCount, error) =>
      failureCount < 1 && !String(error.message).includes('rate limiting'),
  });
}
