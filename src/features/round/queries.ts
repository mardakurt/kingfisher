'use client';

import { useQuery, type QueryClient } from '@tanstack/react-query';

import { getRepositories } from '@/persistence/repositories';

export const journalKeys = {
  all: ['journal'] as const,
  forGame: (fingerprint: string) => ['journal', 'game', fingerprint] as const,
};

export function useJournal() {
  return useQuery({
    queryKey: journalKeys.all,
    queryFn: async () => (await getRepositories()).journal.list(),
    staleTime: 0,
  });
}

export function useJournalEntry(fingerprint: string | null) {
  return useQuery({
    queryKey: journalKeys.forGame(fingerprint ?? 'none'),
    queryFn: async () =>
      fingerprint ? (await getRepositories()).journal.forGame(fingerprint) : null,
    staleTime: 0,
  });
}

export function invalidateJournal(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: journalKeys.all });
}
