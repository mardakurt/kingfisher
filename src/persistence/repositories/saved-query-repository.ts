/**
 * Named queries (Phase 86). A query is the model in `src/database/query/`;
 * the record keeps what it last found, so a rerun after an import or a
 * reference update says which games are new and which have gone.
 *
 * The saved filters of earlier versions lived in localStorage, which no
 * backup reads: a restore brought everything back except them. They are
 * carried over into this store — which is in `PORTABLE_STORES` — the first
 * time it is listed, each as the query its fields meant.
 */
import { parseQuery, queryFromFilters, type GameQuery } from '@/database/query/ast';

import type { SavedQueryRecord } from '../domain';
import { stableId } from '../ids';
import type { PersistenceDatabase } from '../indexeddb/database';
import { STORE_NAMES } from '../schema/migrations';
import type { GameSearchQuery } from '../types';
import { assertValid, isSavedQueryRecord } from '../validation';

/** Fingerprints kept per run; beyond this a diff is reported as partial. */
export const SAVED_RUN_FINGERPRINTS = 20_000;

const LEGACY_KEY = 'kingfisher.saved-database-filters.v1';
const CARRIED_KEY = 'kingfisher.saved-queries-carried.v1';

export interface QueryRunDiff {
  /** Games found now that the previous run did not find. */
  readonly added: readonly string[];
  /** Games the previous run found that this one does not. */
  readonly removed: readonly string[];
  /** False when either run kept only part of its fingerprints. */
  readonly complete: boolean;
  /** When the previous run was; null for a first run. */
  readonly since: number | null;
}

export interface SavedQueryRepository {
  list(): Promise<readonly SavedQueryRecord[]>;
  get(id: string): Promise<SavedQueryRecord | null>;
  save(
    input: {
      readonly id?: string;
      readonly name: string;
      readonly query: GameQuery;
      readonly source: string;
    },
    now?: number,
  ): Promise<SavedQueryRecord>;
  recordRun(
    id: string,
    run: {
      readonly selected: number;
      readonly found: number;
      readonly fingerprints: readonly string[];
    },
    now?: number,
  ): Promise<{ readonly record: SavedQueryRecord; readonly diff: QueryRunDiff }>;
  remove(id: string): Promise<void>;
}

export function diffRuns(
  previous: SavedQueryRecord['lastRun'],
  next: { readonly fingerprints: readonly string[]; readonly complete: boolean },
): QueryRunDiff {
  if (!previous)
    return { added: [...next.fingerprints], removed: [], complete: next.complete, since: null };
  const before = new Set(previous.fingerprints);
  const after = new Set(next.fingerprints);
  return {
    added: next.fingerprints.filter((entry) => !before.has(entry)),
    removed: previous.fingerprints.filter((entry) => !after.has(entry)),
    complete: previous.complete && next.complete,
    since: previous.at,
  };
}

export class LocalSavedQueryRepository implements SavedQueryRepository {
  constructor(private readonly database: PersistenceDatabase) {}

  async list(): Promise<readonly SavedQueryRecord[]> {
    await this.carryLegacyFilters();
    const rows = await this.database.getAll<unknown>(STORE_NAMES.savedQueries);
    return rows
      .map((row) => assertValid(row, isSavedQueryRecord, 'saved query'))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(id: string): Promise<SavedQueryRecord | null> {
    const row = await this.database.get<unknown>(STORE_NAMES.savedQueries, id);
    return row ? assertValid(row, isSavedQueryRecord, 'saved query') : null;
  }

  async save(
    input: {
      readonly id?: string;
      readonly name: string;
      readonly query: GameQuery;
      readonly source: string;
    },
    now = Date.now(),
  ): Promise<SavedQueryRecord> {
    const parsed = parseQuery(input.query);
    if (!parsed.ok) throw new Error(`The query cannot be saved: ${parsed.error}`);
    const name = input.name.trim();
    if (!name) throw new Error('A saved query needs a name.');
    return this.database.transaction(
      [STORE_NAMES.savedQueries],
      'readwrite',
      async (transaction) => {
        const existing = input.id
          ? await transaction.get<SavedQueryRecord>(STORE_NAMES.savedQueries, input.id)
          : null;
        const sameQuery =
          existing && JSON.stringify(existing.query) === JSON.stringify(parsed.query);
        const record: SavedQueryRecord = {
          id: existing?.id ?? stableId('query'),
          name,
          query: parsed.query,
          source: input.source,
          // A changed query's last run described a different question.
          ...(existing?.lastRun && sameQuery && existing.source === input.source
            ? { lastRun: existing.lastRun }
            : {}),
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          revision: (existing?.revision ?? -1) + 1,
        };
        assertValid(record, isSavedQueryRecord, 'saved query');
        await transaction.put(STORE_NAMES.savedQueries, record);
        return record;
      },
    );
  }

  async recordRun(
    id: string,
    run: {
      readonly selected: number;
      readonly found: number;
      readonly fingerprints: readonly string[];
    },
    now = Date.now(),
  ): Promise<{ readonly record: SavedQueryRecord; readonly diff: QueryRunDiff }> {
    return this.database.transaction(
      [STORE_NAMES.savedQueries],
      'readwrite',
      async (transaction) => {
        const existing = await transaction.get<SavedQueryRecord>(STORE_NAMES.savedQueries, id);
        if (!existing) throw new Error('That saved query no longer exists.');
        const kept = [...new Set(run.fingerprints)].sort().slice(0, SAVED_RUN_FINGERPRINTS);
        const lastRun = {
          at: now,
          selected: run.selected,
          found: run.found,
          fingerprints: kept,
          complete: kept.length === run.found,
        };
        const diff = diffRuns(existing.lastRun, lastRun);
        const record: SavedQueryRecord = {
          ...existing,
          lastRun,
          updatedAt: now,
          revision: existing.revision + 1,
        };
        assertValid(record, isSavedQueryRecord, 'saved query');
        await transaction.put(STORE_NAMES.savedQueries, record);
        return { record, diff };
      },
    );
  }

  async remove(id: string): Promise<void> {
    await this.database.delete(STORE_NAMES.savedQueries, id);
  }

  /** Once per browser profile; a read that fails leaves them where they were. */
  private async carryLegacyFilters(): Promise<void> {
    let legacy: unknown;
    try {
      if (typeof localStorage === 'undefined' || localStorage.getItem(CARRIED_KEY)) return;
      legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? '[]');
    } catch {
      return;
    }
    const entries = Array.isArray(legacy) ? legacy : [];
    for (const entry of entries) {
      if (
        typeof entry !== 'object' ||
        entry === null ||
        typeof (entry as { name?: unknown }).name !== 'string' ||
        typeof (entry as { filters?: unknown }).filters !== 'object'
      ) {
        continue;
      }
      const { name, filters, usedAt } = entry as {
        name: string;
        filters: Omit<GameSearchQuery, 'limit' | 'offset'>;
        usedAt?: number;
      };
      const query = queryFromFilters(filters);
      if (!parseQuery(query).ok || !name.trim()) continue;
      await this.save(
        { name, query, source: 'local' },
        typeof usedAt === 'number' ? usedAt : Date.now(),
      );
    }
    try {
      localStorage.setItem(CARRIED_KEY, String(Date.now()));
    } catch {
      // Blocked storage: they are carried again next time, which saves nothing twice by name.
    }
  }
}
