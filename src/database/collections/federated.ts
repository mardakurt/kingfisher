/**
 * One query, several collections, one result list that still knows where each
 * row came from.
 *
 * The rule that shapes the whole file: **source identity is never merged.** A
 * federated result is a list of (game, collection) pairs, not a list of games,
 * because "Carlsen – Firouzja, in Mega 2026" and "Carlsen – Firouzja, in my
 * tournament archive" are different answers to "where can I find this", and a
 * search that collapsed them would be useless the moment somebody wanted to
 * open one of them.
 *
 * The second rule: **a filter is only offered when every selected source can
 * honour it.** Silently dropping a filter one provider cannot apply produces a
 * result set that is wrong in a way nobody can see — extra games, no error, no
 * explanation. `supportedFilters` is what the UI asks before it renders a field.
 */

import type { GameSearchQuery, GameSummary } from '@/persistence/types';

import type { GameCollection, GameCollectionRef } from './types';

export interface FederatedHit {
  readonly game: GameSummary;
  readonly source: GameCollectionRef;
}

export interface FederatedResult {
  readonly hits: readonly FederatedHit[];
  /** Per-source counts, so "12 of 40 came from Mega" is answerable. */
  readonly bySource: readonly { readonly source: GameCollectionRef; readonly games: number }[];
  /** Sources that failed, named. A federated search never fails silently. */
  readonly failures: readonly { readonly source: GameCollectionRef; readonly message: string }[];
  /** True when at least one source had more to give than the limit allowed. */
  readonly truncated: boolean;
}

export interface FederatedSearchOptions {
  readonly signal?: AbortSignal;
  /** Maximum hits per source, so one huge archive cannot crowd out the others. */
  readonly perSource?: number;
  readonly sortBy?: GameSearchQuery['sortBy'];
  readonly sortDirection?: GameSearchQuery['sortDirection'];
}

const DEFAULT_PER_SOURCE = 50;

/**
 * Filter fields, and which kinds of collection can answer them.
 *
 * Both current implementations answer all of these, which is not an accident —
 * the SQLite matcher and the IndexedDB matcher were written to the same
 * vocabulary. The table exists so that the day a third source is added (a
 * remote explorer with no text search, say), the UI stops offering the field
 * rather than quietly returning a wrong answer.
 */
export const FILTER_SUPPORT: Readonly<Record<string, readonly GameCollectionRef['kind'][]>> = {
  text: ['indexeddb', 'sqlite'],
  player: ['indexeddb', 'sqlite'],
  playerColor: ['indexeddb', 'sqlite'],
  result: ['indexeddb', 'sqlite'],
  fromYear: ['indexeddb', 'sqlite'],
  toYear: ['indexeddb', 'sqlite'],
  minRating: ['indexeddb', 'sqlite'],
  eco: ['indexeddb', 'sqlite'],
  opening: ['indexeddb', 'sqlite'],
};

/** Which filters every one of these collections can honour. */
export function supportedFilters(collections: readonly GameCollection[]): readonly string[] {
  const kinds = new Set(collections.map((collection) => collection.ref.kind));
  return Object.entries(FILTER_SUPPORT)
    .filter(([, supported]) => [...kinds].every((kind) => supported.includes(kind)))
    .map(([field]) => field);
}

/**
 * Run one query across several collections.
 *
 * Sources are searched in parallel — they are independent, and a companion
 * round trip should not wait on an IndexedDB cursor — but a source that fails
 * is reported rather than thrown, because a search over four archives where
 * three answered is a useful result with a caveat, not an error.
 */
export async function federatedSearch(
  collections: readonly GameCollection[],
  query: GameSearchQuery,
  options: FederatedSearchOptions = {},
): Promise<FederatedResult> {
  const perSource = Math.max(1, options.perSource ?? DEFAULT_PER_SOURCE);
  const hits: FederatedHit[] = [];
  const bySource: { source: GameCollectionRef; games: number }[] = [];
  const failures: { source: GameCollectionRef; message: string }[] = [];
  let truncated = false;

  const pages = await Promise.all(
    collections.map(async (collection) => {
      try {
        /*
          Read one page more than the limit is not possible through this port,
          so "was there more" is inferred from the cursor: a page that came back
          full *and* left a cursor behind means the source had more to say.
        */
        const page = await collection.read(query, null, perSource);
        return { collection, page, error: null as string | null };
      } catch (error) {
        return {
          collection,
          page: null,
          error: error instanceof Error ? error.message : 'That source could not be searched.',
        };
      }
    }),
  );

  if (options.signal?.aborted) {
    return { hits: [], bySource: [], failures: [], truncated: false };
  }

  for (const { collection, page, error } of pages) {
    if (error !== null || !page) {
      failures.push({ source: collection.ref, message: error ?? 'No result.' });
      continue;
    }
    for (const transfer of page.games) {
      hits.push({
        // The transfer carries a summary without an id when it came from a
        // store that numbers its own rows; the fingerprint is the identity
        // that is meaningful across collections either way.
        game: { ...transfer.summary, id: transfer.summary.id ?? transfer.summary.fingerprint },
        source: collection.ref,
      });
    }
    bySource.push({ source: collection.ref, games: page.games.length });
    if (page.games.length >= perSource && page.nextAfter !== null) truncated = true;
  }

  hits.sort(comparator(options.sortBy ?? 'date', options.sortDirection ?? 'desc'));
  return { hits, bySource, failures, truncated };
}

function comparator(
  field: NonNullable<GameSearchQuery['sortBy']>,
  direction: NonNullable<GameSearchQuery['sortDirection']>,
): (a: FederatedHit, b: FederatedHit) => number {
  const sign = direction === 'asc' ? 1 : -1;
  return (a, b) => {
    const step = compare(a.game, b.game, field);
    // Ties broken by source name, so the order is total and a re-render never
    // shuffles two games that sort the same.
    return step !== 0 ? step * sign : a.source.name.localeCompare(b.source.name);
  };
}

function compare(a: GameSummary, b: GameSummary, field: NonNullable<GameSearchQuery['sortBy']>) {
  if (field === 'white') return a.white.localeCompare(b.white);
  if (field === 'black') return a.black.localeCompare(b.black);
  if (field === 'date') return (a.date ?? '').localeCompare(b.date ?? '');
  if (field === 'opening') {
    const label = (game: GameSummary) => game.classification?.name ?? game.opening ?? '';
    return label(a).localeCompare(label(b));
  }
  if (field === 'rating') {
    return (
      Math.max(a.whiteRating ?? 0, a.blackRating ?? 0) -
      Math.max(b.whiteRating ?? 0, b.blackRating ?? 0)
    );
  }
  return a.importedAt - b.importedAt;
}
