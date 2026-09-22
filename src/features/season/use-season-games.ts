'use client';

/**
 * The season reader needs `GameRecord[]` with full move trees. The default
 * `useGames` hook returns summaries only — move trees are stored separately
 * to keep the list view cheap — so this hook fetches the full records once
 * per query and joins them.
 *
 * The fetch walks every metadata page and then uses one `getMany` over the
 * resulting ids. A bare `search({})` returns only its default 100 rows; that
 * would make a large season silently partial. Players with thousands of games
 * still load the whole set once on this page. Future work is to push the named
 * predicate into the repository without losing the exact denominator.
 */

import { useQuery } from '@tanstack/react-query';

import { getRepositories } from '@/persistence/repositories';
import type { GameRecord, GameRepository } from '@/persistence/types';

export async function loadAllSeasonGames(
  games: Pick<GameRepository, 'search' | 'getMany'>,
): Promise<readonly GameRecord[]> {
  const ids: string[] = [];
  const limit = 1_000;
  for (let offset = 0; ; offset += limit) {
    const page = await games.search({ limit, offset });
    ids.push(...page.games.map((summary) => summary.id));
    if (!page.hasMore) break;
  }
  if (ids.length === 0) return [];
  return games.getMany(ids);
}

export function useSeasonGames() {
  return useQuery<readonly GameRecord[]>({
    queryKey: ['persistence', 'season-games'],
    queryFn: async () => {
      const repos = await getRepositories();
      return loadAllSeasonGames(repos.games);
    },
    staleTime: 30_000,
    retry: false,
  });
}
