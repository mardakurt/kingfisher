'use client';

/**
 * Searching the player catalog.
 *
 * The catalog is whatever the installed reference packs hold, plus a curated
 * historical roster that exists because the packs cannot hold it — the open
 * archive Kingfisher builds from begins in 2020, and a chess application whose
 * player list starts at Carlsen and stops before Fischer is not a chess
 * application.
 *
 * The two are kept visibly apart. A pack row is a count of games that exist; a
 * roster row is a person, with however many games the installed sources
 * actually have, which is frequently none. Presenting the second as though it
 * were the first is exactly the invention this project does not do.
 */

import { useQuery } from '@tanstack/react-query';

import { LEGENDS, type Legend } from './legends';
import { readyPackReaders } from './manager';
import type { PackPlayer } from './pack';
import { useReferenceSources } from './use-references';

export interface CatalogPlayer {
  /** Canonical key: the pack identity, or the roster entry's own key. */
  readonly key: string;
  readonly name: string;
  readonly title: string;
  readonly fideId: string;
  /** Games in installed reference sources. Zero is a real answer. */
  readonly games: number;
  readonly firstYear: number;
  readonly lastYear: number;
  /** Highest rating *recorded in the installed sources*, not a career peak. */
  readonly peakRating: number;
  readonly lastRating: number;
  /** Which reference sources contributed, so a count can be traced. */
  readonly sources: readonly string[];
  /** Set when the player is in the curated historical roster. */
  readonly legend?: Legend;
}

const playerKey = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, ' ');

/** Every player the installed packs know, merged across packs by identity. */
async function collect(): Promise<readonly CatalogPlayer[]> {
  const merged = new Map<string, CatalogPlayer>();

  for (const reader of readyPackReaders()) {
    const source = reader.manifest.name;
    for (const player of await reader.allPlayers()) {
      if (player.key !== player.id) continue; // aliases duplicate their identity
      const existing = merged.get(player.id);
      merged.set(player.id, existing ? combine(existing, player, source) : first(player, source));
    }
  }

  /*
    The roster is folded in by name, and only by an exact canonical name match
    or a declared alias. Nothing here decides that two similar names are one
    person: that is the user's judgement, and Phase 12's identity rules are not
    relaxed because a name is famous.
  */
  for (const legend of LEGENDS) {
    const keys = [playerKey(legend.name), ...legend.aliases.map(playerKey)];
    const hit = keys.map((key) => merged.get(key)).find((entry) => entry !== undefined);
    if (hit) {
      merged.set(hit.key, { ...hit, legend, name: legend.name });
      continue;
    }
    const key = playerKey(legend.name);
    merged.set(key, {
      key,
      name: legend.name,
      title: legend.title,
      fideId: legend.fideId ?? '',
      games: 0,
      firstYear: 0,
      lastYear: 0,
      peakRating: 0,
      lastRating: 0,
      sources: [],
      legend,
    });
  }

  return [...merged.values()];
}

const first = (player: PackPlayer, source: string): CatalogPlayer => ({
  key: player.id,
  name: player.name,
  title: player.title,
  fideId: player.fideId,
  games: player.games,
  firstYear: player.firstYear,
  lastYear: player.lastYear,
  peakRating: player.peakRating,
  lastRating: player.lastRating,
  sources: [source],
});

/**
 * Two packs' rows for one player.
 *
 * Games are added because packs built from the same archive at different
 * cut-offs would double-count — so they are *not*: the larger count wins,
 * which is the truthful answer for overlapping populations and the one that
 * cannot overstate. Ratings and years take the extremes, which is safe in
 * either case.
 */
const combine = (current: CatalogPlayer, player: PackPlayer, source: string): CatalogPlayer => ({
  ...current,
  name: player.games > current.games ? player.name : current.name,
  title: current.title || player.title,
  fideId: current.fideId || player.fideId,
  games: Math.max(current.games, player.games),
  firstYear:
    current.firstYear === 0
      ? player.firstYear
      : Math.min(current.firstYear, player.firstYear || 9999),
  lastYear: Math.max(current.lastYear, player.lastYear),
  peakRating: Math.max(current.peakRating, player.peakRating),
  lastRating: player.lastYear >= current.lastYear ? player.lastRating : current.lastRating,
  sources: [...current.sources, source],
});

/**
 * The whole catalog, loaded once per set of installed packs.
 *
 * A player table is the smallest thing in a pack — tens of thousands of short
 * rows, well under a megabyte compressed — and searching by name has no shard
 * to go to, so this is the one read that loads a kind whole.
 */
export function usePlayerCatalog() {
  const references = useReferenceSources();
  const installed = references.sources
    .filter((source) => source.installed)
    .map((source) => `${source.id}@${source.version ?? ''}`)
    .join(',');

  return useQuery({
    queryKey: ['player-catalog', installed],
    queryFn: collect,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 30 * 60_000,
  });
}

export type PlayerFilter =
  | 'all'
  | 'top-100'
  | 'top-500'
  | 'world-champion'
  | 'women-champion'
  | 'legend'
  | 'has-games'
  /**
   * The people the roster knows and the installed sources have no games for.
   *
   * Kept as a set of its own rather than mixed into the browse lists. A
   * profile that promises a famous name and delivers nothing teaches a user
   * that the player library is unreliable, so the primary sets contain only
   * players who lead somewhere and this one is labelled for what it is: an
   * index of people, not a library of their games.
   */
  | 'historical-index';

/**
 * Browse sets that must never contain a player with nothing to show.
 *
 * Enforced by `players.test.ts` and by `e2e/players.spec.ts`, because it is a
 * product rule rather than a property of the data: the packs change, and the
 * rule has to survive them changing.
 */
export const PRIMARY_PLAYER_FILTERS: readonly PlayerFilter[] = [
  'all',
  'top-100',
  'top-500',
  'world-champion',
  'women-champion',
  'legend',
  'has-games',
];

/**
 * The rating that ranks a player, and why it is the latest rather than the peak.
 *
 * A "top 100" built on peak ratings is a list of who was ever strong, which is
 * a different and much longer list than who is strong now — and the peak
 * recorded here is only the highest this *source* saw, which for a player who
 * joined the archive late is not their career peak at all. The latest recorded
 * rating is the honest basis for a current-strength ranking.
 */
const rankingRating = (player: CatalogPlayer): number => player.lastRating || player.peakRating;

export interface PlayerSearchOptions {
  readonly query: string;
  readonly filter: PlayerFilter;
  readonly limit?: number;
}

/**
 * Rank by how well the name matches, then by how much evidence there is.
 *
 * A prefix match on either the surname or the given name beats a match in the
 * middle of a word, because "car" should find Caruana and Carlsen before it
 * finds Iturrizaga Bonelli, Eduardo — and a player with four hundred games in
 * the installed sources is more likely to be the one meant than a namesake
 * with two.
 */
/**
 * A name reduced to what two spellings of it have in common.
 *
 * Diacritics are folded because a user who types the *correct* spelling of a
 * Hungarian name must not get fewer results than one who cannot be bothered:
 * "Polgár" found nothing while "Polgar" found both sisters. Folding is
 * one-directional — the stored name keeps its accents and is displayed with
 * them — and it is applied to both sides of every comparison so neither
 * spelling is privileged.
 */
export const foldName = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .trim()
    .toLowerCase();

/**
 * A name reduced further, to what a person typing it might not reproduce.
 *
 * Hyphens, apostrophes and full stops are separators that a database and a
 * user disagree about constantly — "Vachier-Lagrave" and "Vachier Lagrave",
 * "O'Kelly" and "O Kelly". Matching treats them all as a space; display never
 * does, so the stored spelling is what appears on screen.
 */
export const matchKey = (value: string): string =>
  foldName(value)
    .replace(/[-'’.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Nicknames a chess player is actually called, mapped to a name they appear
 * under.
 *
 * Short, checked, and deliberately not a fuzzy matcher. "MVL" is what everyone
 * calls Maxime Vachier-Lagrave and no database writes it; guessing that from
 * initials would also turn "MC" into Magnus Carlsen and every third three
 * letter query into a wrong confident answer. Each entry here was written down
 * once, by a person.
 */
export const PLAYER_NICKNAMES: Readonly<Record<string, string>> = {
  mvl: 'vachier-lagrave',
  vishy: 'anand',
  hikaru: 'nakamura',
  magnus: 'carlsen',
  nepo: 'nepomniachtchi',
  praggu: 'praggnanandhaa',
  pragg: 'praggnanandhaa',
  dubov: 'dubov',
  shirov: 'shirov',
  gukesh: 'gukesh',
  wesley: 'so, wesley',
  fabi: 'caruana',
  ding: 'ding, liren',
  levon: 'aronian',
  alireza: 'firouzja',
};

export function searchPlayers(
  players: readonly CatalogPlayer[],
  { query, filter, limit = 200 }: PlayerSearchOptions,
): readonly CatalogPlayer[] {
  const typed = foldName(query);
  const needle = PLAYER_NICKNAMES[typed] ?? typed;
  /** The same needle with separators flattened, for matching only. */
  const loose = matchKey(needle);
  /*
    The rating lists are a *rank*, so they have to be computed over the whole
    catalog before anything is filtered by name. Filtering first and then
    taking the top hundred of what is left would make "top 100" mean "the
    hundred best whose name contains what you typed", which is not a list
    anybody wants.
  */
  const ranked =
    filter === 'top-100' || filter === 'top-500'
      ? new Set(
          [...players]
            .filter((player) => rankingRating(player) > 0)
            .sort((a, b) => rankingRating(b) - rankingRating(a))
            .slice(0, filter === 'top-100' ? 100 : 500)
            .map((player) => player.key),
        )
      : null;

  const matched = players.filter((player) => {
    if (ranked) {
      if (!ranked.has(player.key)) return false;
    } else if (!passesFilter(player, filter, needle.length > 0)) return false;
    if (needle.length === 0) return true;
    return (
      matchKey(player.key).includes(loose) ||
      matchKey(player.name).includes(loose) ||
      (player.legend?.aliases.some((alias) => matchKey(alias).includes(loose)) ?? false)
    );
  });

  /*
    A rating list is a *ranking*, so it is ordered by rating — that is what the
    list is. Every other filter is ordered by how well the name matched and
    then by how much evidence there is behind the row.
  */
  if (ranked && needle.length === 0) {
    return matched.sort((a, b) => rankingRating(b) - rankingRating(a)).slice(0, limit);
  }

  return matched
    .map((player) => ({ player, rank: rankOf(player, needle) }))
    .sort((a, b) => b.rank - a.rank || b.player.games - a.player.games)
    .slice(0, limit)
    .map((entry) => entry.player);
}

/**
 * Whether a player belongs in a set.
 *
 * `searching` is the distinction that makes both rules possible at once.
 * *Browsing* a set is Kingfisher offering you people, and it must not offer a
 * famous name with nothing behind it. *Searching* is you naming somebody, and
 * the honest answer to "Morphy" is the roster entry saying there are no games
 * here — not silence, which reads as "Kingfisher has never heard of him".
 */
function passesFilter(player: CatalogPlayer, filter: PlayerFilter, searching = false): boolean {
  switch (filter) {
    /*
      "Everyone" means everyone Kingfisher can show you something about. A
      roster entry with no games is a real, checked fact about a person and it
      belongs in the historical index, not in a browse list where every other
      row opens a profile full of games — unless the user typed their name, in
      which case they are exactly who was meant.
    */
    case 'all':
      return searching || player.games > 0;
    case 'top-100':
    case 'top-500':
      // Handled as a rank over the whole catalog, in `searchPlayers`.
      return true;
    /*
      Every set below the rating lists requires at least one game. The roster
      names 106 people and the installed packs begin in 2020, so without this
      the World champions list led with Steinitz, Lasker and Capablanca —
      three profiles with nothing behind them.
    */
    case 'world-champion':
      return (player.legend?.roles.includes('world-champion') ?? false) && player.games > 0;
    case 'women-champion':
      return (player.legend?.roles.includes('women-champion') ?? false) && player.games > 0;
    case 'legend':
      return player.legend !== undefined && player.games > 0;
    case 'has-games':
      return player.games > 0;
    case 'historical-index':
      return player.legend !== undefined && player.games === 0;
  }
}

/**
 * How well a row answers the query, before games break the tie.
 *
 * Two things this has to get right, and the second is the one that is easy to
 * miss. A whole-word match beats a prefix — typing "tal" should find Tal
 * before Talibov, Talgatov and Talukdar. And a player the roster knows gets a
 * bump, because a world champion with no games in the installed sources is
 * still much more likely to be who was meant than a namesake with twelve.
 */
function rankOf(player: CatalogPlayer, needle: string): number {
  const role = player.legend?.roles.includes('world-champion')
    ? 4
    : player.legend?.roles.includes('women-champion')
      ? 3
      : player.legend
        ? 2
        : 0;
  if (needle.length === 0) return role;

  // Normalised on both sides, so ranking agrees with matching about what a
  // name is; otherwise a row can match and then rank as though it had not.
  const name = matchKey(player.name);
  const words = name.split(/\s+/).filter(Boolean);
  const match =
    name === needle
      ? 16
      : words.includes(needle)
        ? 12
        : name.startsWith(needle)
          ? 8
          : words.some((word) => word.startsWith(needle))
            ? 6
            : 2;
  return match + role;
}
