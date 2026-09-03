/**
 * Query hooks for the Phase 9 preparation entities.
 *
 * Kept beside the workspace rather than in the shared persistence hooks
 * because these keys are only ever read here and in the opening-file
 * workspace; the shared module is already long enough to be hard to scan.
 */

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { getRepositories } from '@/persistence/repositories';
import type {
  EndgamePositionRecord,
  OpeningFileRecord,
  PreparationSessionRecord,
} from '@/persistence/domain';
import type { EndgameQuery } from '@/persistence/repositories/endgame-repository';

export const preparationKeys = {
  sessions: ['persistence', 'preparation-sessions'] as const,
  session: (id: string) => ['persistence', 'preparation-session', id] as const,
  openingFiles: ['persistence', 'opening-files'] as const,
  openingFile: (id: string) => ['persistence', 'opening-file', id] as const,
  filesForPosition: (key: string) => ['persistence', 'opening-files', 'position', key] as const,
  endgames: (query: EndgameQuery) => ['persistence', 'endgames', query] as const,
  pinnedLines: (key: string) => ['persistence', 'pinned-lines', key] as const,
};

export function invalidatePreparation(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: ['persistence', 'preparation-sessions'] });
  void client.invalidateQueries({ queryKey: ['persistence', 'preparation-session'] });
}

export function invalidateOpeningFiles(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: ['persistence', 'opening-files'] });
  void client.invalidateQueries({ queryKey: ['persistence', 'opening-file'] });
}

export function usePreparationSessions() {
  return useQuery<readonly PreparationSessionRecord[]>({
    queryKey: preparationKeys.sessions,
    queryFn: async () => (await getRepositories()).preparation.list(),
    staleTime: 0,
    retry: false,
  });
}

export function usePreparationSession(id: string | null) {
  return useQuery<PreparationSessionRecord | null>({
    queryKey: preparationKeys.session(id ?? ''),
    enabled: Boolean(id),
    queryFn: async () => (await getRepositories()).preparation.get(id!),
    staleTime: 0,
    retry: false,
  });
}

export function useOpeningFiles() {
  return useQuery<readonly OpeningFileRecord[]>({
    queryKey: preparationKeys.openingFiles,
    queryFn: async () => (await getRepositories()).openingFiles.list(),
    staleTime: 0,
    retry: false,
  });
}

export function useOpeningFile(id: string | null) {
  return useQuery<OpeningFileRecord | null>({
    queryKey: preparationKeys.openingFile(id ?? ''),
    enabled: Boolean(id),
    queryFn: async () => (await getRepositories()).openingFiles.get(id!),
    staleTime: 0,
    retry: false,
  });
}

export function useOpeningFilesForPosition(positionKey: string) {
  return useQuery<readonly OpeningFileRecord[]>({
    queryKey: preparationKeys.filesForPosition(positionKey),
    enabled: Boolean(positionKey),
    queryFn: async () => (await getRepositories()).openingFiles.forPosition(positionKey),
    staleTime: 0,
    retry: false,
  });
}

export function useEndgamePositions(query: EndgameQuery = {}) {
  return useQuery<readonly EndgamePositionRecord[]>({
    queryKey: preparationKeys.endgames(query),
    queryFn: async () => (await getRepositories()).endgames.list(query),
    staleTime: 0,
    retry: false,
  });
}

export function usePinnedLines(positionKey: string) {
  return useQuery({
    queryKey: preparationKeys.pinnedLines(positionKey),
    enabled: Boolean(positionKey),
    queryFn: async () => (await getRepositories()).pinnedLines.forPosition(positionKey),
    staleTime: 0,
    retry: false,
  });
}

/**
 * A mutation that reruns with the stored revision after a stale write.
 *
 * Every Phase 9 record carries a revision, and a workspace with several
 * panels editing one session will legitimately race itself — adding a card
 * while a note is being saved. Refetching and retrying once is the right
 * response to *that*; a genuine cross-tab conflict fails the second attempt
 * too and surfaces normally.
 */
export function useSessionMutation<TArgs extends unknown[]>(
  run: (
    repositories: Awaited<ReturnType<typeof getRepositories>>,
    session: PreparationSessionRecord,
    ...args: TArgs
  ) => Promise<unknown>,
  sessionId: string | null,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (args: TArgs) => {
      if (!sessionId) return;
      const repositories = await getRepositories();
      const attempt = async () => {
        const session = await repositories.preparation.get(sessionId);
        if (!session) throw new Error('That preparation session no longer exists.');
        await run(repositories, session, ...args);
      };
      try {
        await attempt();
      } catch (error) {
        if (!(error instanceof Error) || !error.name.startsWith('Stale')) throw error;
        await attempt();
      }
    },
    onSettled: () => invalidatePreparation(client),
  });
}
