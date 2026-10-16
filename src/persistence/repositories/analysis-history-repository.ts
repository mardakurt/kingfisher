/**
 * The positions a person analysed. One record per position — the key is
 * derived from the position — so analysing it again replaces the old result
 * instead of adding a repeat, and the revision counts how many times it was
 * replaced. Read newest first.
 */
import type { Score } from '@/chess/evaluation';
import { positionKey } from '@/chess/fen';

import type { AnalysisHistoryRecord } from '../domain';
import type { PersistenceDatabase } from '../indexeddb/database';
import { STORE_NAMES } from '../schema/migrations';
import { assertValid, isAnalysisHistoryRecord } from '../validation';

export interface AnalysisHistoryInput {
  readonly fen: string;
  readonly score: Score;
  readonly depth: number;
  readonly engine: string;
  readonly line: readonly string[];
  readonly title: string;
}

export interface AnalysisHistoryRepository {
  /** Newest first, at most `limit`. */
  list(limit?: number): Promise<readonly AnalysisHistoryRecord[]>;
  record(input: AnalysisHistoryInput, now?: number): Promise<AnalysisHistoryRecord>;
  delete(id: string): Promise<void>;
}

/** The record's id: the position, so one position is one row. */
export const analysisHistoryId = (fen: string): string => `analysis:${positionKey(fen)}`;

const MAX_LINE = 10;

export class LocalAnalysisHistoryRepository implements AnalysisHistoryRepository {
  constructor(private readonly database: PersistenceDatabase) {}

  async list(limit = 200): Promise<readonly AnalysisHistoryRecord[]> {
    const rows = await this.database.getAllFromIndex<unknown>(
      STORE_NAMES.analysisHistory,
      'analysedAt',
    );
    return (
      rows
        .map((row) => assertValid(row, isAnalysisHistoryRecord, 'analysed position'))
        // Sorted here, not trusted to the index: every backing store then
        // agrees on "newest first", including the in-memory one.
        .sort((a, b) => b.analysedAt - a.analysedAt)
        .slice(0, limit)
    );
  }

  async record(input: AnalysisHistoryInput, now = Date.now()): Promise<AnalysisHistoryRecord> {
    const id = analysisHistoryId(input.fen);
    const existing = await this.database.get<unknown>(STORE_NAMES.analysisHistory, id);
    const previous =
      existing && isAnalysisHistoryRecord(existing) ? (existing as AnalysisHistoryRecord) : null;
    const record: AnalysisHistoryRecord = {
      id,
      positionKey: positionKey(input.fen),
      fen: input.fen,
      score: input.score,
      depth: input.depth,
      engine: input.engine,
      line: input.line.slice(0, MAX_LINE),
      title: input.title,
      analysedAt: now,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      revision: (previous?.revision ?? -1) + 1,
    };
    assertValid(record, isAnalysisHistoryRecord, 'analysed position');
    await this.database.put(STORE_NAMES.analysisHistory, record);
    return record;
  }

  async delete(id: string): Promise<void> {
    await this.database.delete(STORE_NAMES.analysisHistory, id);
  }
}
