/**
 * Sittings of a chapter's questions (Phase 85): written once, when the last
 * question has been answered, and read back by chapter, newest first.
 *
 * A sitting is a record of what happened, so it is never edited; the only
 * other write is deleting one.
 */
import { stableId } from '../ids';
import type { PersistenceDatabase } from '../indexeddb/database';
import { STORE_NAMES } from '../schema/migrations';
import type { QuestionAnswerRecord, QuestionSessionRecord } from '../domain';
import { assertValid, isQuestionSessionRecord } from '../validation';

export interface QuestionSessionInput {
  readonly chapterId: string;
  readonly chapterTitle: string;
  readonly startedAt: number;
  readonly answers: readonly QuestionAnswerRecord[];
}

export interface QuestionSessionRepository {
  /** A chapter's sittings, newest first. */
  forChapter(chapterId: string): Promise<readonly QuestionSessionRecord[]>;
  record(input: QuestionSessionInput, now?: number): Promise<QuestionSessionRecord>;
  delete(id: string): Promise<void>;
}

export class LocalQuestionSessionRepository implements QuestionSessionRepository {
  constructor(private readonly database: PersistenceDatabase) {}

  async forChapter(chapterId: string): Promise<readonly QuestionSessionRecord[]> {
    const rows = await this.database.getAllFromIndex<unknown>(
      STORE_NAMES.questionSessions,
      'chapterId',
      chapterId,
    );
    return rows
      .map((row) => assertValid(row, isQuestionSessionRecord, 'question sitting'))
      .sort((a, b) => b.finishedAt - a.finishedAt || a.id.localeCompare(b.id));
  }

  async record(input: QuestionSessionInput, now = Date.now()): Promise<QuestionSessionRecord> {
    const record: QuestionSessionRecord = {
      id: stableId('questions'),
      chapterId: input.chapterId,
      chapterTitle: input.chapterTitle.trim() || 'Untitled chapter',
      startedAt: input.startedAt,
      finishedAt: now,
      answers: input.answers,
      createdAt: now,
      updatedAt: now,
      revision: 0,
    };
    assertValid(record, isQuestionSessionRecord, 'question sitting');
    await this.database.put(STORE_NAMES.questionSessions, record);
    return record;
  }

  async delete(id: string): Promise<void> {
    await this.database.delete(STORE_NAMES.questionSessions, id);
  }
}
