/**
 * Named groups of training items.
 *
 * A set is membership, never a copy. A static set holds item ids; a dynamic
 * set holds the query that decides membership when it is opened. Duplicating
 * a training item into a set would fork its schedule and its review history,
 * and a spaced-repetition system whose cards exist twice is a system that
 * teaches nothing on either copy.
 *
 * Resolution is deliberately here rather than in a component: "which items are
 * in this set" is one question with one answer, and the review workspace, the
 * training queue and the improvement report all need the same one.
 */

import { stableId } from '../ids';
import type { PersistenceDatabase } from '../indexeddb/database';
import { STORE_NAMES } from '../schema/migrations';
import type { TrainingItemRecord, TrainingSetQuery, TrainingSetRecord } from '../domain';
import { StaleTrainingSetWriteError } from '../domain';
import { assertValid, isTrainingItemRecord, isTrainingSetRecord } from '../validation';

export interface CreateTrainingSetInput {
  readonly name: string;
  readonly kind: 'static' | 'dynamic';
  readonly itemIds?: readonly string[];
  readonly query?: TrainingSetQuery;
}

export interface TrainingSetRepository {
  list(): Promise<readonly TrainingSetRecord[]>;
  get(id: string): Promise<TrainingSetRecord | null>;
  create(input: CreateTrainingSetInput, now?: number): Promise<TrainingSetRecord>;
  rename(id: string, expectedRevision: number, name: string): Promise<TrainingSetRecord>;
  /** Static sets only; adding to a dynamic set is a query change, not a member. */
  addItems(
    id: string,
    expectedRevision: number,
    itemIds: readonly string[],
  ): Promise<TrainingSetRecord>;
  removeItem(id: string, expectedRevision: number, itemId: string): Promise<TrainingSetRecord>;
  setQuery(
    id: string,
    expectedRevision: number,
    query: TrainingSetQuery,
  ): Promise<TrainingSetRecord>;
  delete(id: string): Promise<void>;
  /** The items this set currently contains, in the order the queue wants them. */
  resolve(id: string, now?: number): Promise<readonly TrainingItemRecord[]>;
  /** Every set an item belongs to, for the item's own detail panel. */
  setsForItem(itemId: string): Promise<readonly TrainingSetRecord[]>;
}

export class LocalTrainingSetRepository implements TrainingSetRepository {
  constructor(private readonly database: PersistenceDatabase) {}

  async list(): Promise<readonly TrainingSetRecord[]> {
    const rows = await this.database.getAll<unknown>(STORE_NAMES.trainingSets);
    return rows
      .map((row) => assertValid(row, isTrainingSetRecord, 'training set'))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(id: string): Promise<TrainingSetRecord | null> {
    const raw = await this.database.get<unknown>(STORE_NAMES.trainingSets, id);
    return raw === undefined ? null : assertValid(raw, isTrainingSetRecord, 'training set');
  }

  async create(input: CreateTrainingSetInput, now = Date.now()): Promise<TrainingSetRecord> {
    const name = input.name.trim();
    if (!name) throw new Error('A training set needs a name.');
    return this.database.transaction(
      [STORE_NAMES.trainingSets],
      'readwrite',
      async (transaction) => {
        // The name index is unique, so a clash would throw from IndexedDB with
        // a message about a constraint. Say the chess thing instead.
        const clash = await transaction.getAllFromIndex<unknown>(
          STORE_NAMES.trainingSets,
          'name',
          name,
        );
        if (clash.length > 0) throw new Error(`A training set called “${name}” already exists.`);
        const record: TrainingSetRecord = {
          id: stableId('set'),
          name,
          kind: input.kind,
          itemIds: input.kind === 'static' ? dedupe(input.itemIds ?? []) : [],
          ...(input.kind === 'dynamic' ? { query: input.query ?? {} } : {}),
          createdAt: now,
          updatedAt: now,
          revision: 0,
        };
        await transaction.put(STORE_NAMES.trainingSets, record);
        return record;
      },
    );
  }

  rename(id: string, expectedRevision: number, name: string): Promise<TrainingSetRecord> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('A training set needs a name.');
    return this.write(id, expectedRevision, (current) => ({ ...current, name: trimmed }));
  }

  addItems(
    id: string,
    expectedRevision: number,
    itemIds: readonly string[],
  ): Promise<TrainingSetRecord> {
    return this.write(id, expectedRevision, (current) => {
      if (current.kind !== 'static') {
        throw new Error('A dynamic set decides its own membership; edit its filters instead.');
      }
      return { ...current, itemIds: dedupe([...current.itemIds, ...itemIds]) };
    });
  }

  removeItem(id: string, expectedRevision: number, itemId: string): Promise<TrainingSetRecord> {
    return this.write(id, expectedRevision, (current) => ({
      ...current,
      itemIds: current.itemIds.filter((member) => member !== itemId),
    }));
  }

  setQuery(
    id: string,
    expectedRevision: number,
    query: TrainingSetQuery,
  ): Promise<TrainingSetRecord> {
    return this.write(id, expectedRevision, (current) => {
      if (current.kind !== 'dynamic') {
        throw new Error('A static set holds chosen items; add or remove them instead.');
      }
      return { ...current, query };
    });
  }

  async delete(id: string): Promise<void> {
    // Only the grouping goes. The items are the user's work and stay.
    await this.database.delete(STORE_NAMES.trainingSets, id);
  }

  async resolve(id: string, now = Date.now()): Promise<readonly TrainingItemRecord[]> {
    const set = await this.get(id);
    if (!set) return [];
    if (set.kind === 'static') {
      const items = await Promise.all(
        set.itemIds.map((itemId) => this.database.get<unknown>(STORE_NAMES.trainingItems, itemId)),
      );
      return items
        .filter((row): row is unknown => row !== undefined)
        .map((row) => assertValid(row, isTrainingItemRecord, 'training item'))
        .sort((a, b) => a.schedule.dueAt - b.schedule.dueAt);
    }
    const all = await this.database.getAll<unknown>(STORE_NAMES.trainingItems);
    const items = all.map((row) => assertValid(row, isTrainingItemRecord, 'training item'));
    return items
      .filter((item) => matchesQuery(item, set.query ?? {}, now))
      .sort((a, b) => a.schedule.dueAt - b.schedule.dueAt);
  }

  async setsForItem(itemId: string): Promise<readonly TrainingSetRecord[]> {
    const sets = await this.list();
    const matching: TrainingSetRecord[] = [];
    for (const set of sets) {
      if (set.kind === 'static') {
        if (set.itemIds.includes(itemId)) matching.push(set);
        continue;
      }
      const resolved = await this.resolve(set.id);
      if (resolved.some((item) => item.id === itemId)) matching.push(set);
    }
    return matching;
  }

  private write(
    id: string,
    expectedRevision: number,
    change: (current: TrainingSetRecord) => TrainingSetRecord,
  ): Promise<TrainingSetRecord> {
    return this.database.transaction(
      [STORE_NAMES.trainingSets],
      'readwrite',
      async (transaction) => {
        const raw = await transaction.get<unknown>(STORE_NAMES.trainingSets, id);
        if (raw === undefined) throw new Error('That training set no longer exists.');
        const current = assertValid(raw, isTrainingSetRecord, 'training set');
        if (current.revision !== expectedRevision) {
          throw new StaleTrainingSetWriteError(current, expectedRevision);
        }
        const next: TrainingSetRecord = {
          ...change(current),
          updatedAt: Date.now(),
          revision: current.revision + 1,
        };
        await transaction.put(STORE_NAMES.trainingSets, next);
        return next;
      },
    );
  }
}

/**
 * Whether one item belongs to a dynamic set.
 *
 * Pure and exported, because this is the definition of a dynamic set's
 * membership and it deserves a test of its own rather than being discovered by
 * poking the UI. Every present field narrows; an empty query matches
 * everything, which is what an unconfigured dynamic set should do.
 */
export function matchesQuery(
  item: TrainingItemRecord,
  query: TrainingSetQuery,
  now = Date.now(),
): boolean {
  if (query.themes?.length) {
    const tags = new Set(item.tags);
    if (!query.themes.some((theme) => tags.has(theme))) return false;
  }
  if (query.tags?.length) {
    const tags = new Set(item.tags);
    if (!query.tags.every((tag) => tags.has(tag))) return false;
  }
  if (query.modes?.length && !query.modes.includes(item.mode)) return false;
  if (query.withinDays !== undefined) {
    const cutoff = now - query.withinDays * 86_400_000;
    if (item.createdAt < cutoff) return false;
  }
  if (query.fromMyGames && item.source?.kind !== 'game') return false;
  return true;
}

const dedupe = (values: readonly string[]): readonly string[] => [...new Set(values)];
