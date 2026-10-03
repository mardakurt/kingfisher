'use client';

/**
 * A reference pack in the Library (ChessBase searches Mega Database there).
 *
 * A pack is built to answer positions, and to list a player's games by name
 * (`PackReader.playerGames`); it keeps no index a list of all its games could
 * be paged from. So the Library asks it what it can answer: the games of a
 * player — or of an opponent — and every other header filter is applied to
 * those, in memory, with the same matcher My games uses (`matchesGameSearch`).
 * With neither name there is no list, and the page says why rather than
 * showing an empty one. A pack keeps no time control, so that filter is
 * dropped and named, as a companion database's is.
 */

import { matchesGameSearch } from '@/persistence/game-match';
import { playerKey } from '@/persistence/schema/migrations';
import type { GameResult } from '@/database/types';
import type { GameSearchQuery, GameSearchResult, GameSummary } from '@/persistence/types';
import type { PackGame, PackPlayer } from '@/reference/pack';
import { nameOrders } from '@/reference/players';

/** The slice of a pack reader the Library needs. */
export interface ReferenceLibraryReader {
  playerGames(key: string): Promise<readonly string[]>;
  games(ids: readonly string[]): Promise<readonly PackGame[]>;
  /** Every player, most games first; what the search box's partial names are found in. */
  allPlayers(): Promise<readonly Pick<PackPlayer, 'key' | 'id' | 'name' | 'games'>[]>;
}

/** How many players a partial name may stand for before the search asks for more of it. */
export const TEXT_PLAYER_LIMIT = 8;

/** Fields a pack cannot be asked about, by the name a person knows them by. */
export const REFERENCE_UNSUPPORTED: Readonly<Record<string, string>> = {
  timeClass: 'time control',
};

/** A pack game as a Library row. */
export function packGameSummary(game: PackGame): GameSummary {
  const whiteKey = playerKey(game.white);
  const blackKey = playerKey(game.black);
  return {
    id: game.id,
    fingerprint: game.id,
    white: game.white,
    black: game.black,
    whiteKey,
    blackKey,
    playerKeys: whiteKey === blackKey ? [whiteKey] : [whiteKey, blackKey],
    result: (['1-0', '0-1', '1/2-1/2'].includes(game.result) ? game.result : '*') as GameResult,
    ...(game.date ? { date: game.date } : {}),
    ...(game.year > 0 ? { year: game.year } : {}),
    ...(game.event ? { event: game.event } : {}),
    ...(game.url ? { site: game.url } : {}),
    ...(game.whiteElo > 0 ? { whiteRating: game.whiteElo } : {}),
    ...(game.blackElo > 0 ? { blackRating: game.blackElo } : {}),
    ...(game.eco && game.eco !== '?' ? { eco: game.eco } : {}),
    ...(game.opening && game.opening !== '?' ? { opening: game.opening } : {}),
    // A pack game was never imported; "newest first" reads its date instead.
    importedAt: 0,
  };
}

/** Whether a query names someone a pack can list games for, wholly or in part. */
export const namesAPlayer = (query: GameSearchQuery): boolean =>
  Boolean(playerKey(query.player) || playerKey(query.opponent) || query.text?.trim());

/**
 * One person as a pack knows them: every spelling the pack filed under the
 * same identity ("Carlsen, Magnus" and "Magnus Carlsen", when the archive
 * says they are one player), and the games it lists for them. A game is that
 * person's when either side carries any of those spellings — comparing one
 * spelling dropped the games filed under another.
 */
interface ResolvedPlayer {
  readonly keys: ReadonlySet<string>;
  readonly games: readonly PackGame[];
}

async function resolvePlayer(
  reader: ReferenceLibraryReader,
  name: string,
): Promise<ResolvedPlayer> {
  const spellings = [...new Set([playerKey(name), ...nameOrders(name).map(playerKey)])];
  const players = await reader.allPlayers();
  const row = players.find((player) => spellings.includes(player.key));
  const keys = new Set(
    row ? players.filter((player) => player.id === row.id).map((player) => player.key) : [],
  );
  for (const spelling of row ? [row.key] : spellings) {
    const ids = await reader.playerGames(spelling);
    if (ids.length > 0) {
      keys.add(spelling);
      return { keys, games: await reader.games(ids) };
    }
  }
  return { keys: new Set(spellings), games: [] };
}

function compare(a: GameSummary, b: GameSummary, query: GameSearchQuery): number {
  const by = query.sortBy ?? 'importedAt';
  const date = (game: GameSummary) => game.date ?? (game.year ? String(game.year) : '');
  const value =
    by === 'white'
      ? a.white.localeCompare(b.white)
      : by === 'black'
        ? a.black.localeCompare(b.black)
        : by === 'rating'
          ? Math.max(a.whiteRating ?? 0, a.blackRating ?? 0) -
            Math.max(b.whiteRating ?? 0, b.blackRating ?? 0)
          : by === 'opening'
            ? (a.opening ?? a.eco ?? '').localeCompare(b.opening ?? b.eco ?? '')
            : date(a).localeCompare(date(b));
  return (query.sortDirection ?? 'desc') === 'asc' ? value : -value;
}

/** Every game of the query's player (or opponent) that matches it, sorted, unpaged. */
export async function referenceMatches(
  reader: ReferenceLibraryReader,
  query: GameSearchQuery,
): Promise<readonly GameSummary[]> {
  const {
    limit: _limit,
    offset: _offset,
    exactTotal: _exact,
    timeClass: _time,
    player: _player,
    opponent: _opponent,
    playerColor,
    ...filters
  } = query;
  const player = playerKey(query.player) ? await resolvePlayer(reader, query.player!) : null;
  const opponent = playerKey(query.opponent) ? await resolvePlayer(reader, query.opponent!) : null;
  let candidates: readonly PackGame[];
  if (player || opponent) {
    // Both named: each one's list is read, since a pack lists only a player's
    // newest games and a meeting may be in one list and not the other.
    candidates = [...(player?.games ?? []), ...(opponent?.games ?? [])];
  } else if (query.text?.trim()) {
    /*
      The search box, as ChessBase's "Search by player": the players whose
      names contain the text, the most games first. The text is then applied
      to their games as it is anywhere, so an event matching it is not lost
      from games already chosen — but a game is chosen only by a player.
    */
    const needle = query.text.trim().toLowerCase();
    const players = (await reader.allPlayers())
      .filter((entry) => entry.name.toLowerCase().includes(needle))
      .slice(0, TEXT_PLAYER_LIMIT);
    candidates = (
      await Promise.all(
        players.map(async (entry) => reader.games(await reader.playerGames(entry.key))),
      )
    ).flat();
  } else {
    return [];
  }
  // The same rule as matchesPlayers, over every spelling of each person.
  const sides = (summary: GameSummary): boolean => {
    const asWhite =
      playerColor !== 'b' &&
      (!player || player.keys.has(summary.whiteKey)) &&
      (!opponent || opponent.keys.has(summary.blackKey));
    const asBlack =
      playerColor !== 'w' &&
      (!player || player.keys.has(summary.blackKey)) &&
      (!opponent || opponent.keys.has(summary.whiteKey));
    return asWhite || asBlack;
  };
  const seen = new Set<string>();
  const rows: GameSummary[] = [];
  for (const game of candidates) {
    if (seen.has(game.id)) continue;
    seen.add(game.id);
    const summary = packGameSummary(game);
    if (sides(summary) && matchesGameSearch(summary, filters)) rows.push(summary);
  }
  return rows.sort((a, b) => compare(a, b, query));
}

/** One page of them, counted exactly — the set is one player's games, already in memory. */
export async function searchReference(
  reader: ReferenceLibraryReader,
  query: GameSearchQuery,
): Promise<GameSearchResult> {
  const all = await referenceMatches(reader, query);
  const offset = query.offset ?? 0;
  const limit = query.limit ?? 100;
  return {
    games: all.slice(offset, offset + limit),
    total: all.length,
    hasMore: offset + limit < all.length,
  };
}

export interface ReferenceCoverage {
  readonly name: string;
  /** Games the pack can list for the player. */
  readonly listed: number;
  /** Games the pack counted for the player when it was built. */
  readonly played: number;
}

/**
 * The players a search reads whose games the pack lists only in part.
 *
 * A pack keeps a player's newest few hundred games with their moves
 * (`gamesPerPlayer` in scripts/reference/packs.mjs) and counts the rest;
 * the Library must not let "300 games" read as all of Carlsen's 705.
 */
export async function referenceCoverage(
  reader: ReferenceLibraryReader,
  query: GameSearchQuery,
): Promise<readonly ReferenceCoverage[]> {
  const players = await reader.allPlayers();
  const named = [query.player, query.opponent]
    .filter((name): name is string => Boolean(name && playerKey(name)))
    .map((name) => {
      const spellings = new Set([playerKey(name), ...nameOrders(name).map(playerKey)]);
      return players.find((player) => spellings.has(player.key));
    });
  const chosen =
    named.length > 0
      ? named
      : query.text?.trim()
        ? players
            .filter((player) =>
              player.name.toLowerCase().includes(query.text!.trim().toLowerCase()),
            )
            .slice(0, TEXT_PLAYER_LIMIT)
        : [];
  const short: ReferenceCoverage[] = [];
  for (const player of chosen) {
    if (!player) continue;
    const listed = (await reader.playerGames(player.key)).length;
    if (listed < player.games) short.push({ name: player.name, listed, played: player.games });
  }
  return short;
}
