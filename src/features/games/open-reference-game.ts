'use client';

/**
 * Opening a game that lives in a reference pack.
 *
 * The game arrives as PGN and goes through the same parser as an import,
 * rather than through a second path that builds a tree from the pack's own
 * fields. One parser means a reference game and an imported game are the same
 * kind of object by the time anything else sees them — and it means the move
 * list in a pack is validated by the rules code, not trusted.
 */

import { nodeAtPosition } from '@/chess/tree/find';
import { parsePgn } from '@/chess/pgn';
import { referenceGamePgn } from '@/reference/player-games';
import { useAnalysis, type OpenDocumentInput } from '@/stores/analysis-store';

export class ReferenceGameUnavailableError extends Error {
  constructor() {
    super('That game is not in an installed reference source.');
    this.name = 'ReferenceGameUnavailableError';
  }
}

export async function openReferenceGame(
  sourceId: string,
  sourceName: string,
  gameId: string,
  title: string,
  /** Where the game goes: the board by default, or a new tab. */
  open: (input: OpenDocumentInput) => unknown = (input) =>
    useAnalysis.getState().openDocument(input),
  /** Open at the first main-line position with this canonical key (Phase 86). */
  at?: string,
): Promise<void> {
  const pgn = await referenceGamePgn(sourceId, gameId);
  if (!pgn) throw new ReferenceGameUnavailableError();
  const parsed = parsePgn(pgn).games[0];
  if (!parsed) throw new ReferenceGameUnavailableError();

  const currentId = at ? nodeAtPosition(parsed.tree, at) : null;
  await open({
    tree: parsed.tree,
    document: { kind: 'reference-game', title, sourceId, sourceName, gameId },
    ...(currentId ? { currentId } : {}),
  });
}
