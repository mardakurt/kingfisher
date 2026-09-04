'use client';

/**
 * Reading one player out of the local collection.
 *
 * Two queries with deliberately different costs, because the two halves of a
 * profile have deliberately different costs. The aggregate walks game
 * *summaries*, which is cheap enough to cover an archive; the tendencies read
 * game *trees*, which is not, and is therefore capped and says so.
 *
 * Splitting them also means the page paints its counts immediately and fills in
 * the measured tendencies afterwards, rather than showing nothing until the
 * expensive half is done.
 */

import { useQuery } from '@tanstack/react-query';

import { getRepositories } from '@/persistence/repositories';
import { playerKey } from '@/persistence/schema/migrations';
import type { GameSummary } from '@/persistence/types';
import {
  aggregatePlayer,
  playerSide,
  resolvePeriod,
  type PlayerAggregate,
  type PlayerPeriod,
} from '@/player/aggregate';
import { measureTendencies, playerGameView, type TendencyReport } from '@/player/tendencies';

/**
 * Games read per page while aggregating.
 *
 * The search repository already pages; this is only how big each page is. Large
 * enough that a five-thousand-game career is a handful of round trips, small
 * enough that a page is not a noticeable pause.
 */
const AGGREGATE_PAGE = 500;

/**
 * How many games the tendency pass reads the moves of.
 *
 * Two hundred is a real sample and about a second of work; the whole archive
 * would be minutes. The number is shown to the user beside every figure, which
 * is the part that makes the cap honest rather than a hidden approximation.
 */
export const TENDENCY_SAMPLE = 200;

export interface PlayerIdentityView {
  readonly id: string;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly keys: ReadonlySet<string>;
  readonly fideId?: string;
  readonly lichessUsername?: string;
  readonly chessComUsername?: string;
  readonly favorite: boolean;
  /** True when the user has actually stored something about this player. */
  readonly stored: boolean;
}

/**
 * Who this profile is about.
 *
 * A route id is a player key, and a profile exists for every name in the
 * database whether or not anybody has ever described it. When a stored identity
 * exists, its aliases widen the set of names whose games count — and only then,
 * because that widening is an assertion nobody but the user can make.
 */
export function usePlayerIdentity(id: string) {
  return useQuery({
    queryKey: ['player-identity', id],
    retry: false,
    queryFn: async (): Promise<PlayerIdentityView> => {
      const repositories = await getRepositories();
      const stored = await repositories.playerIdentities.get(id);
      if (!stored) {
        return {
          id,
          name: id,
          aliases: [id],
          keys: new Set([id]),
          favorite: false,
          stored: false,
        };
      }
      return {
        id: stored.id,
        name: stored.name,
        aliases: stored.aliases,
        keys: new Set(stored.aliasKeys),
        ...(stored.fideId ? { fideId: stored.fideId } : {}),
        ...(stored.lichessUsername ? { lichessUsername: stored.lichessUsername } : {}),
        ...(stored.chessComUsername ? { chessComUsername: stored.chessComUsername } : {}),
        favorite: stored.favorite ?? false,
        stored: true,
      };
    },
  });
}

export interface PlayerData {
  readonly aggregate: PlayerAggregate;
  /** Every matching summary, so panels can filter without a second read. */
  readonly games: readonly GameSummary[];
  /** True when the walk stopped at the safety cap rather than at the end. */
  readonly capped: boolean;
}

/** How many of a player's games the aggregate will read before stopping. */
const AGGREGATE_CAP = 20_000;

export function usePlayerAggregate(identity: PlayerIdentityView | undefined, period: PlayerPeriod) {
  const resolved = resolvePeriod(period);
  return useQuery({
    queryKey: [
      'player-aggregate',
      identity?.id,
      [...(identity?.keys ?? [])],
      resolved.id,
      resolved.fromYear,
    ],
    enabled: Boolean(identity),
    retry: false,
    queryFn: async (): Promise<PlayerData> => {
      const repositories = await getRepositories();
      const keys = identity?.keys ?? new Set<string>();
      const collected: GameSummary[] = [];
      let capped = false;

      /*
        One search per alias, then deduplicated by id. The repository's player
        index answers a whole normalized name exactly, which is the same rule
        `playerSide` applies here — so the index and the filter agree about who
        a player is, and a two-alias identity cannot double-count a game where
        both aliases somehow appear.
      */
      const seen = new Set<string>();
      for (const key of keys) {
        for (let offset = 0; ; offset += AGGREGATE_PAGE) {
          const page = await repositories.games.search({
            player: key,
            ...(resolved.fromYear ? { fromYear: resolved.fromYear } : {}),
            ...(resolved.toYear ? { toYear: resolved.toYear } : {}),
            limit: AGGREGATE_PAGE,
            offset,
            sortBy: 'date',
            sortDirection: 'desc',
          });
          for (const game of page.games) {
            if (seen.has(game.id)) continue;
            seen.add(game.id);
            collected.push(game);
          }
          if (!page.hasMore) break;
          if (collected.length >= AGGREGATE_CAP) {
            capped = true;
            break;
          }
        }
        if (capped) break;
      }

      return {
        aggregate: aggregatePlayer(collected, keys, {
          recentFromYear: new Date().getFullYear() - 2,
        }),
        games: collected,
        capped,
      };
    },
  });
}

/**
 * Measured tendencies over a bounded sample of the player's most recent games.
 *
 * Most recent rather than random, because a player's practice changes and the
 * useful sample is the current one. Stated in the panel, so nobody reads it as
 * a career figure.
 */
export function usePlayerTendencies(
  identity: PlayerIdentityView | undefined,
  games: readonly GameSummary[] | undefined,
) {
  const ids = (games ?? []).slice(0, TENDENCY_SAMPLE).map((game) => game.id);
  return useQuery({
    queryKey: ['player-tendencies', identity?.id, ids.length, ids[0] ?? '', ids.at(-1) ?? ''],
    enabled: Boolean(identity) && ids.length > 0,
    retry: false,
    queryFn: async (): Promise<TendencyReport> => {
      const repositories = await getRepositories();
      const keys = identity?.keys ?? new Set<string>();
      const records = await repositories.games.getMany(ids);
      const views = records.flatMap((record) => {
        const side = playerSide(record, keys);
        return side ? [playerGameView(record.tree, side)] : [];
      });
      return measureTendencies(views);
    },
  });
}

/** The canonical route id for a name, so links agree with stored identities. */
export const playerRouteId = (name: string): string => playerKey(name);
