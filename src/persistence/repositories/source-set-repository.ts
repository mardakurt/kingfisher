/**
 * Named sets of collections to search together.
 *
 * The smallest repository in the application, and deliberately so: a source set
 * is a name and a list of ids. Everything expensive about "search my reference
 * databases" is in the collections themselves; this only remembers which ones
 * the user means by that phrase.
 */

import { stableId } from '../ids';
import type { PersistenceDatabase } from '../indexeddb/database';
import { STORE_NAMES } from '../schema/migrations';
import type { SourceSetRecord } from '../domain';
import { assertValid, isSourceSetRecord } from '../validation';

export interface SourceSetInput {
  readonly name: string;
  readonly collectionIds: readonly string[];
  readonly filters?: SourceSetRecord['filters'];
}

export interface SourceSetRepository {
  list(): Promise<readonly SourceSetRecord[]>;
  get(id: string): Promise<SourceSetRecord | null>;
  create(input: SourceSetInput, now?: number): Promise<SourceSetRecord>;
  update(id: string, change: Partial<SourceSetInput>, now?: number): Promise<SourceSetRecord>;
  delete(id: string): Promise<void>;
}

export class LocalSourceSetRepository implements SourceSetRepository {
  constructor(private readonly database: PersistenceDatabase) {}

  async list(): Promise<readonly SourceSetRecord[]> {
    const records = await this.database.getAll<unknown>(STORE_NAMES.sourceSets);
    return records
      .map((record) => assertValid(record, isSourceSetRecord, 'source set'))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(id: string): Promise<SourceSetRecord | null> {
    const record = await this.database.get<unknown>(STORE_NAMES.sourceSets, id);
    return record === undefined ? null : assertValid(record, isSourceSetRecord, 'source set');
  }

  async create(input: SourceSetInput, now = Date.now()): Promise<SourceSetRecord> {
    const name = input.name.trim();
    if (!name) throw new Error('A source set needs a name.');
    const record: SourceSetRecord = {
      id: stableId('source-set'),
      name,
      // Deduplicated on the way in: a set listing one collection twice would
      // search it twice and count its games twice.
      collectionIds: [...new Set(input.collectionIds)],
      ...(input.filters ? { filters: input.filters } : {}),
      createdAt: now,
      updatedAt: now,
    };
    await this.database.put(STORE_NAMES.sourceSets, record);
    return record;
  }

  async update(
    id: string,
    change: Partial<SourceSetInput>,
    now = Date.now(),
  ): Promise<SourceSetRecord> {
    const current = await this.get(id);
    if (!current) throw new Error('That source set no longer exists.');
    const next: SourceSetRecord = {
      ...current,
      ...(change.name !== undefined ? { name: change.name.trim() || current.name } : {}),
      ...(change.collectionIds ? { collectionIds: [...new Set(change.collectionIds)] } : {}),
      ...(change.filters !== undefined ? { filters: change.filters } : {}),
      updatedAt: now,
    };
    await this.database.put(STORE_NAMES.sourceSets, next);
    return next;
  }

  async delete(id: string): Promise<void> {
    await this.database.delete(STORE_NAMES.sourceSets, id);
  }
}
