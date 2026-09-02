'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Position } from '@/chess/position';
import { isOk } from '@/chess/result';
import type { Fen } from '@/chess/types';
import { databaseProviderById } from '@/database/registry';
import { providerRetry, retryDelayMs } from '@/database/retry';
import type { ExplorerFilters, ExplorerResult } from '@/database/types';

/**
 * Explorer lookups are server/cache state, so they live in TanStack Query:
 * keyed by position and filters, cached across navigation, cancelled when the
 * user moves on. Putting them in a client store would mean reimplementing all
 * of that badly.
 */
export function useExplorer(sourceId: string, fen: Fen, filters: ExplorerFilters) {
  const sourceVersion = databaseProviderById(sourceId)?.cacheVersion ?? 'live';
  return useQuery<ExplorerResult>({
    queryKey: ['explorer', sourceId, sourceVersion, fen, filters],
    queryFn: async ({ signal }) => {
      const provider = databaseProviderById(sourceId);
      if (!provider) throw new Error(`Unknown database: ${sourceId}`);
      return provider.explore({ fen, filters, limit: 15 }, signal);
    },
    // `networkMode: 'always'` comes from the client defaults, and this query is
    // the reason it is set there. See `app/providers.tsx`.
    //
    // The retry policy is typed rather than matched on the message: a rejected
    // token, a rate limit and an unreadable response are all facts that a
    // second identical request cannot change.
    retry: providerRetry,
    retryDelay: (attempt, error) => retryDelayMs(error, attempt),
  });
}

/** How many of the most-played continuations are worth fetching in advance. */
const PREFETCH_MOVES = 2;

/**
 * Warm the positions the user is most likely to open next.
 *
 * Deliberately not every legal move: on a 100,000-game SQLite collection that
 * would turn one explorer view into thirty aggregations. Two continuations is
 * what the measurements justified — the top moves account for most clicks, and
 * two requests cost less than the round trip the user would otherwise wait
 * for. Prefetching writes into the same cache the panel reads, so a revisit is
 * answered without a request at all, and shares its keys, so an import or a
 * filter change invalidates the warmed entries along with the visible one.
 */
export function useExplorerPrefetch(
  sourceId: string,
  fen: Fen,
  filters: ExplorerFilters,
  moves: readonly { readonly uci: string }[] | undefined,
): void {
  const client = useQueryClient();
  const sourceVersion = databaseProviderById(sourceId)?.cacheVersion ?? 'live';
  const candidates = (moves ?? [])
    .slice(0, PREFETCH_MOVES)
    .map((move) => move.uci)
    .join(' ');

  useEffect(() => {
    if (!candidates) return;
    const provider = databaseProviderById(sourceId);
    if (!provider) return;
    const position = Position.fromFen(fen);
    if (!isOk(position)) return;

    for (const uci of candidates.split(' ')) {
      const played = position.value.playUci(uci);
      if (!isOk(played)) continue;
      const next = played.value.after;
      void client.prefetchQuery({
        queryKey: ['explorer', sourceId, sourceVersion, next, filters],
        queryFn: ({ signal }) => provider.explore({ fen: next, filters, limit: 15 }, signal),
        staleTime: 60_000,
        retry: false,
      });
    }
    // `filters` is a fresh object each render; the query client hashes the key
    // structurally, so the serialized form is what this effect depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, sourceId, sourceVersion, fen, candidates, JSON.stringify(filters)]);
}
