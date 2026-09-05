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
import { searchWorkspace, type WorkspaceSearchHit } from '@/persistence/search';
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

/**
 * "Have I been here before?", which is assembled from five different stores.
 *
 * `usePositionContext` counts local games, personal games, repertoire entries,
 * training items and model games at one position, and caches the answer under
 * the position key alone. That key cannot express any of the five, so every
 * mutation that changes one of them has to say so here.
 *
 * It is called from all five invalidators below rather than from one, because
 * there is no single moment when "the workspace changed" — there are five, and
 * a panel that says "My games: 0" after an import is a stale chess statement
 * whichever of them was missed.
 */
export function invalidatePositionContext(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: ['position-context'] });
}

/** Everything that can change when games are imported or removed. */
export function invalidateGames(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: ['persistence', 'games'] });
  void client.invalidateQueries({ queryKey: persistenceKeys.gameCount });
  // The explorer's local provider reads the same position index.
  void client.invalidateQueries({ queryKey: ['explorer'] });
  /*
    Stored move orders are derived from games and chapters, and the panel keeps
    its answer for a minute. Without this, importing games left the
    transpositions list quietly out of date — a stale chess statement, which is
    the one thing this application is not allowed to make.
  */
  void client.invalidateQueries({ queryKey: ['transpositions'] });
  // Local and personal game counts, and the routes into this position.
  invalidatePositionContext(client);
}

export function invalidateStudies(client: QueryClient, id?: StudyId): void {
  void client.invalidateQueries({ queryKey: persistenceKeys.studies });
  // Chapters are one of the two sources of stored move orders. See above.
  void client.invalidateQueries({ queryKey: ['transpositions'] });
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

// --- Phase 3 -----------------------------------------------------------------

export const phase3Keys = {
  repertoires: ['persistence', 'repertoires'] as const,
  repertoire: (id: string) => ['persistence', 'repertoire', id] as const,
  repertoiresAt: (positionKey: string) => ['persistence', 'rep-at', positionKey] as const,
  training: ['persistence', 'training'] as const,
  trainingDue: ['persistence', 'training-due'] as const,
  modelGames: (scope: string, id: string) => ['persistence', 'model-games', scope, id] as const,
  profile: ['persistence', 'profile'] as const,
  references: (chapterId: string) => ['persistence', 'references', chapterId] as const,
};

export function invalidateRepertoires(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: ['persistence', 'repertoires'] });
  void client.invalidateQueries({ queryKey: ['persistence', 'repertoire'] });
  void client.invalidateQueries({ queryKey: ['persistence', 'rep-at'] });
  invalidatePositionContext(client);
}

export function invalidateTraining(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: ['persistence', 'training'] });
  void client.invalidateQueries({ queryKey: ['persistence', 'training-due'] });
  // Dynamic set membership is derived from training fields and static set
  // counts change when items are removed.
  void client.invalidateQueries({ queryKey: ['review', 'training-set'] });
  invalidatePositionContext(client);
}

export function invalidateModelGames(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: ['persistence', 'model-games'] });
  invalidatePositionContext(client);
}

/**
 * Everything the review workspace can change.
 *
 * One entry point rather than a key layout every component has to remember:
 * tagging a position changes the queue, the decision behind it and the
 * summaries built from both, and a caller should not have to enumerate that.
 */
export function invalidateReview(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: ['review'] });
}

export function invalidateReferences(client: QueryClient, chapterId?: string): void {
  void client.invalidateQueries({
    queryKey: chapterId ? phase3Keys.references(chapterId) : ['persistence', 'references'],
  });
}

export function useStudyReferences(chapterId: string | null) {
  return useQuery({
    queryKey: phase3Keys.references(chapterId ?? 'none'),
    queryFn: async () => {
      if (!chapterId) return [];
      const repositories = await getRepositories();
      const references = await repositories.references.forChapter(chapterId);
      return Promise.all(references.map((reference) => repositories.references.resolve(reference)));
    },
    enabled: chapterId !== null,
    staleTime: 0,
    retry: false,
  });
}

export function useRepertoires() {
  return useQuery({
    queryKey: phase3Keys.repertoires,
    queryFn: async () => (await getRepositories()).repertoires.list(),
    staleTime: 0,
    retry: false,
  });
}

export function useRepertoire(id: string | null) {
  return useQuery({
    queryKey: phase3Keys.repertoire(id ?? 'none'),
    queryFn: async () => (id ? (await getRepositories()).repertoires.get(id) : null),
    enabled: id !== null,
    staleTime: 0,
    retry: false,
  });
}

/** Everything any repertoire says about one position. */
export function useRepertoiresAtPosition(positionKey: string) {
  return useQuery({
    queryKey: phase3Keys.repertoiresAt(positionKey),
    queryFn: async () => (await getRepositories()).repertoires.findByPosition(positionKey),
    staleTime: 0,
    retry: false,
  });
}

export function useTrainingItems() {
  return useQuery({
    queryKey: phase3Keys.training,
    queryFn: async () => (await getRepositories()).training.list(),
    staleTime: 0,
    retry: false,
  });
}

export function useModelGamesForPosition(positionKey: string) {
  return useQuery({
    queryKey: phase3Keys.modelGames('position', positionKey),
    queryFn: async () => (await getRepositories()).modelGames.forPosition(positionKey),
    staleTime: 0,
    retry: false,
  });
}

/** Metadata for a set of games, without reading a single move tree. */
export function useGameSummaries(ids: readonly string[]) {
  const key = [...ids].sort().join(',');
  return useQuery({
    queryKey: ['persistence', 'game-summaries', key],
    queryFn: async () => (await getRepositories()).games.summaries(ids),
    enabled: ids.length > 0,
    staleTime: 30_000,
    retry: false,
  });
}

export function useProfile() {
  return useQuery({
    queryKey: phase3Keys.profile,
    queryFn: async () => (await getRepositories()).profile.get(),
    staleTime: 0,
    retry: false,
  });
}

export function useWorkspaceSearch(query: string) {
  const normalized = query.trim();
  return useQuery<readonly WorkspaceSearchHit[]>({
    queryKey: ['persistence', 'workspace-search', normalized],
    queryFn: async () => searchWorkspace(await getRepositories(), normalized),
    enabled: normalized.length >= 2,
    staleTime: 5_000,
    retry: false,
  });
}
