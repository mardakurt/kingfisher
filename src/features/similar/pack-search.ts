/**
 * What a reference pack can say about "games like this one", and what it
 * cannot.
 *
 * A pack stores per-position aggregates and a bounded list of game ids per
 * position. That is enough to answer **this exact position** — which is the
 * strongest form of "similar": the same position, in the population the pack
 * names. It is not enough to answer "the same pawn skeleton" or "the same
 * structural features", because those were never indexed: the build reduced
 * every game to positions and threw the structures away.
 *
 * So this module answers the one question packs can answer and reports the
 * others as unanswerable *by name*, rather than returning an empty list that
 * reads as "no such games exist". Populations are never merged: each pack
 * keeps its own rows and its own count.
 */

import type { PackGame } from '@/reference/pack';
import type { PackReader } from '@/reference/reader';
import type { StructureSearchMode } from '@/persistence/types';

export interface PackMatch {
  readonly packId: string;
  readonly packName: string;
  readonly game: PackGame;
}

export interface PackAnswer {
  readonly packId: string;
  readonly packName: string;
  readonly matches: readonly PackMatch[];
  /**
   * Why this pack has nothing to say, when it has nothing to say. Absent
   * when the pack answered, even if it answered with no games.
   */
  readonly unanswerable?: string;
  /** Games the pack holds full scores for, when it says so. */
  readonly openable?: number;
}

/** Only the exact position is indexed in a pack; the rest was never stored. */
export const packCanAnswer = (mode: StructureSearchMode): boolean => mode === 'exact-position';

export function packLimitation(mode: StructureSearchMode, name: string): string {
  const what =
    mode === 'pawn-skeleton'
      ? 'the same pawn skeleton'
      : mode === 'signature'
        ? 'the same structural features'
        : 'the facts you chose';
  return `${name} stores positions and their counts, not structures, so it cannot be asked for ${what}. It can answer “the same position”.`;
}

/**
 * Ask every ready pack for the games that reached this position.
 *
 * Bounded by the pack itself: `position()` returns a capped list of game ids,
 * which is what keeps this one chunk read rather than a scan. A pack that has
 * never seen the position answers with no games, and that is an answer.
 */
export async function searchPacks(
  readers: readonly PackReader[],
  mode: StructureSearchMode,
  positionKey: string,
  limitPerPack = 20,
): Promise<readonly PackAnswer[]> {
  return Promise.all(
    readers.map(async (reader): Promise<PackAnswer> => {
      const name = reader.manifest.name;
      if (!packCanAnswer(mode)) {
        return {
          packId: reader.manifest.id,
          packName: name,
          matches: [],
          unanswerable: packLimitation(mode, name),
          openable: reader.manifest.counts.openable,
        };
      }
      const entry = await reader.position(positionKey);
      const ids = (entry?.games ?? []).slice(0, limitPerPack);
      const games = ids.length ? await reader.games(ids) : [];
      return {
        packId: reader.manifest.id,
        packName: name,
        matches: games.map((game) => ({
          packId: reader.manifest.id,
          packName: name,
          game,
        })),
        openable: reader.manifest.counts.openable,
      };
    }),
  );
}
