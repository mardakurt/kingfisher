import type { GameSearchQuery } from '@/persistence/types';

export interface ResearchFilter {
  readonly id: string;
  readonly name: string;
  readonly source: 'local-collection';
  readonly filters: Omit<GameSearchQuery, 'limit' | 'offset'>;
  readonly usedAt: number;
}

/*
  Saved filters lived under `kingfisher.saved-database-filters.v1` until Phase
  86; they are carried into the saved-query store (saved-query-repository.ts),
  which backups include. Only the recent list, a convenience, stays here.
*/
const RECENT_KEY = 'kingfisher.recent-database-filters.v1';

/*
  Guarded on `localStorage` rather than on `window`, and wrapped: the store is
  absent during server rendering and *throws* when a browser is configured to
  block site data. A filter shortcut is a convenience, so failing to read or
  write one must never be the reason a research view does not render.
*/
const read = (key: string): ResearchFilter[] => {
  try {
    if (typeof localStorage === 'undefined') return [];
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(value) ? value.filter(isResearchFilter) : [];
  } catch {
    return [];
  }
};

const write = (key: string, values: readonly ResearchFilter[]) => {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(values));
  } catch {
    // Storage is full or blocked; the in-memory list the caller got still works.
  }
};

export const recentResearchFilters = () => read(RECENT_KEY);

/**
 * A readable name for a filter set the user never named.
 *
 * Recent filters are only worth offering if the user can recognise them, so
 * this describes what the filter actually selects rather than numbering it.
 */
export function describeResearchFilter(filters: ResearchFilter['filters']): string {
  const parts = [
    filters.player?.trim(),
    filters.playerColor === 'w' ? 'as White' : filters.playerColor === 'b' ? 'as Black' : null,
    filters.text?.trim(),
    filters.eco?.trim(),
    filters.minRating ? `${filters.minRating}+` : null,
    filters.fromYear ? `since ${filters.fromYear}` : null,
    filters.result ?? null,
  ].filter((part): part is string => Boolean(part));
  return parts.join(' · ');
}

/** Identity of an unnamed filter set, so repeating one search does not stack up. */
const signature = (filters: ResearchFilter['filters']): string => {
  const source = JSON.stringify([
    filters.text ?? '',
    filters.player ?? '',
    filters.playerColor ?? '',
    filters.result ?? '',
    filters.minRating ?? 0,
    filters.fromYear ?? 0,
    filters.eco ?? '',
    filters.sortBy ?? '',
    filters.sortDirection ?? '',
  ]);
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
};

/** Record a filter set the user actually searched with, named after its contents. */
export function rememberUsedFilters(filters: ResearchFilter['filters']): ResearchFilter[] {
  const name = describeResearchFilter(filters);
  if (!name) return read(RECENT_KEY);
  return rememberResearchFilter({
    id: `recent-${signature(filters)}`,
    name,
    source: 'local-collection',
    filters,
    usedAt: Date.now(),
  });
}

export function rememberResearchFilter(filter: ResearchFilter): ResearchFilter[] {
  const next = [
    { ...filter, usedAt: Date.now() },
    ...read(RECENT_KEY).filter((entry) => entry.id !== filter.id),
  ].slice(0, 5);
  write(RECENT_KEY, next);
  return next;
}

function isResearchFilter(value: unknown): value is ResearchFilter {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ResearchFilter>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    candidate.source === 'local-collection' &&
    Boolean(candidate.filters) &&
    typeof candidate.usedAt === 'number'
  );
}
