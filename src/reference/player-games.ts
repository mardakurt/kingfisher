'use client';

/**
 * Games a reference source holds for one player.
 *
 * Separate from the catalog because the catalog is a list of names and this is
 * a list of games: loading a player's games while typing in a search box would
 * read a chunk per keystroke.
 */

import { useQuery } from '@tanstack/react-query';

import { readyPackReaders } from './manager';
import type { PackGame } from './pack';
import { useReferenceSources } from './use-references';

export interface ReferenceGame extends PackGame {
  /** Which installed source this game came from. */
  readonly sourceId: string;
  readonly sourceName: string;
}

async function gamesFor(key: string): Promise<readonly ReferenceGame[]> {
  const found: ReferenceGame[] = [];
  const seen = new Set<string>();
  for (const reader of readyPackReaders()) {
    const ids = await reader.playerGames(key);
    if (ids.length === 0) continue;
    for (const game of await reader.games(ids)) {
      // A game held by two packs is one game; the first source listed wins,
      // which is the source order the user put them in.
      if (seen.has(game.id)) continue;
      seen.add(game.id);
      found.push({
        ...game,
        sourceId: reader.manifest.id,
        sourceName: reader.manifest.name,
      });
    }
  }
  return found.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
}

export function useReferencePlayerGames(key: string | null) {
  const references = useReferenceSources();
  const installed = references.sources
    .filter((source) => source.installed)
    .map((source) => source.id)
    .join(',');

  return useQuery({
    queryKey: ['reference-player-games', installed, key],
    enabled: key !== null && key.length > 0,
    queryFn: () => gamesFor(key as string),
    staleTime: 5 * 60_000,
  });
}

/** One game's PGN, from whichever installed source holds it. */
export async function referenceGamePgn(sourceId: string, gameId: string): Promise<string | null> {
  const { packGamePgn } = await import('./provider');
  for (const reader of readyPackReaders()) {
    if (reader.manifest.id !== sourceId) continue;
    const game = await reader.game(gameId);
    return game ? packGamePgn(game, reader.manifest) : null;
  }
  return null;
}
