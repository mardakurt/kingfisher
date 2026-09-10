/**
 * Universal-search index for players.
 *
 * Two sources feed the index:
 *   1. The legends roster, which is the only way to surface players whose
 *      games are not in the open reference archive (Morphy, Capablanca, Tal,
 *      Fischer and the rest of the pre-2020 lineage);
 *   2. The user-authored databases, where the player's name appears in
 *      every imported PGN. The persistence layer already keys these by
 *      canonical player key, so the index does not deduplicate.
 *
 * Aliases are the only mechanism by which the two sources attach to the
 * same person, and they are the surface a search for "Nepo" uses to find
 * Nepomniachtchi. The aliases live in `legends.ts`; the user's own
 * spellings stay under the database key.
 */

import { LEGENDS, type Legend } from '@/reference/legends';
import { rank, type RankedHit, type Rankable } from './rank';

export interface PlayerSearchHit {
  readonly key: string;
  readonly name: string;
  readonly title: string;
  readonly born: number;
  readonly died?: number;
  readonly note: string;
  readonly source: 'legend' | 'database';
}

interface IndexedPlayer extends Rankable {
  readonly key: string;
  readonly name: string;
  readonly title: string;
  readonly born: number;
  readonly died: number | undefined;
  readonly note: string;
  readonly source: 'legend' | 'database';
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

function buildIndex(): readonly IndexedPlayer[] {
  return LEGENDS.map(toIndexed);
}

export function searchLegends(query: string, limit = 8): readonly PlayerSearchHit[] {
  if (query.trim().length < 2) return [];
  const entries = (cache ??= buildIndex());
  const ranked: readonly RankedHit<IndexedPlayer>[] = rank(entries, query);
  return ranked.slice(0, limit).map(toHit);
}

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

/** Test-only — clear the cached index so a unit test can re-seed it. */
export function __resetPlayerIndex(): void {
  cache = null;
}
