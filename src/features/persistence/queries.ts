'use client';

/**
 * Reading the local database from React.
 *
 * Studies and games are asynchronous, cacheable, and read by several screens at
 * once — the same shape as any other query source, so they use the same query
 * cache rather than a second bespoke caching layer. Components never see a
 * repository, an IndexedDB object store or a transaction; they see data and an
 * `invalidate` call.
 */

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { getRepositories } from '@/persistence/repositories';
import type {
  AppRepositories,
  GameSearchQuery,
  GameSearchResult,
  StudyId,
  StudyRecord,
  StudyWithChapters,
} from '@/persistence/types';

export const persistenceKeys = {
  studies: ['persistence', 'studies'] as const,
  study: (id: StudyId) => ['persistence', 'study', id] as const,
  games: (query: GameSearchQuery) => ['persistence', 'games', query] as const,
  gameCount: ['persistence', 'game-count'] as const,
  game: (id: string) => ['persistence', 'game', id] as const,
};

/** Everything that can change when games are imported or removed. */
export function invalidateGames(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: ['persistence', 'games'] });
  void client.invalidateQueries({ queryKey: persistenceKeys.gameCount });
  // The explorer's local provider reads the same position index.
  void client.invalidateQueries({ queryKey: ['explorer'] });
}

export function invalidateStudies(client: QueryClient, id?: StudyId): void {
  void client.invalidateQueries({ queryKey: persistenceKeys.studies });
  if (id) void client.invalidateQueries({ queryKey: persistenceKeys.study(id) });
  else void client.invalidateQueries({ queryKey: ['persistence', 'study'] });
}

export function useStudies() {
  return useQuery<readonly StudyRecord[]>({
    queryKey: persistenceKeys.studies,
    queryFn: async () => (await getRepositories()).studies.list(),
    staleTime: 0,
    retry: false,
  });
}

export function useStudy(id: StudyId | null) {
  return useQuery<StudyWithChapters | null>({
    queryKey: persistenceKeys.study(id ?? 'none'),
    queryFn: async () => (id ? (await getRepositories()).studies.get(id) : null),
    enabled: id !== null,
    staleTime: 0,
    retry: false,
  });
}

export function useGames(query: GameSearchQuery) {
  return useQuery<GameSearchResult>({
    queryKey: persistenceKeys.games(query),
    queryFn: async () => (await getRepositories()).games.search(query),
    staleTime: 0,
    retry: false,
    placeholderData: (previous) => previous,
  });
}

export function useGameCount() {
  return useQuery<number>({
    queryKey: persistenceKeys.gameCount,
    queryFn: async () => (await getRepositories()).games.count(),
    staleTime: 0,
    retry: false,
  });
}

/**
 * Run a repository action and refresh what it touched.
 *
 * Deliberately not optimistic: these mutations delete studies and games, and a
 * row that vanishes before the transaction commits is a lie the user cannot
 * check. Correctness over the illusion of speed.
 */
export function useRepositoryMutation<TInput, TResult>(
  action: (repositories: AppRepositories, input: TInput) => Promise<TResult>,
  onSettledKeys: (client: QueryClient, input: TInput) => void,
) {
  const client = useQueryClient();
  return useMutation<TResult, Error, TInput>({
    mutationFn: async (input) => action(await getRepositories(), input),
    onSuccess: (_result, input) => onSettledKeys(client, input),
  });
}
