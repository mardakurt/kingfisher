'use client';

/**
 * Importing a PGN does two things at once.
 *
 * The first game is opened for analysis, and *every* game in the file is added
 * to the local position index. That is what turns "My games" in the explorer
 * into a real database: after importing a tournament or a downloaded archive,
 * the same panel that shows what masters play can show what you played.
 */

import { parsePgn } from '@/chess/pgn';
import { fail, ok, type Result } from '@/chess/result';
import { gameMetaFromHeaders } from '@/database/local-index';
import { localPositionIndex } from '@/database/registry';
import { useAnalysis } from '@/stores/analysis-store';

export interface ImportSummary {
  readonly games: number;
  readonly indexed: number;
  readonly issues: number;
}

let importCounter = 0;

export function importPgn(text: string): Result<ImportSummary> {
  const parsed = parsePgn(text);
  const first = parsed.games[0];
  if (!first) return fail('invalid-pgn', 'No games were found in that PGN.');

  let indexed = 0;
  for (const game of parsed.games) {
    const id = `import-${++importCounter}`;
    localPositionIndex.addGame(game.tree, gameMetaFromHeaders(id, game.tree.headers), {
      maxPlies: 60,
    });
    indexed += 1;
  }

  useAnalysis.getState().loadGame(first.tree);

  return ok({
    games: parsed.games.length,
    indexed,
    issues: parsed.games.reduce((total, game) => total + game.issues.length, 0),
  });
}
