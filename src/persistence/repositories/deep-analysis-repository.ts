/**
 * Deep analyses saved as they run (Phase 85). A run is one record, rewritten
 * after every position it searches; the newest record is the one the engine
 * panel shows and the one resumed after a reload, a sleep or a quit.
 */
import { stableId } from '../ids';
import type { PersistenceDatabase } from '../indexeddb/database';
import { STORE_NAMES } from '../schema/migrations';
import type { DeepAnalysisJobRecord } from '../domain';
import { assertValid, isDeepAnalysisJobRecord } from '../validation';

export type DeepAnalysisJobInput = Omit<
  DeepAnalysisJobRecord,
  'id' | 'createdAt' | 'updatedAt' | 'revision'
>;

export interface DeepAnalysisRepository {
  /** The newest run, or null. */
  list(): Promise<readonly DeepAnalysisJobRecord[]>;
  latest(): Promise<DeepAnalysisJobRecord | null>;
  create(input: DeepAnalysisJobInput, now?: number): Promise<DeepAnalysisJobRecord>;
  /** Write the run's next state over its record. */
  update(
    id: string,
    patch: Partial<DeepAnalysisJobInput>,
    now?: number,
  ): Promise<DeepAnalysisJobRecord>;
  delete(id: string): Promise<void>;
}

export class LocalDeepAnalysisRepository implements DeepAnalysisRepository {
  constructor(private readonly database: PersistenceDatabase) {}

  /** Every deep analysis kept, newest first (Phase 86: the jobs view). */
  async list(): Promise<readonly DeepAnalysisJobRecord[]> {
    const rows = await this.database.getAll<unknown>(STORE_NAMES.deepAnalysisJobs);
    return rows
      .map((row) => assertValid(row, isDeepAnalysisJobRecord, 'deep analysis'))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async latest(): Promise<DeepAnalysisJobRecord | null> {
    const rows = await this.database.getAll<unknown>(STORE_NAMES.deepAnalysisJobs);
    const valid = rows
      .map((row) => assertValid(row, isDeepAnalysisJobRecord, 'deep analysis'))
      .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
    return valid[0] ?? null;
  }

  async create(input: DeepAnalysisJobInput, now = Date.now()): Promise<DeepAnalysisJobRecord> {
    const record: DeepAnalysisJobRecord = {
      ...input,
      id: stableId('deep'),
      createdAt: now,
      updatedAt: now,
      revision: 0,
    };
    assertValid(record, isDeepAnalysisJobRecord, 'deep analysis');
    await this.database.put(STORE_NAMES.deepAnalysisJobs, record);
    return record;
  }

  async update(
    id: string,
    patch: Partial<DeepAnalysisJobInput>,
    now = Date.now(),
  ): Promise<DeepAnalysisJobRecord> {
    return this.database.transaction(
      [STORE_NAMES.deepAnalysisJobs],
      'readwrite',
      async (transaction) => {
        const raw = await transaction.get<unknown>(STORE_NAMES.deepAnalysisJobs, id);
        if (raw === undefined) throw new Error('That deep analysis is no longer saved.');
        const current = assertValid(raw, isDeepAnalysisJobRecord, 'deep analysis');
        const next: DeepAnalysisJobRecord = {
          ...current,
          ...patch,
          id: current.id,
          createdAt: current.createdAt,
          updatedAt: now,
          revision: current.revision + 1,
        };
        assertValid(next, isDeepAnalysisJobRecord, 'deep analysis');
        await transaction.put(STORE_NAMES.deepAnalysisJobs, next);
        return next;
      },
    );
  }

  async delete(id: string): Promise<void> {
    await this.database.delete(STORE_NAMES.deepAnalysisJobs, id);
  }
}
