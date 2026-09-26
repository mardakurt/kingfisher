/**
 * Decisions on repertoire-inbox items (Phase 86). The items are derived from
 * the repertoire and the evidence each time the inbox is read; what a person
 * decided about one — accepted, dismissed with a reason, snoozed until a
 * date — is authored work and is kept here, in a portable store.
 */
import type { InboxDecisionRecord, InboxStatus } from '../domain';
import type { PersistenceDatabase } from '../indexeddb/database';
import { STORE_NAMES } from '../schema/migrations';
import { assertValid, isInboxDecisionRecord } from '../validation';

export interface InboxDecisionRepository {
  forRepertoire(repertoireId: string): Promise<readonly InboxDecisionRecord[]>;
  decide(
    input: {
      readonly id: string;
      readonly repertoireId: string;
      readonly status: InboxStatus;
      readonly evidence: string;
      readonly reason?: string;
      readonly snoozedUntil?: number;
    },
    now?: number,
  ): Promise<InboxDecisionRecord>;
  /** Undo a decision: the item is open again. */
  reopen(id: string): Promise<void>;
}

export class LocalInboxDecisionRepository implements InboxDecisionRepository {
  constructor(private readonly database: PersistenceDatabase) {}

  async forRepertoire(repertoireId: string): Promise<readonly InboxDecisionRecord[]> {
    const rows = await this.database.getAllFromIndex<unknown>(
      STORE_NAMES.inboxDecisions,
      'repertoireId',
      repertoireId,
    );
    return rows.map((row) => assertValid(row, isInboxDecisionRecord, 'inbox decision'));
  }

  async decide(
    input: {
      readonly id: string;
      readonly repertoireId: string;
      readonly status: InboxStatus;
      readonly evidence: string;
      readonly reason?: string;
      readonly snoozedUntil?: number;
    },
    now = Date.now(),
  ): Promise<InboxDecisionRecord> {
    if (input.status === 'dismissed' && !input.reason?.trim()) {
      throw new Error('Say why it is dismissed; the reason is what makes it reviewable later.');
    }
    if (input.status === 'snoozed' && !(input.snoozedUntil && input.snoozedUntil > now)) {
      throw new Error('A snooze needs a date in the future.');
    }
    return this.database.transaction(
      [STORE_NAMES.inboxDecisions],
      'readwrite',
      async (transaction) => {
        const existing = await transaction.get<InboxDecisionRecord>(
          STORE_NAMES.inboxDecisions,
          input.id,
        );
        const record: InboxDecisionRecord = {
          id: input.id,
          repertoireId: input.repertoireId,
          status: input.status,
          ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
          ...(input.status === 'snoozed' ? { snoozedUntil: input.snoozedUntil } : {}),
          evidence: input.evidence,
          decidedAt: now,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          revision: (existing?.revision ?? -1) + 1,
        };
        assertValid(record, isInboxDecisionRecord, 'inbox decision');
        await transaction.put(STORE_NAMES.inboxDecisions, record);
        return record;
      },
    );
  }

  async reopen(id: string): Promise<void> {
    await this.database.delete(STORE_NAMES.inboxDecisions, id);
  }
}
