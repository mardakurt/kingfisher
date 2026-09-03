/**
 * Engine lines promoted from a running search into stored evidence.
 *
 * A live search is a number that moves. The moment a player decides a line
 * matters — because it settles a repertoire choice, or because two engines
 * disagree about it — it has to stop moving and start being quotable. That is
 * all pinning is: a snapshot with enough provenance attached that reading it
 * back in a month is still evidence rather than an assertion.
 *
 * Pins are keyed by canonical position, not by chapter. The same position
 * reached through a different move order is the same position, and evidence
 * gathered about it should not have to be gathered twice.
 */

import { stableId } from '../ids';
import type { PersistenceDatabase } from '../indexeddb/database';
import { STORE_NAMES } from '../schema/migrations';
import type { PinnedLineRecord } from '../domain';
import { assertValid, isPinnedLineRecord } from '../validation';

export type CreatePinnedLineInput = Omit<PinnedLineRecord, 'id' | 'createdAt'>;

export interface PinnedLineRepository {
  forPosition(positionKey: string): Promise<readonly PinnedLineRecord[]>;
  forChapter(chapterId: string): Promise<readonly PinnedLineRecord[]>;
  pin(input: CreatePinnedLineInput, now?: number): Promise<PinnedLineRecord>;
  annotate(id: string, note: string): Promise<PinnedLineRecord>;
  unpin(id: string): Promise<void>;
  count(): Promise<number>;
}

export class LocalPinnedLineRepository implements PinnedLineRepository {
  constructor(private readonly database: PersistenceDatabase) {}

  async forPosition(positionKey: string): Promise<readonly PinnedLineRecord[]> {
    const rows = await this.database.getAllFromIndex<unknown>(
      STORE_NAMES.pinnedLines,
      'positionKey',
      positionKey,
    );
    return rows
      .map((row) => assertValid(row, isPinnedLineRecord, 'pinned line'))
      .sort(byEngineThenDepth);
  }

  async forChapter(chapterId: string): Promise<readonly PinnedLineRecord[]> {
    const rows = await this.database.getAllFromIndex<unknown>(
      STORE_NAMES.pinnedLines,
      'chapterId',
      chapterId,
    );
    return rows
      .map((row) => assertValid(row, isPinnedLineRecord, 'pinned line'))
      .sort(byEngineThenDepth);
  }

  async pin(input: CreatePinnedLineInput, now = Date.now()): Promise<PinnedLineRecord> {
    const record: PinnedLineRecord = { ...input, id: stableId('pin'), createdAt: now };
    await this.database.put(STORE_NAMES.pinnedLines, record);
    return record;
  }

  /**
   * A note is the only mutable part, and it carries no revision.
   *
   * The measurement is the evidence and must never change; annotating it is
   * the player saying what they concluded, which is not the same claim and
   * cannot invalidate the first one.
   */
  async annotate(id: string, note: string): Promise<PinnedLineRecord> {
    return this.database.transaction([STORE_NAMES.pinnedLines], 'readwrite', async (tx) => {
      const raw = await tx.get<unknown>(STORE_NAMES.pinnedLines, id);
      if (raw === undefined) throw new Error('That pinned line no longer exists.');
      const current = assertValid(raw, isPinnedLineRecord, 'pinned line');
      const next: PinnedLineRecord = { ...current, note: note.trim() || undefined };
      await tx.put(STORE_NAMES.pinnedLines, next);
      return next;
    });
  }

  async unpin(id: string): Promise<void> {
    await this.database.delete(STORE_NAMES.pinnedLines, id);
  }

  async count(): Promise<number> {
    return this.database.count(STORE_NAMES.pinnedLines);
  }
}

/**
 * Group by engine, deepest first inside a group.
 *
 * Two engines' opinions of one position are the point of pinning, so keeping
 * each engine's lines together is what makes the panel readable; within an
 * engine, the deepest search is the one being quoted.
 */
const byEngineThenDepth = (a: PinnedLineRecord, b: PinnedLineRecord): number =>
  a.engineName.localeCompare(b.engineName) ||
  b.depth - a.depth ||
  a.multiPv - b.multiPv ||
  b.createdAt - a.createdAt;
