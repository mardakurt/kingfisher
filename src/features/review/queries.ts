'use client';

/**
 * Cached reads for the review workspace.
 *
 * Everything here is keyed so that one write invalidates exactly the questions
 * it changed: tagging a position changes the queue and the summary, and must
 * not refetch the game list. `invalidateReview` in the shared persistence
 * queries is the single writer-side entry point, so no component has to know
 * this key layout.
 */

import { useQuery } from '@tanstack/react-query';

import { getRepositories } from '@/persistence/repositories';
import type { DecisionRecord, ReviewItemRecord, ReviewStatus } from '@/persistence/domain';

export const reviewKeys = {
  items: (status?: ReviewStatus) => ['review', 'items', status ?? 'all'] as const,
  decisions: ['review', 'decisions'] as const,
  decisionAt: (positionKey: string) => ['review', 'decision-at', positionKey] as const,
  customThemes: ['review', 'custom-themes'] as const,
  sets: ['review', 'training-sets'] as const,
  setItems: (id: string) => ['review', 'training-set-items', id] as const,
};

export function useReviewItems(status?: ReviewStatus) {
  return useQuery<readonly ReviewItemRecord[]>({
    queryKey: reviewKeys.items(status),
    queryFn: async () => (await getRepositories()).review.listReviewItems(status),
    staleTime: 0,
    retry: false,
  });
}

export function useDecisions() {
  return useQuery<readonly DecisionRecord[]>({
    queryKey: reviewKeys.decisions,
    queryFn: async () => (await getRepositories()).review.listDecisions(500),
    staleTime: 0,
    retry: false,
  });
}

/**
 * The decision recorded for this exact position, if there is one.
 *
 * Most recent first, and only the first is returned: a position reviewed twice
 * has two records, and the one the journal shows is the latest — the earlier
 * one is history, not a thing to edit.
 */
export function useDecisionAt(positionKey: string | null) {
  return useQuery<DecisionRecord | null>({
    queryKey: reviewKeys.decisionAt(positionKey ?? 'none'),
    queryFn: async () => {
      if (!positionKey) return null;
      const found = await (await getRepositories()).review.decisionsForPosition(positionKey);
      return found[0] ?? null;
    },
    enabled: positionKey !== null,
    staleTime: 0,
    retry: false,
  });
}

export function useCustomThemes() {
  return useQuery<readonly string[]>({
    queryKey: reviewKeys.customThemes,
    queryFn: async () => (await (await getRepositories()).profile.get()).customThemes ?? [],
    staleTime: 60_000,
    retry: false,
  });
}

export function useTrainingSets() {
  return useQuery({
    queryKey: reviewKeys.sets,
    queryFn: async () => (await getRepositories()).trainingSets.list(),
    staleTime: 0,
    retry: false,
  });
}

export function useTrainingSetItems(id: string | null) {
  return useQuery({
    queryKey: reviewKeys.setItems(id ?? 'none'),
    queryFn: async () => (id ? (await getRepositories()).trainingSets.resolve(id) : []),
    enabled: id !== null,
    staleTime: 0,
    retry: false,
  });
}
