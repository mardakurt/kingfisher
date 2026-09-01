import type { PersistenceDatabase } from '../indexeddb/database';
import { STORE_NAMES } from '../schema/migrations';
import type { DraftRecord, DraftRepository } from '../types';
import { assertValid, isDraftRecord } from '../validation';

export class LocalDraftRepository implements DraftRepository {
  constructor(private readonly database: PersistenceDatabase) {}

  async get(): Promise<DraftRecord | null> {
    const raw = await this.database.get<unknown>(STORE_NAMES.drafts, 'active');
    return raw === undefined ? null : assertValid(raw, isDraftRecord, 'analysis draft');
  }

  async save(draft: DraftRecord): Promise<void> {
    assertValid(draft, isDraftRecord, 'analysis draft');
    await this.database.put(STORE_NAMES.drafts, draft);
  }

  async clear(): Promise<void> {
    await this.database.delete(STORE_NAMES.drafts, 'active');
  }
}
