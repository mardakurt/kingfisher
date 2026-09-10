/**
 * Universal-search index for openings.
 *
 * The full opening index is large: ~3,800 positions, ~12,000 unique labels.
 * The search index is small because we only keep what a query can match:
 * the searchable string and the ECO. Everything else (the position FEN, the
 * SAN line) is fetched lazily when the user actually opens the result, so
 * the index stays under 250 KB and is built once.
 *
 * Why a custom index rather than calling `loadOpeningCatalog`:
 *   - the catalog is sorted by ECO, not by name — a search for "Najdorf"
 *     would walk through all of A00 first;
 *   - we want to match family, variation and ECO with one pass;
 *   - the catalog is a Promise and re-fetches on every consumer.
 */

import { loadOpeningCatalog, type OpeningEntry } from '@/theory/opening-catalog';
import { rank, type RankedHit, type Rankable } from './rank';

export interface OpeningSearchHit {
  readonly id: string;
  readonly eco: string;
  readonly name: string;
  readonly variation?: string;
  readonly label: string;
  readonly plies: number;
  /** The shortest SAN line the dataset records for this entry. */
  readonly moves: readonly string[];
}

interface IndexedOpening extends Rankable {
  readonly id: string;
  readonly eco: string;
  readonly name: string;
  readonly variation: string;
  readonly label: string;
  readonly plies: number;
  readonly moves: readonly string[];
}

let cache: Promise<readonly IndexedOpening[]> | null = null;

function buildIndex(): Promise<readonly IndexedOpening[]> {
  return loadOpeningCatalog().then((entries) => entries.map(toIndexed));
}

function toIndexed(entry: OpeningEntry): IndexedOpening {
  return {
    id: entry.key,
    eco: entry.eco,
    name: entry.name,
    variation: entry.variation ?? '',
    label: entry.label,
    plies: entry.plies,
    moves: entry.moves,
    text: entry.label,
    aliases: [entry.eco, entry.name, familyOf(entry.name)],
  };
}

/** The first colon-separated clause — "Sicilian Defense" out of "Sicilian Defense: Najdorf". */
function familyOf(name: string): string {
  const colon = name.indexOf(':');
  return colon === -1 ? name : name.slice(0, colon);
}

export async function searchOpenings(
  query: string,
  limit = 8,
): Promise<readonly OpeningSearchHit[]> {
  if (query.trim().length < 2) return [];
  const entries = await (cache ??= buildIndex());
  const ranked: readonly RankedHit<IndexedOpening>[] = rank(entries, query);
  return ranked.slice(0, limit).map(toHit);
}

function toHit(ranked: RankedHit<IndexedOpening>): OpeningSearchHit {
  const { item } = ranked;
  const hit: OpeningSearchHit = {
    id: item.id,
    eco: item.eco,
    name: item.name,
    label: item.label,
    plies: item.plies,
    moves: item.moves,
  };
  return item.variation ? { ...hit, variation: item.variation } : hit;
}

/**
 * Look up an opening by position key.
 *
 * The catalog already keeps a position key, so this is a constant-time
 * read; the only reason it is async is to share the catalog Promise with
 * the rest of the search module.
 */
export async function openingForKey(key: string): Promise<OpeningSearchHit | null> {
  const entries = await (cache ??= buildIndex());
  const match = entries.find((entry) => entry.id === key);
  return match ? toHit({ item: match, score: 1, why: 'exact' }) : null;
}
