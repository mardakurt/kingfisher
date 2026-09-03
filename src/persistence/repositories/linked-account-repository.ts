/**
 * Accounts linked for game sync.
 *
 * Deliberately thin: this store remembers *what to fetch and from where* —
 * the two sync cursors and a run's outcome — not anything about the account
 * itself. See ADR for §26-29: identity is never inferred, only stated.
 */

import type { PersistenceDatabase } from '../indexeddb/database';
import { STORE_NAMES } from '../schema/migrations';
import type { LinkedAccountRecord, SyncProvider } from '../domain';
import { assertValid, isLinkedAccountRecord } from '../validation';

export type CreateLinkedAccountInput = {
  readonly provider: SyncProvider;
  readonly username: string;
};

export interface LinkedAccountRepository {
  list(): Promise<readonly LinkedAccountRecord[]>;
  get(id: string): Promise<LinkedAccountRecord | null>;
  link(input: CreateLinkedAccountInput, now?: number): Promise<LinkedAccountRecord>;
  update(
    id: string,
    change: (current: LinkedAccountRecord) => LinkedAccountRecord,
  ): Promise<LinkedAccountRecord>;
  unlink(id: string): Promise<void>;
}

/** Stable per provider+username, so re-linking the same account resumes rather than duplicates. */
export const linkedAccountId = (provider: SyncProvider, username: string): string =>
  `${provider}:${username.trim().toLowerCase()}`;

export class LocalLinkedAccountRepository implements LinkedAccountRepository {
  constructor(private readonly database: PersistenceDatabase) {}

  async list(): Promise<readonly LinkedAccountRecord[]> {
    const rows = await this.database.getAll<unknown>(STORE_NAMES.linkedAccounts);
    return rows
      .map((row) => assertValid(row, isLinkedAccountRecord, 'linked account'))
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async get(id: string): Promise<LinkedAccountRecord | null> {
    const row = await this.database.get<unknown>(STORE_NAMES.linkedAccounts, id);
    return row === undefined ? null : assertValid(row, isLinkedAccountRecord, 'linked account');
  }

  async link(input: CreateLinkedAccountInput, now = Date.now()): Promise<LinkedAccountRecord> {
    const id = linkedAccountId(input.provider, input.username);
    const existing = await this.get(id);
    if (existing) return existing;
    const record: LinkedAccountRecord = {
      id,
      provider: input.provider,
      username: input.username.trim(),
      createdAt: now,
      importedCount: 0,
      duplicatesSkipped: 0,
    };
    await this.database.put(STORE_NAMES.linkedAccounts, record);
    return record;
  }

  async update(
    id: string,
    change: (current: LinkedAccountRecord) => LinkedAccountRecord,
  ): Promise<LinkedAccountRecord> {
    return this.database.transaction([STORE_NAMES.linkedAccounts], 'readwrite', async (tx) => {
      const raw = await tx.get<unknown>(STORE_NAMES.linkedAccounts, id);
      if (raw === undefined) throw new Error('That linked account no longer exists.');
      const current = assertValid(raw, isLinkedAccountRecord, 'linked account');
      const next = change(current);
      await tx.put(STORE_NAMES.linkedAccounts, next);
      return next;
    });
  }

  async unlink(id: string): Promise<void> {
    await this.database.delete(STORE_NAMES.linkedAccounts, id);
  }
}
