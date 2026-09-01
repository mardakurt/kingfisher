'use client';

/**
 * Where a position already appears in the user's own work.
 *
 * Answers "have I been here before?" from the canonical position key, which is
 * the whole reason that key exists: a study chapter, a repertoire entry and a
 * training item created by three different move orders are all about the same
 * position, and this is where that pays off.
 */

import { useQuery } from '@tanstack/react-query';

import { positionKey } from '@/chess/fen';
import type { Fen } from '@/chess/types';
import { getRepositories } from '@/persistence/repositories';
import type { PositionHistory } from './evidence';

export function usePositionContext(fen: Fen) {
  const key = positionKey(fen);
  return useQuery({
    queryKey: ['position-context', key],
    staleTime: 30_000,
    retry: false,
    queryFn: async (): Promise<PositionHistory & { routes: readonly (readonly string[])[] }> => {
      const repositories = await getRepositories();
      const [localGames, repertoires, training, modelGames, routes, profile] = await Promise.all([
        repositories.games.countAtPosition(key),
        repositories.repertoires.findByPosition(key),
        repositories.training.countByPosition(key),
        repositories.modelGames.forPosition(key),
        repositories.games.routesToPosition(key, 4),
        repositories.profile.get(),
      ]);

      /*
        "My games" needs the explicit aliases; without them the honest answer is
        zero rather than a guess about which player is the user.
      */
      let personalGames = 0;
      if (profile.aliases.length > 0) {
        const evidence = await repositories.games.explore(fen, { player: profile.aliases[0] }, 1);
        personalGames = evidence.totalGames;
      }

      return {
        localGames,
        personalGames,
        studies: 0,
        repertoires: repertoires.length,
        trainingItems: training,
        modelGames: modelGames.length,
        routes: routes.map((route) => route.moves as readonly string[]),
      };
    },
  });
}
