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

import { indexGame } from '@/persistence/prepare-game';
import { getRepositories } from '@/persistence/repositories';
import type {
  DecisionRecord,
  ReviewItemRecord,
  ReviewStatus,
  StoredEngineEvidenceRecord,
} from '@/persistence/domain';
import type { AppRepositories, GameSummary } from '@/persistence/types';
import type { RecurringInput } from '@/recurring/recurring';
import { nameKey } from '@/round/identity';

export const reviewKeys = {
  items: (status?: ReviewStatus) => ['review', 'items', status ?? 'all'] as const,
  decisions: ['review', 'decisions'] as const,
  decisionAt: (positionKey: string) => ['review', 'decision-at', positionKey] as const,
  customThemes: ['review', 'custom-themes'] as const,
  sets: ['review', 'training-sets'] as const,
  setItems: (id: string) => ['review', 'training-set-items', id] as const,
  recurring: (aliases: readonly string[], from: number, to: number) =>
    ['review', 'recurring', [...aliases].sort().join('|'), from, to] as const,
};

export interface RecurringFactsQuery {
  readonly aliases: readonly string[];
  readonly from: number;
  readonly to: number;
}

export async function loadRecurringFacts(
  repositories: AppRepositories,
  query: RecurringFactsQuery,
): Promise<Omit<RecurringInput, 'engineLossCp'>> {
  const summariesPromise = loadAllGameSummaries(repositories);
  const endgamesPromise = repositories.endgames.list();
  const repertoiresPromise = repositories.repertoires.list();
  const [summaries, endgames, repertoires] = await Promise.all([
    summariesPromise,
    endgamesPromise,
    repertoiresPromise,
  ]);

  const aliasKeys = new Set(query.aliases.map(nameKey).filter(Boolean));
  const ids = summaries
    .filter((summary) => {
      const at = playedAt(summary);
      return (
        at >= query.from &&
        at < query.to &&
        summary.playerKeys.some((player) => aliasKeys.has(player))
      );
    })
    .map((summary) => summary.id);

  const [games, repertoireDetails] = await Promise.all([
    ids.length === 0 ? [] : repositories.games.getMany(ids),
    Promise.all(repertoires.map((record) => repositories.repertoires.get(record.id))),
  ]);

  const evidence: StoredEngineEvidenceRecord[] = [];
  const batchSize = 50;
  for (let offset = 0; offset < games.length; offset += batchSize) {
    const batch = games.slice(offset, offset + batchSize);
    const rows = await Promise.all(
      batch.map((game) => repositories.analysisQueue.evidenceForGame(game.id)),
    );
    evidence.push(...rows.flat());
  }

  return {
    games,
    aliases: query.aliases,
    evidence,
    positions: games.flatMap(indexGame),
    endgames,
    repertoires,
    repertoirePositions: repertoireDetails.flatMap((detail) => detail?.positions ?? []),
  };
}

async function loadAllGameSummaries(
  repositories: Pick<AppRepositories, 'games'>,
): Promise<readonly GameSummary[]> {
  const summaries: GameSummary[] = [];
  const limit = 1_000;
  for (let offset = 0; ; offset += limit) {
    const page = await repositories.games.search({ limit, offset });
    summaries.push(...page.games);
    if (!page.hasMore) return summaries;
  }
}

function playedAt(game: GameSummary): number {
  if (game.date) {
    const parsed = Date.parse(game.date.replace(/\?/g, '0'));
    if (!Number.isNaN(parsed)) return parsed;
  }
  return game.importedAt;
}

export function useRecurringFacts(query: RecurringFactsQuery) {
  return useQuery<Omit<RecurringInput, 'engineLossCp'>>({
    queryKey: reviewKeys.recurring(query.aliases, query.from, query.to),
    queryFn: async () => loadRecurringFacts(await getRepositories(), query),
    enabled: query.aliases.length > 0,
    staleTime: 30_000,
    retry: false,
  });
}

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
