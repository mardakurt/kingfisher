import type { PersistenceDatabase } from '../indexeddb/database';
import { STORE_NAMES } from '../schema/migrations';
import type { DraftRecord, DraftRepository, TabDraftId } from '../types';
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

  async listTabs(): Promise<DraftRecord[]> {
    const all = await this.database.getAll<unknown>(STORE_NAMES.drafts);
    // A record that fails validation is left where it is and not offered:
    // reading it back as a tab would put corrupted work on the board.
    return all.filter((raw): raw is DraftRecord => isDraftRecord(raw) && raw.id.startsWith('tab:'));
  }

  async getTab(id: TabDraftId): Promise<DraftRecord | null> {
    const raw = await this.database.get<unknown>(STORE_NAMES.drafts, id);
    return raw === undefined ? null : assertValid(raw, isDraftRecord, 'tab draft');
  }

  async deleteTab(id: TabDraftId): Promise<void> {
    await this.database.delete(STORE_NAMES.drafts, id);
  }
}
