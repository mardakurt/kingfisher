/**
 * Universal-search index for players.
 *
 * Three sources feed the index:
 *   1. The legends roster, which is the only way to surface players whose
 *      games are not in the open reference archive (Morphy, Capablanca, Tal,
 *      Fischer and the rest of the pre-2020 lineage);
 *   2. The titled-player roster — every GM, WGM, IM and WIM Wikidata
 *      records, with the spellings people type — fetched once, lazily, the
 *      first time a search needs it (`@/reference/titled-players`);
 *   3. The user-authored databases, where the player's name appears in
 *      every imported PGN. The persistence layer already keys these by
 *      canonical player key, so the index does not deduplicate.
 *
 * Aliases are the only mechanism by which the sources attach to the same
 * person, and they are the surface a search for "Nepo" uses to find
 * Nepomniachtchi. A person on both rosters is the legend: the curated entry
 * carries the facts a person checked.
 */

import { LEGENDS, type Legend } from '@/reference/legends';
import {
  describeTitledPlayer,
  loadTitledRoster,
  type TitledPlayer,
} from '@/reference/titled-players';
import { nameOrders } from '@/reference/players';
import { rank, type RankedHit, type Rankable } from './rank';

export interface PlayerSearchHit {
  readonly key: string;
  readonly name: string;
  readonly title: string;
  readonly born: number;
  readonly died?: number;
  readonly note: string;
  readonly source: 'legend' | 'titled' | 'database';
}

interface IndexedPlayer extends Rankable {
  readonly key: string;
  readonly name: string;
  readonly title: string;
  readonly born: number;
  readonly died: number | undefined;
  readonly note: string;
  readonly source: 'legend' | 'titled' | 'database';
}

let cache: readonly IndexedPlayer[] | null = null;

function toIndexed(legend: Legend): IndexedPlayer {
  const aliases = Array.from(new Set([legend.name, ...legend.aliases]));
  return {
    key: legend.name,
    name: legend.name,
    title: legend.title,
    born: legend.born,
    died: legend.died,
    note: legend.note,
    source: 'legend',
    text: legend.name,
    aliases,
  };
}

function toIndexedTitled(player: TitledPlayer): IndexedPlayer {
  return {
    key: player.name,
    name: player.name,
    title: player.title,
    born: player.born,
    died: player.died,
    note: describeTitledPlayer(player),
    source: 'titled',
    text: player.name,
    aliases: Array.from(new Set([player.name, ...nameOrders(player.name), ...player.aliases])),
    // Prominence, bounded: a title is a fact about strength, the recorded
    // Elo a fact about how much, and both order namesakes, nothing more.
    weight: Math.min(
      40,
      (player.title === 'GM' ? 20 : player.title === 'WGM' ? 12 : 6) +
        (player.peakElo > 0 ? Math.round(Math.max(0, player.peakElo - 2400) / 20) : 0),
    ),
  };
}

function buildIndex(): readonly IndexedPlayer[] {
  return LEGENDS.map(toIndexed);
}

/** The curated roster only, synchronously; what the palette had before the titled roster. */
export function searchLegends(query: string, limit = 8): readonly PlayerSearchHit[] {
  if (query.trim().length < 2) return [];
  const entries = (cache ??= buildIndex());
  const ranked: readonly RankedHit<IndexedPlayer>[] = rank(entries, query);
  return ranked.slice(0, limit).map(toHit);
}

let titledCache: Promise<readonly IndexedPlayer[]> | null = null;

/**
 * Legends and the titled roster together. The legend rows come first in the
 * index and a titled person who is also a legend is skipped by folded name,
 * so one person is one hit.
 */
export async function searchPlayerRoster(
  query: string,
  limit = 8,
): Promise<readonly PlayerSearchHit[]> {
  if (query.trim().length < 2) return [];
  const legends = (cache ??= buildIndex());
  const titled = await (titledCache ??= loadTitledRoster().then((roster) => {
    const known = new Set(legends.flatMap((legend) => legend.aliases ?? []).map(foldKey));
    return roster
      .filter((player) =>
        [player.name, ...nameOrders(player.name)].every((form) => !known.has(foldKey(form))),
      )
      .map(toIndexedTitled);
  }));
  const ranked: readonly RankedHit<IndexedPlayer>[] = rank([...legends, ...titled], query);
  return ranked.slice(0, limit).map(toHit);
}

const foldKey = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[-'’.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function toHit(ranked: RankedHit<IndexedPlayer>): PlayerSearchHit {
  const { item } = ranked;
  return item.died
    ? {
        key: item.key,
        name: item.name,
        title: item.title,
        born: item.born,
        died: item.died,
        note: item.note,
        source: item.source,
      }
    : {
        key: item.key,
        name: item.name,
        title: item.title,
        born: item.born,
        note: item.note,
        source: item.source,
      };
}

/** Test-only — clear the cached indexes so a unit test can re-seed them. */
export function __resetPlayerIndex(): void {
  cache = null;
  titledCache = null;
}
