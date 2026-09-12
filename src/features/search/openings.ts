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
import { normalize, rank, type RankedHit, type Rankable } from './rank';

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
  return loadOpeningCatalog().then((entries) => {
    /*
      Prominence, from the dataset itself: how many entries it names beneath
      this one ("Sicilian Defense: Najdorf Variation" has dozens; "Benoni
      Defense: Taimanov Variation" has itself). Nothing here is a judgement
      about theory — it is a count of what the classification records, used
      only to order ties, and bounded to a fraction of one ranking band.
    */
    const beneath = new Map<string, number>();
    for (const entry of entries) {
      let prefix = '';
      for (const clause of entry.label.split(/[:,]\s*/)) {
        prefix = prefix ? `${prefix}|${clause}` : clause;
        beneath.set(prefix, (beneath.get(prefix) ?? 0) + 1);
      }
    }
    return entries.map((entry) => {
      const clauses = entry.label.split(/[:,]\s*/);
      const lines = beneath.get(clauses.join('|')) ?? 1;
      // More named lines beneath: more prominent. More clauses: more specific,
      // and a bare "Najdorf" means the variation, not its deepest sub-line.
      const weight = Math.min(40, Math.round(6 * Math.log2(lines))) - 4 * (clauses.length - 1);
      return toIndexed(entry, Math.max(-40, weight));
    });
  });
}

function toIndexed(entry: OpeningEntry, weight: number): IndexedOpening {
  const spellings = [entry.label, entry.name, familyOf(entry.name)].flatMap(alternateSpellings);
  return {
    id: entry.key,
    eco: entry.eco,
    name: entry.name,
    variation: entry.variation ?? '',
    label: entry.label,
    plies: entry.plies,
    moves: entry.moves,
    text: entry.label,
    aliases: [entry.eco, entry.name, familyOf(entry.name), ...spellings],
    weight,
    qualifiers: QUALIFIERS.filter((word) => new RegExp(`\\b${word}\\b`, 'i').test(entry.label)),
  };
}

/**
 * Words that turn a name into its opposite: the Anti-Sveshnikov is the line
 * that avoids the Sveshnikov, the Reversed Dragon is an English, not a
 * Sicilian. A query that does not say them is not asking for them.
 */
const QUALIFIERS = ['anti', 'reversed', 'neo'] as const;

/** The first colon-separated clause — "Sicilian Defense" out of "Sicilian Defense: Najdorf". */
function familyOf(name: string): string {
  const colon = name.indexOf(':');
  return colon === -1 ? name : name.slice(0, colon);
}

/**
 * Spellings a person types that the dataset does not: the German
 * transliteration of an umlaut ("Gruenfeld") — the plain "Grunfeld" already
 * matches once diacritics are folded.
 */
function alternateSpellings(value: string): readonly string[] {
  if (!/[äöüÄÖÜ]/.test(value)) return [];
  return [
    value
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/Ä/g, 'Ae')
      .replace(/Ö/g, 'Oe')
      .replace(/Ü/g, 'Ue'),
  ];
}

/**
 * Abbreviations a chess player uses for an opening, each written down once
 * and checked against the dataset's own name for it. Short, exact-match
 * only, and deliberately not a guesser: "KG" could be the King's Gambit or
 * the Kieninger Gambit, so it is not here.
 */
export const OPENING_ABBREVIATIONS: Readonly<Record<string, string>> = {
  qgd: "Queen's Gambit Declined",
  qga: "Queen's Gambit Accepted",
  qg: "Queen's Gambit",
  kid: "King's Indian Defense",
  kia: "King's Indian Attack",
  qid: "Queen's Indian Defense",
  nid: 'Nimzo-Indian Defense',
  nimzo: 'Nimzo-Indian Defense',
  bogo: 'Bogo-Indian Defense',
  petroff: "Petrov's Defense",
  'caro kann': 'Caro-Kann Defense',
  'semi slav': 'Semi-Slav Defense',
  'fischer-sozin': 'Sicilian Defense: Sozin Attack',
  'fischer sozin': 'Sicilian Defense: Sozin Attack',
  archangel: 'Ruy Lopez: Morphy Defense, Arkhangelsk Variation',
  'anti berlin': 'Ruy Lopez: Berlin Defense, Anti-Berlin',
  ruy: 'Ruy Lopez',
  spanish: 'Ruy Lopez',
  lopez: 'Ruy Lopez',
};

/**
 * What a person typed, as the dataset would spell it. British "Defence" and
 * "Centre" become the dataset's American forms, and a known abbreviation
 * becomes the name it stands for. Applied to the query only; the index
 * keeps the dataset's spelling for display.
 */
export function expandOpeningQuery(query: string): string {
  const folded = normalize(query);
  const abbreviation = OPENING_ABBREVIATIONS[folded];
  if (abbreviation) return abbreviation;
  return folded.replace(/\bdefence\b/g, 'defense').replace(/\bcentre\b/g, 'center');
}

export async function searchOpenings(
  query: string,
  limit = 8,
): Promise<readonly OpeningSearchHit[]> {
  if (query.trim().length < 2) return [];
  const entries = await (cache ??= buildIndex());
  const ranked: readonly RankedHit<IndexedOpening>[] = rank(entries, expandOpeningQuery(query));
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
