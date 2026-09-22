/** Read existing capabilities for the position page; no second chess state. */
import type { AppRepositories, GameRecord, StructureSearchQuery } from '@/persistence/types';
import {
  positionGameFacts,
  type PositionGameFacts,
  type PositionIdentity,
} from '@/position/knowledge';

export interface PositionGameRow {
  readonly game: GameRecord;
  readonly facts: PositionGameFacts;
}

/** A failure belongs to its own section, never to the whole page. */
export type KnowledgeAnswer<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string };

export async function readKnowledge<T>(read: () => Promise<T>): Promise<KnowledgeAnswer<T>> {
  try {
    return { ok: true, value: await read() };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'This source could not be read.',
    };
  }
}

export const positionStructureQuery = (
  identity: PositionIdentity,
  mode: StructureSearchQuery['mode'],
  limit = 100,
): StructureSearchQuery => ({
  mode,
  positionKey: identity.key,
  pawnSkeleton: identity.pawnSkeleton,
  structureSignature: '',
  claims: [],
  sort: 'recent',
  limit,
});

/** Indexed continuations; each game occurs once even when it repeats a position. */
export async function readPositionGames(
  repositories: AppRepositories,
  identity: PositionIdentity,
  aliases: readonly string[],
): Promise<readonly PositionGameRow[]> {
  const matches = await repositories.games.searchStructures(
    positionStructureQuery(identity, 'exact-position'),
  );
  const ids = [...new Set(matches.map((match) => match.game.id))];
  const rows: PositionGameRow[] = [];
  // Bound concurrent tree reads: large local databases must not flood IndexedDB.
  for (let index = 0; index < ids.length; index += 8) {
    const games = await Promise.all(
      ids.slice(index, index + 8).map((id) => repositories.games.get(id)),
    );
    for (const game of games) {
      if (!game) continue;
      const facts = positionGameFacts(game.tree, identity.key, aliases);
      if (facts) rows.push({ game, facts });
    }
  }
  return rows;
}

export async function readPositionEvidence(repositories: AppRepositories, key: string) {
  const [pinned, queued] = await Promise.all([
    readKnowledge(() => repositories.pinnedLines.forPosition(key)),
    readKnowledge(() => repositories.analysisQueue.evidenceForPosition(key)),
  ]);
  return { pinned, queued };
}
