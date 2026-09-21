/**
 * The round journal: one entry per game played, keyed by the game's
 * fingerprint so the same game imported twice, or opened from two
 * collections, has one entry and not two.
 *
 * One shape of write, as everywhere in Kingfisher: read inside the
 * transaction, refuse if the revision moved, put the next record.
 */
import { stableId } from '../ids';
import type { PersistenceDatabase } from '../indexeddb/database';
import { STORE_NAMES } from '../schema/migrations';
import type { Color } from '@/chess/types';
import type { JournalEntryRecord } from '../domain';
import { StaleJournalWriteError } from '../domain';
import { assertValid, isJournalEntryRecord } from '../validation';

export interface JournalEntryInput {
  readonly fingerprint: string;
  readonly gameId?: string;
  readonly title: string;
  readonly event?: string;
  readonly round?: string;
  readonly date?: string;
  readonly opponent?: string;
  readonly color?: Color;
  readonly result?: string;
  readonly learningPoint: string;
}

export interface JournalRepository {
  /** Every entry, newest first. */
  list(): Promise<readonly JournalEntryRecord[]>;
  get(id: string): Promise<JournalEntryRecord | null>;
  forGame(fingerprint: string): Promise<JournalEntryRecord | null>;
  /**
   * Write the entry for a game: create it, or replace the learning point of
   * the one that exists. `expectedRevision` is the revision the caller read
   * (or `null` when it expects no entry yet); a write against a moved
   * revision is refused rather than applied over someone else's words.
   */
  write(
    input: JournalEntryInput,
    expectedRevision: number | null,
    now?: number,
  ): Promise<JournalEntryRecord>;
  delete(id: string): Promise<void>;
}

const optional = <T>(key: string, value: T | undefined) =>
  value === undefined || value === '' ? {} : { [key]: value };

export class LocalJournalRepository implements JournalRepository {
  constructor(private readonly database: PersistenceDatabase) {}

  async list(): Promise<readonly JournalEntryRecord[]> {
    const rows = await this.database.getAll<unknown>(STORE_NAMES.journal);
    return rows
      .map((row) => assertValid(row, isJournalEntryRecord, 'journal entry'))
      .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
  }

  async get(id: string): Promise<JournalEntryRecord | null> {
    const raw = await this.database.get<unknown>(STORE_NAMES.journal, id);
    return raw === undefined ? null : assertValid(raw, isJournalEntryRecord, 'journal entry');
  }

  async forGame(fingerprint: string): Promise<JournalEntryRecord | null> {
    const rows = await this.database.getAllFromIndex<unknown>(
      STORE_NAMES.journal,
      'fingerprint',
      fingerprint,
    );
    const first = rows[0];
    return first === undefined ? null : assertValid(first, isJournalEntryRecord, 'journal entry');
  }

  async write(
    input: JournalEntryInput,
    expectedRevision: number | null,
    now = Date.now(),
  ): Promise<JournalEntryRecord> {
    const learningPoint = input.learningPoint.trim();
    if (!learningPoint) throw new Error('Write the learning point first.');
    if (!input.fingerprint) throw new Error('The game has no fingerprint to file the entry under.');
    const fields = {
      ...optional('gameId', input.gameId),
      title: input.title.trim() || 'Untitled game',
      ...optional('event', input.event?.trim()),
      ...optional('round', input.round?.trim()),
      ...optional('date', input.date?.trim()),
      ...optional('opponent', input.opponent?.trim()),
      ...optional('color', input.color),
      ...optional('result', input.result?.trim()),
      learningPoint,
    };
    return this.database.transaction([STORE_NAMES.journal], 'readwrite', async (transaction) => {
      const existing = (
        await transaction.getAllFromIndex<unknown>(
          STORE_NAMES.journal,
          'fingerprint',
          input.fingerprint,
        )
      )[0];
      if (existing === undefined) {
        if (expectedRevision !== null) {
          throw new Error('That journal entry no longer exists.');
        }
        const record: JournalEntryRecord = {
          id: stableId('journal'),
          fingerprint: input.fingerprint,
          ...fields,
          createdAt: now,
          updatedAt: now,
          revision: 0,
        };
        await transaction.put(STORE_NAMES.journal, record);
        return record;
      }
      const current = assertValid(existing, isJournalEntryRecord, 'journal entry');
      if (expectedRevision === null || current.revision !== expectedRevision) {
        throw new StaleJournalWriteError(current, expectedRevision ?? -1);
      }
      const next: JournalEntryRecord = {
        id: current.id,
        fingerprint: current.fingerprint,
        ...fields,
        createdAt: current.createdAt,
        updatedAt: now,
        revision: current.revision + 1,
      };
      await transaction.put(STORE_NAMES.journal, next);
      return next;
    });
  }

  async delete(id: string): Promise<void> {
    await this.database.delete(STORE_NAMES.journal, id);
  }
}
