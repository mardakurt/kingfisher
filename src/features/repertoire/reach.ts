'use client';

/**
 * Counting how often a repertoire's positions are reached: in the player's
 * own games (their colour, by their profile aliases), and in one named
 * reference population. Read by the _Played against you_ panel and, through
 * the same cache, by the repertoire review, so the review is ordered by what
 * the panel shows.
 */
import { useQuery } from '@tanstack/react-query';

import { START_FEN } from '@/chess/fen';
import type { ChessDatabaseProvider } from '@/database/types';
import { runBounded } from '@/lib/bounded-parallelism';
import type { Fen } from '@/chess/types';
import type { RepertoirePositionRecord } from '@/persistence/domain';
import { getRepositories } from '@/persistence/repositories';
import type { RepertoireWithPositions } from '@/persistence/domain';
import type { PositionReach } from '@/repertoire/reach';

export interface RepertoireReach {
  readonly rows: readonly PositionReach[];
  /** How many of the player's games, on this side, the own counts were taken over. */
  readonly ownOf: number;
  /** True when the own counts are over every local game, because no alias is set. */
  readonly ownIsEveryGame: boolean;
  readonly source: { readonly id: string; readonly name: string } | null;
}

export const reachKey = (repertoireId: string, updatedAt: number, sourceId: string | null) =>
  ['repertoire-reach', repertoireId, updatedAt, sourceId ?? 'none'] as const;

async function countOwn(
  positions: readonly RepertoirePositionRecord[],
  colour: 'w' | 'b',
  aliases: readonly string[],
): Promise<{ readonly counts: Map<string, number>; readonly of: number }> {
  const games = (await getRepositories()).games;
  const filtersFor = aliases.length
    ? aliases.map((alias) => ({ player: alias, playerColor: colour }))
    : [{}];
  const at = async (fen: Fen) => {
    let total = 0;
    for (const filters of filtersFor) total += (await games.explore(fen, filters, 1)).totalGames;
    return total;
  };
  const of = await at(START_FEN);
  const counts = new Map<string, number>();
  const results = await runBounded({
    items: positions,
    concurrency: 4,
    worker: async (position) => [position.positionKey, await at(position.fen)] as const,
  });
  for (const entry of results) if (entry) counts.set(entry[0], entry[1]);
  return { counts, of };
}

async function countReference(
  positions: readonly RepertoirePositionRecord[],
  provider: ChessDatabaseProvider,
): Promise<{ readonly counts: Map<string, number>; readonly total: number }> {
  const total = (await provider.explore({ fen: START_FEN, limit: 1 })).totalGames;
  const counts = new Map<string, number>();
  const results = await runBounded({
    items: positions,
    concurrency: 4,
    worker: async (position) =>
      [
        position.positionKey,
        (await provider.explore({ fen: position.fen, limit: 1 })).totalGames,
      ] as const,
    onError: () => undefined,
  });
  for (const entry of results) if (entry) counts.set(entry[0], entry[1]);
  return { counts, total };
}

export function useRepertoireReach(
  repertoire: RepertoireWithPositions | null,
  provider: ChessDatabaseProvider | null,
  aliases: readonly string[],
) {
  return useQuery({
    queryKey: [
      ...reachKey(
        repertoire?.repertoire.id ?? 'none',
        repertoire?.repertoire.updatedAt ?? 0,
        provider?.id ?? null,
      ),
      aliases.join('\n'),
    ],
    enabled: repertoire !== null,
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<RepertoireReach> => {
      if (!repertoire) return { rows: [], ownOf: 0, ownIsEveryGame: true, source: null };
      const positions = repertoire.positions;
      const [own, reference] = await Promise.all([
        countOwn(positions, repertoire.repertoire.color, aliases),
        provider ? countReference(positions, provider) : Promise.resolve(null),
      ]);
      return {
        rows: positions.map((position) => ({
          position,
          own: own.counts.get(position.positionKey) ?? null,
          reference:
            reference && reference.counts.has(position.positionKey)
              ? {
                  source: provider?.name ?? '',
                  games: reference.counts.get(position.positionKey) ?? 0,
                  total: reference.total,
                }
              : null,
        })),
        ownOf: own.of,
        ownIsEveryGame: aliases.length === 0,
        source: provider ? { id: provider.id, name: provider.name } : null,
      };
    },
  });
}
