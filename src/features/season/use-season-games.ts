'use client';

/**
 * The season reader needs `GameRecord[]` with full move trees. The default
 * `useGames` hook returns summaries only — move trees are stored separately
 * to keep the list view cheap — so this hook fetches the full records once
 * per query and joins them.
 *
 * The fetch is the union of a metadata query and a `getMany` over the
 * resulting ids. Players with thousands of games will load the whole set
 * once on this page; the season reader is one of the few places that needs
 * it (the After the round panel reads one game at a time, the position
 * page reads one position at a time). Future work is to chunk by the
 * picked named set on the server, but the search index already filters
 * the relevant games on the way out.
 */

import { useQuery } from '@tanstack/react-query';

import { getRepositories } from '@/persistence/repositories';
import type { GameRecord } from '@/persistence/types';

export function useSeasonGames() {
  return useQuery<readonly GameRecord[]>({
    queryKey: ['persistence', 'season-games'],
    queryFn: async () => {
      const repos = await getRepositories();
      const page = await repos.games.search({});
      const ids = page.games.map((summary) => summary.id);
      if (ids.length === 0) return [];
      return repos.games.getMany(ids);
    },
    staleTime: 30_000,
    retry: false,
  });
}
