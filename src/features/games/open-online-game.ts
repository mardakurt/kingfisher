'use client';

/**
 * Opening a master game that lives in an online source, on Kingfisher's board.
 *
 * The explorer's model-game list could open a game two ways, and for an online
 * source it did neither: a pack game was opened in Kingfisher, and everything
 * else was a link to a website. So the one historical game this project keeps
 * naming — Fischer–Spassky, Reykjavik 1972, which no pack Kingfisher may
 * redistribute contains — was reachable only by leaving the application.
 *
 * It need not be. The Lichess masters database serves a game's PGN by id, and
 * as of a live check on 2026-09-06 that endpoint needs no token even though
 * the explorer *query* beside it does. So a master game can come back through
 * the same parser an import uses, onto the same board, with the engine and the
 * repertoire and everything else already there.
 *
 * Two things this deliberately does not do. It does not save the game
 * anywhere — an online master game is somebody else's data and staying a
 * *view* of it is the honest default, with saving a separate, explicit act.
 * And it does not invent a source name: the document carries the provider that
 * served it, so the header says where the game came from, which for licensed
 * data is not decoration.
 */

import { parsePgn } from '@/chess/pgn';
import { DatabaseError, type ChessDatabaseProvider } from '@/database/types';
import { useAnalysis } from '@/stores/analysis-store';

export class OnlineGameUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OnlineGameUnavailableError';
  }
}

/** Whether this source can serve a whole game rather than only aggregates. */
export const canOpenGames = (provider: ChessDatabaseProvider | null | undefined): boolean =>
  typeof provider?.game === 'function';

export async function openOnlineGame(
  provider: ChessDatabaseProvider,
  gameId: string,
  title: string,
  signal?: AbortSignal,
): Promise<void> {
  if (typeof provider.game !== 'function') {
    throw new OnlineGameUnavailableError(`${provider.name} does not serve whole games.`);
  }

  let pgn: string;
  try {
    pgn = await provider.game(gameId, signal);
  } catch (error) {
    // A provider's own error already says what went wrong and what to do; it
    // is passed through rather than replaced with a worse sentence.
    if (error instanceof DatabaseError) throw error;
    throw new OnlineGameUnavailableError(
      error instanceof Error ? error.message : `${provider.name} could not serve that game.`,
    );
  }

  /*
    Through the same parser as an import, so a master game and a game you
    imported are the same kind of object by the time anything else sees them —
    and so the movetext is validated by Kingfisher's rules code rather than
    trusted because it came from a reputable service.
  */
  const parsed = parsePgn(pgn).games[0];
  if (!parsed) {
    throw new OnlineGameUnavailableError(
      `${provider.name} returned something that is not a game Kingfisher can read.`,
    );
  }

  useAnalysis.getState().openDocument({
    tree: parsed.tree,
    document: {
      kind: 'reference-game',
      title,
      sourceId: provider.id,
      sourceName: provider.name,
      gameId,
    },
  });
}
