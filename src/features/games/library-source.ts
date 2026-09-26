'use client';

/**
 * Which database the Library is showing (Phase 84).
 *
 * ChessBase opens any database in the same game list; until this phase the
 * Library listed only the games stored in this browser, and a SQLite database
 * behind the companion could be browsed only from the Databases page. A
 * source is one of the two stores the collection abstraction already knows,
 * and this module is everything the list needs from one: a page of games for
 * a query, the moves of one game, and a way onto the board.
 *
 * A companion database answers the Library's filters with its own matcher
 * (`gameWhere` in `companion/src/database.mjs`), which reads every field but
 * the time-control class. A filter a source cannot apply is returned as
 * dropped, so the page can say it was not applied rather than show a list
 * that silently ignores it.
 */

import { nodeAtPly } from '@/chess/tree/find';
import { parseSingleGame } from '@/chess/pgn';
import type { GameTree } from '@/chess/tree/types';
import type { CompanionMoveQuery, CompanionMoveSearchResult } from '@/companion/client';
import { companionClient } from '@/companion/session';
import { getRepositories } from '@/persistence/repositories';
import type { GameSearchQuery, GameSearchResult, GameSummary } from '@/persistence/types';
import { gameTitle } from '@/persistence/describe';
import { useAnalysis } from '@/stores/analysis-store';

import type { DeepQuery } from '@/search/game-scan';
import { lineFromRows, lineIndexForRows, THEMES_VERSION_NUMBER } from '@/search/line-index-encode';

import { runPagedDeepSearch, type DeepMatch, type DeepSearchState } from './deep-search';
import { openStoredGame } from './open-game';

export type LibrarySource =
  | { readonly kind: 'local'; readonly id: 'local'; readonly name: string }
  | {
      readonly kind: 'companion';
      readonly id: string;
      readonly key: string;
      readonly name: string;
    };

export const LOCAL_SOURCE: LibrarySource = { kind: 'local', id: 'local', name: 'My games' };

/** A source from its collection id (`local`, `sqlite:<key>`) and name. */
export function librarySource(id: string | null | undefined, name?: string): LibrarySource {
  if (id && id.startsWith('sqlite:')) {
    const key = id.slice('sqlite:'.length);
    return { kind: 'companion', id, key, name: name ?? key };
  }
  return LOCAL_SOURCE;
}

/** Query fields a companion database does not read, with the name a person knows them by. */
const COMPANION_UNSUPPORTED: Readonly<Record<string, string>> = {
  timeClass: 'time control',
};

/** The query a source can answer, and the filters it could not apply. */
export function queryForSource(
  query: GameSearchQuery,
  source: LibrarySource,
): { readonly query: GameSearchQuery; readonly dropped: readonly string[] } {
  if (source.kind === 'local') return { query, dropped: [] };
  const kept: Record<string, unknown> = {};
  const dropped: string[] = [];
  for (const [field, value] of Object.entries(query)) {
    const name = COMPANION_UNSUPPORTED[field];
    if (name) dropped.push(name);
    else kept[field] = value;
  }
  return { query: kept as GameSearchQuery, dropped };
}

export async function searchSource(
  source: LibrarySource,
  query: GameSearchQuery,
): Promise<GameSearchResult> {
  if (source.kind === 'local') return (await getRepositories()).games.search(query);
  const client = companionClient();
  if (!client) throw new Error('The companion is not connected, so that database cannot be read.');
  return client.searchGames<GameSearchResult>(source.key, {
    ...queryForSource(query, source).query,
    exactTotal: true,
  });
}

/** The moves of one game, as a tree the rules code built. */
export async function sourceTree(source: LibrarySource, id: string): Promise<GameTree | null> {
  if (source.kind === 'local') return (await (await getRepositories()).games.get(id))?.tree ?? null;
  const client = companionClient();
  if (!client) throw new Error('The companion is not connected.');
  const { pgn } = await client.gameContent(source.key, id);
  if (!pgn) return null;
  const parsed = parseSingleGame(pgn);
  return parsed.ok ? parsed.value.tree : null;
}

/**
 * Put a game on the board. A stored game opens as source material; a game in
 * a companion database opens as a new analysis of it — the board cannot write
 * back to a file another program may have open, and "Save to study" is how it
 * becomes the player's.
 */
export async function openSourceGame(
  source: LibrarySource,
  game: GameSummary,
  options: { readonly ply?: number } = {},
): Promise<void> {
  if (source.kind === 'local') {
    await openStoredGame(game.id, options);
    return;
  }
  const tree = await sourceTree(source, game.id);
  if (!tree) throw new Error(`That game could not be read from ${source.name}.`);
  // At the ply asked for, as a stored game opens (Phase 86: it opened at the start).
  const currentId = options.ply !== undefined ? nodeAtPly(tree, options.ply) : null;
  useAnalysis.getState().openDocument({
    tree,
    document: { kind: 'untitled', title: `${gameTitle(game)} (${source.name})` },
    ...(currentId ? { currentId } : {}),
  });
}

/**
 * The move-level search over a companion database: the companion selects
 * the games by their headers with its own matcher, serves them a page at a
 * time with their PGN, and each is asked the question here, as a game in the
 * browser is. The count of selected games comes first, so progress has a
 * denominator; a filter the companion cannot apply is dropped as it is for
 * the list, and the page already says so.
 */
export async function companionMoveSearch(input: {
  readonly source: Extract<LibrarySource, { kind: 'companion' }>;
  readonly header: Omit<GameSearchQuery, 'limit' | 'offset' | 'exactTotal'>;
  readonly deep: DeepQuery;
  readonly signal?: AbortSignal;
  readonly onProgress?: (state: DeepSearchState) => void;
}): Promise<DeepSearchState> {
  const client = companionClient();
  if (!client) throw new Error('The companion is not connected, so that database cannot be read.');
  const { query } = queryForSource(input.header as GameSearchQuery, input.source);
  const { sortBy: _sortBy, sortDirection: _sortDirection, ...filters } = query;
  const key = input.source.key;
  const comment = input.deep.comment?.trim() ?? '';

  /*
    Phase 85: material, theme and route are answered by the companion itself,
    over the compact line index it keeps per game, on worker threads — the
    same answers (src/search/line-index.test.ts), in seconds at a million
    games. What the index cannot answer is read the old way below: a comment
    (only the PGN has it), a game imported before the index existed, and any
    game if the companion predates the index.
  */
  let fast: CompanionMoveSearchResult | null = null;
  if (!comment) {
    try {
      fast = await client.moveSearch(key, filters, indexedQuestion(input.deep));
    } catch {
      fast = null;
    }
  }
  const indexed = fast && fast.unanswerable === 0 ? fast : null;
  const found: DeepMatch[] = (indexed?.hits ?? []).map((hit) => ({
    game: hit.game as unknown as GameSummary,
    hit: { ply: hit.ply, nodeId: '' },
  }));
  if (indexed && indexed.unindexed === 0) {
    const state: DeepSearchState = {
      status: 'done',
      read: indexed.scanned,
      selected: indexed.selected,
      matches: found,
      // Every hit is counted; only the first few thousand are sent.
      found: indexed.total,
    };
    input.onProgress?.(state);
    return state;
  }

  const counted = indexed
    ? { total: indexed.unindexed }
    : await client.searchGames<GameSearchResult>(key, { ...filters, limit: 1, exactTotal: true });
  const alreadyRead = indexed?.scanned ?? 0;
  const forward = (state: DeepSearchState): DeepSearchState => ({
    ...state,
    read: state.read + alreadyRead,
    selected: state.selected + alreadyRead,
    matches: [...found, ...state.matches],
    found: (indexed?.total ?? 0) + state.matches.length,
  });
  const slow = await runPagedDeepSearch({
    selected: counted.total ?? 0,
    page: async (after) => {
      // The main line the companion indexed at import is two hundred times
      // cheaper than the PGN; a comment is only in the PGN, and the text
      // itself narrows which PGNs are worth reading.
      const page = await client.exportPage(key, after, MOVE_PAGE, filters, {
        positions: comment ? false : 'line',
        ...(indexed ? { unindexedOnly: true } : {}),
        ...(comment ? { pgnContains: comment } : {}),
      });
      if (!comment) {
        // Each game read the old way gets its line index, so the next search does not have to.
        const lines = page.games.flatMap((game) => {
          const data = lineIndexForRows(game.positions as never);
          const id = (game.summary as { id?: unknown }).id;
          return data && typeof id === 'string' ? [{ id, data }] : [];
        });
        if (lines.length) void client.storeLines(key, lines).catch(() => undefined);
      }
      return {
        games: page.games.map((game) => ({
          summary: game.summary as unknown as GameSummary,
          pgn: game.pgn ?? null,
          line: comment ? null : lineFromRows(game.positions),
        })),
        nextAfter: page.games.length > 0 ? page.nextAfter : null,
      };
    },
    parse: (pgn) => {
      const parsed = parseSingleGame(pgn);
      return parsed.ok ? parsed.value.tree : null;
    },
    deep: input.deep,
    ...(input.signal ? { signal: input.signal } : {}),
    ...(input.onProgress
      ? { onProgress: (state: DeepSearchState) => input.onProgress!(forward(state)) }
      : {}),
  });
  const final = forward(slow);
  // A comment prefilter skips games whose PGN lacks the text: they are read, and did not match.
  return comment ? { ...final, read: final.selected, selected: final.selected } : final;
}

/** The question as text, for the companion to parse with the application's own parsers. */
function indexedQuestion(deep: DeepQuery): CompanionMoveQuery {
  return {
    themesVersion: THEMES_VERSION_NUMBER,
    ...(deep.material
      ? {
          material: {
            text: deep.material.query.label,
            ...(deep.material.colour ? { colour: deep.material.colour } : {}),
          },
        }
      : {}),
    ...(deep.theme ? { theme: deep.theme } : {}),
    ...(deep.route
      ? {
          route: {
            text: deep.route.route.label,
            ...(deep.route.colour ? { colour: deep.route.colour } : {}),
          },
        }
      : {}),
  };
}

/** Games per page when a companion database is read for its moves. */
const MOVE_PAGE = 500;

// Phase 85: moved beside the line index it now also feeds.
export { lineFromRows };
