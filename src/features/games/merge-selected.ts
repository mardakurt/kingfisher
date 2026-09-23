'use client';

/**
 * "Merge into one tree", from a selection of stored games.
 *
 * Loads each game, lays them over each other with `mergeGames` in the order
 * the Library lists them — so the first row is the main line, as in the
 * ChessBase list this replaces — and puts the result on the board as an
 * untitled analysis. It is the player's new document, not a stored game:
 * autosave keeps it as a draft and "Save to study" makes it permanent, the
 * way any analysis becomes theirs. Nothing stored is changed.
 */

import { mergeGames, type MergeResult } from '@/chess/tree/merge';
import { gameTitle } from '@/persistence/describe';
import { getRepositories } from '@/persistence/repositories';
import type { GameId } from '@/persistence/types';
import { useAnalysis } from '@/stores/analysis-store';

/** A game's name in the merged tree: who, where, and how it ended. */
export function mergeLabel(game: Parameters<typeof gameTitle>[0]): string {
  const result = game.result && game.result !== '*' ? ` · ${game.result}` : '';
  return `${gameTitle(game)}${result}`;
}

/** What the notice after a merge says, in one sentence each. */
export function describeMerge(result: MergeResult, missing: number): string {
  const parts = [
    `${result.merged.length} ${result.merged.length === 1 ? 'game' : 'games'} merged into one tree; the first is the main line.`,
  ];
  if (result.contained.length) {
    parts.push(
      `${result.contained.length} added no new move — ${result.contained.length === 1 ? 'its line was' : 'their lines were'} already in the tree.`,
    );
  }
  if (result.skipped.length) {
    parts.push(
      `${result.skipped.length} started from another position and ${result.skipped.length === 1 ? 'was' : 'were'} left out.`,
    );
  }
  if (missing) parts.push(`${missing} could not be read from the database.`);
  if (result.transpositions) {
    parts.push(
      `${result.transpositions} ${result.transpositions === 1 ? 'position is' : 'positions are'} reached by more than one move order; the position page joins them.`,
    );
  }
  return parts.join(' ');
}

export async function mergeSelectedGames(
  ids: readonly GameId[],
): Promise<{ readonly result: MergeResult; readonly message: string }> {
  const repositories = await getRepositories();
  const loaded = await Promise.all(ids.map((id) => repositories.games.get(id)));
  const games = loaded.filter((game): game is NonNullable<typeof game> => Boolean(game));
  const result = mergeGames(games.map((game) => ({ tree: game.tree, label: mergeLabel(game) })));
  const title = result.tree.headers.Event ?? 'Merged games';
  useAnalysis.getState().openDocument({
    tree: result.tree,
    document: { kind: 'untitled', title },
    clean: false,
  });
  return { result, message: describeMerge(result, ids.length - games.length) };
}
