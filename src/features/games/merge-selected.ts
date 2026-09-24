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

import { parsePgn } from '@/chess/pgn';
import { mergeGames, type MergeResult, type MergeSource } from '@/chess/tree/merge';
import type { DatabaseGameRef } from '@/database/types';
import { gameTitle } from '@/persistence/describe';
import { getRepositories } from '@/persistence/repositories';
import type { GameId } from '@/persistence/types';
import { referenceGamePgn } from '@/reference/player-games';
import { useAnalysis, type OpenDocumentInput } from '@/stores/analysis-store';

/** Where a merged file goes: the board by default, or a new tab. */
export type Place = (input: OpenDocumentInput) => unknown;

const onBoard: Place = (input) => useAnalysis.getState().openDocument(input);

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
  place: Place = onBoard,
): Promise<{ readonly result: MergeResult; readonly message: string }> {
  const repositories = await getRepositories();
  const loaded = await Promise.all(ids.map((id) => repositories.games.get(id)));
  const games = loaded.filter((game): game is NonNullable<typeof game> => Boolean(game));
  const result = mergeGames(games.map((game) => ({ tree: game.tree, label: mergeLabel(game) })));
  const title = result.tree.headers.Event ?? 'Merged games';
  await place({ tree: result.tree, document: { kind: 'untitled', title }, clean: false });
  return { result, message: describeMerge(result, ids.length - games.length) };
}

/**
 * The model games an installed pack lists at a position, merged the same way.
 *
 * Each game goes through the import parser, so a pack's move list is replayed
 * by the rules code rather than trusted. Offered for installed packs only:
 * their games are on this machine, where a remote source would be one request
 * per game.
 */
export async function mergeReferenceGames(
  sourceId: string,
  sourceName: string,
  refs: readonly DatabaseGameRef[],
  place: Place = onBoard,
): Promise<{ readonly result: MergeResult; readonly message: string }> {
  const sources: MergeSource[] = [];
  for (const ref of refs) {
    const pgn = await referenceGamePgn(sourceId, ref.id);
    const tree = pgn ? parsePgn(pgn).games[0]?.tree : undefined;
    if (!tree) continue;
    sources.push({
      tree,
      label: mergeLabel({
        white: ref.white,
        black: ref.black,
        result: ref.result,
        ...(ref.event ? { event: ref.event } : {}),
        ...(ref.year ? { year: ref.year } : {}),
      } as Parameters<typeof gameTitle>[0]),
    });
  }
  const result = mergeGames(sources, {
    headers: { Event: `${sources.length} games merged from ${sourceName}` },
  });
  await place({
    tree: result.tree,
    document: { kind: 'untitled', title: result.tree.headers.Event ?? 'Merged games' },
    clean: false,
  });
  return { result, message: describeMerge(result, refs.length - sources.length) };
}
