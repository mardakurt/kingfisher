'use client';

/**
 * Every game Kingfisher holds for one opponent, from every source it holds
 * them in.
 *
 * Preparation used to read the local collection only. For a player who had
 * imported nothing that was the empty set, and the route answered "Carlsen"
 * with "No matching local games" — the installed reference packs held four
 * hundred of his games at the time, one route away, under Players. The
 * search here reads both: the user's own games, and the games the installed
 * reference sources hold for the player, each labelled with where it came
 * from and never counted twice.
 *
 * A reference game goes through the PGN parser and `normalizeGame`, exactly
 * as an import would, so by the time the opening tree sees it a pack game
 * and an imported game are the same kind of object — validated by the rules
 * code, keyed by the same fingerprint, deduplicated by the same identity.
 */

import { parsePgn } from '@/chess/pgn';
import type { GameResult } from '@/database/types';
import { normalizeGame } from '@/persistence/prepare-game';
import { getRepositories } from '@/persistence/repositories';
import { playerKey } from '@/persistence/schema/migrations';
import type { GameRecord, GameSearchQuery } from '@/persistence/types';
import { readyPackReaders } from '@/reference/manager';
import { nameOrders, type CatalogPlayer } from '@/reference/players';
import { packGamePgn } from '@/reference/provider';

export interface OpponentSource {
  readonly id: string;
  readonly name: string;
  readonly games: number;
}

export interface OpponentGames {
  readonly games: readonly GameRecord[];
  /** Every spelling the player's games are filed under, for the aggregator. */
  readonly aliases: readonly string[];
  /** Where the games came from, each with its own count. */
  readonly sources: readonly OpponentSource[];
  /** Matching games in the local collection, where that was cheap to know. */
  readonly localTotal: number | null;
}

export interface OpponentQuery {
  /** What the user typed or chose. */
  readonly name: string;
  /** The catalog row, when the name was chosen from the player library. */
  readonly player?: CatalogPlayer | null;
  readonly side?: 'w' | 'b';
  readonly fromYear?: number;
  readonly toYear?: number;
  readonly minRating?: number;
  readonly eco?: string;
  readonly result?: GameResult;
  readonly limit: number;
}

/** The spellings a game could file this player under. */
export function opponentAliases(query: OpponentQuery): readonly string[] {
  const names = new Set<string>([query.name, ...nameOrders(query.name)]);
  if (query.player) {
    names.add(query.player.key);
    names.add(query.player.name);
    for (const spelling of nameOrders(query.player.name)) names.add(spelling);
    for (const alias of query.player.legend?.aliases ?? []) {
      names.add(alias);
      for (const spelling of nameOrders(alias)) names.add(spelling);
    }
    for (const alias of query.player.titled?.aliases ?? []) {
      names.add(alias);
      for (const spelling of nameOrders(alias)) names.add(spelling);
    }
  }
  return [...names].filter((name) => name.trim().length > 0);
}

/** The same filters the local search applies, for games that did not come through it. */
export function acceptsGame(game: GameRecord, query: OpponentQuery, keys: ReadonlySet<string>) {
  const side = keys.has(game.whiteKey) ? 'w' : keys.has(game.blackKey) ? 'b' : null;
  if (!side) return false;
  if (query.side && side !== query.side) return false;
  if (query.fromYear && (game.year ?? 0) < query.fromYear) return false;
  if (query.toYear && (game.year ?? 9999) > query.toYear) return false;
  if (query.minRating) {
    const rating = side === 'w' ? game.whiteRating : game.blackRating;
    if ((rating ?? 0) < query.minRating) return false;
  }
  if (query.eco && !(game.eco ?? '').toUpperCase().startsWith(query.eco.toUpperCase())) {
    return false;
  }
  if (query.result && game.result !== query.result) return false;
  return true;
}

export async function collectOpponentGames(query: OpponentQuery): Promise<OpponentGames> {
  const aliases = opponentAliases(query);
  const keys = new Set(aliases.map(playerKey).filter(Boolean));
  const sources: OpponentSource[] = [];
  const seen = new Set<string>();
  const games: GameRecord[] = [];

  const repositories = await getRepositories();
  const localQuery: GameSearchQuery = {
    player: query.name,
    ...(query.side ? { playerColor: query.side } : {}),
    ...(query.fromYear ? { fromYear: query.fromYear } : {}),
    ...(query.toYear ? { toYear: query.toYear } : {}),
    ...(query.minRating ? { minRating: query.minRating } : {}),
    ...(query.eco ? { eco: query.eco } : {}),
    ...(query.result ? { result: query.result } : {}),
    sortBy: 'date',
    sortDirection: 'desc',
    limit: query.limit,
    exactTotal: true,
  };
  const summaries = await repositories.games.search(localQuery);
  const local = await repositories.games.getMany(summaries.games.map((game) => game.id));
  for (const game of local) {
    if (seen.has(game.fingerprint)) continue;
    seen.add(game.fingerprint);
    games.push(game);
  }
  if (local.length > 0) sources.push({ id: 'local', name: 'My games', games: local.length });

  /*
    Then every installed reference source, by every spelling. A pack files a
    player under one identity, so the first spelling that answers is the one
    the pack knows and the rest return nothing.
  */
  for (const reader of readyPackReaders()) {
    const ids = new Set<string>();
    for (const alias of aliases) {
      for (const id of await reader.playerGames(playerKey(alias))) ids.add(id);
      if (ids.size > 0) break;
    }
    if (ids.size === 0) continue;
    let added = 0;
    for (const game of await reader.games([...ids])) {
      const parsed = parsePgn(packGamePgn(game, reader.manifest)).games[0];
      if (!parsed) continue;
      const record = normalizeGame(parsed.tree);
      if (seen.has(record.fingerprint)) continue;
      if (!acceptsGame(record, query, keys)) continue;
      seen.add(record.fingerprint);
      games.push(record);
      added += 1;
    }
    if (added > 0) {
      sources.push({ id: reader.manifest.id, name: reader.manifest.name, games: added });
    }
  }

  games.sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || (b.date ?? '').localeCompare(a.date ?? ''));

  return {
    games: games.slice(0, query.limit),
    aliases,
    sources,
    localTotal: summaries.total,
  };
}
