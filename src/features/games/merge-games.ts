'use client';

/**
 * Merging games into one analysis, from wherever the games are listed.
 *
 * The chess is in `src/chess/tree/merge.ts`; this file fetches the games,
 * names each one the way the rest of the application does, and opens the
 * result as an untitled analysis — never as one of the source games, so
 * nothing the merge produces can be autosaved over a stored game. Saving it is
 * the person's choice, through _Save to study_, like any other analysis.
 */

import { parsePgn } from '@/chess/pgn';
import { describeMerge, mergeGames, type MergeReport, type MergeSource } from '@/chess/tree/merge';
import { gameTitle } from '@/persistence/describe';
import { getRepositories } from '@/persistence/repositories';
import type { GameId } from '@/persistence/types';
import type { DatabaseGameRef } from '@/database/types';
import { referenceGamePgn } from '@/reference/player-games';
import { openInNewTab, type Navigate } from '@/features/tabs/tab-actions';
import { useAnalysis } from '@/stores/analysis-store';
import type { GameTree } from '@/chess/tree/types';

/**
 * The most games one merge takes.
 *
 * Not a performance limit — five hundred games merge in milliseconds — but a
 * reading one: past a few hundred branches a merged tree is a database again,
 * and the explorer is the better tool for a database.
 */
export const MERGE_LIMIT = 500;

export interface MergedAnalysis {
  readonly tree: GameTree;
  readonly title: string;
  readonly report: MergeReport;
  readonly sentence: string;
}

function resultLabel(result: string | undefined): string {
  if (result === '1/2-1/2') return '½–½';
  return result && result !== '*' ? result : '';
}

function merge(sources: readonly MergeSource[], title: string): MergedAnalysis {
  const { tree, report } = mergeGames(sources);
  return { tree, title, report, sentence: describeMerge(report) };
}

/**
 * Put a merged file on the board, in a new tab so the analysis already there
 * is kept. Resolves to false when no tab could be opened (the reason has been
 * said).
 */
export function openMerged(navigate: Navigate, merged: MergedAnalysis): Promise<boolean> {
  return openInNewTab(navigate, () =>
    useAnalysis.getState().openDocument({
      tree: merged.tree,
      document: { kind: 'untitled', title: merged.title },
    }),
  );
}

/**
 * Merge games from the player's own collections, in the order given.
 *
 * The order is the list's order: the first game is the main line, as in
 * ChessBase, so a list sorted by date newest-first makes the newest game the
 * spine of the file.
 */
export async function mergeStoredGames(ids: readonly GameId[]): Promise<MergedAnalysis> {
  if (ids.length < 2) throw new Error('Choose at least two games to merge.');
  if (ids.length > MERGE_LIMIT) {
    throw new Error(`Merge at most ${MERGE_LIMIT} games at a time; ${ids.length} are selected.`);
  }
  const repositories = await getRepositories();
  const records = await repositories.games.getMany(ids);
  const byId = new Map(records.map((record) => [record.id, record]));
  const sources: MergeSource[] = [];
  for (const id of ids) {
    const record = byId.get(id);
    if (!record) continue;
    const result = resultLabel(record.result);
    sources.push({
      tree: record.tree,
      label: result ? `${gameTitle(record)}, ${result}` : gameTitle(record),
    });
  }
  if (sources.length < 2) throw new Error('Fewer than two of those games are still stored.');
  return merge(sources, `Merged: ${sources.length} games`);
}

/**
 * Merge games held by an installed reference pack — the model games the
 * explorer lists at a position.
 *
 * Each game goes through the same PGN parser as an import, so a pack's move
 * list is replayed by the rules code rather than trusted.
 */
export async function mergeReferenceGames(
  sourceId: string,
  sourceName: string,
  games: readonly DatabaseGameRef[],
): Promise<MergedAnalysis> {
  if (games.length < 2) throw new Error('At least two games are needed to merge.');
  const sources: MergeSource[] = [];
  for (const game of games.slice(0, MERGE_LIMIT)) {
    const pgn = await referenceGamePgn(sourceId, game.id);
    const tree = pgn ? parsePgn(pgn).games[0]?.tree : undefined;
    if (!tree) continue;
    const where = [game.event, game.year ? String(game.year) : undefined]
      .filter((part): part is string => Boolean(part) && part !== '?')
      .join(' ');
    const result = resultLabel(game.result);
    sources.push({
      tree,
      label: [`${game.white} – ${game.black}`, where, result].filter(Boolean).join(', '),
    });
  }
  if (sources.length < 2) {
    throw new Error(`Fewer than two of those games could be read from ${sourceName}.`);
  }
  return merge(sources, `Merged: ${sources.length} games from ${sourceName}`);
}
