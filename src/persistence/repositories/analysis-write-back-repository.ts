/**
 * Writing stored evaluations into a chapter, and undoing it (Phase 86).
 *
 * The chapter and the batch record are written in one transaction, so there
 * is never a chapter carrying evaluations that no batch can undo, or a batch
 * describing a write that did not happen. The chapter's revision is re-read
 * inside that transaction, as `saveChapter` does: if the chapter changed
 * since the caller loaded it, nothing is written and the caller is told —
 * "blocked on merge" — with the chapter as it now is, so a person can decide
 * to apply the evaluations to that version instead. Nothing authored is ever
 * written over; see `src/evidence/write-back.ts`.
 */

import { applyWriteBack, undoWriteBack, type WriteBackPlan } from '@/evidence/write-back';

import type { AnalysisWriteBackRecord } from '../domain';
import { stableId } from '../ids';
import type { PersistenceDatabase } from '../indexeddb/database';
import { STORE_NAMES } from '../schema/migrations';
import type { ChapterRecord } from '../types';
import { assertValid, isAnalysisWriteBackRecord, isChapterRecord } from '../validation';

export type WriteBackOutcome =
  | {
      readonly status: 'applied';
      readonly chapter: ChapterRecord;
      readonly batch: AnalysisWriteBackRecord;
    }
  | { readonly status: 'blocked-on-merge'; readonly current: ChapterRecord }
  | { readonly status: 'nothing'; readonly plan: WriteBackPlan };

export type UndoOutcome =
  | {
      readonly status: 'undone';
      readonly chapter: ChapterRecord;
      readonly batch: AnalysisWriteBackRecord;
    }
  | { readonly status: 'blocked-on-merge'; readonly current: ChapterRecord }
  | { readonly status: 'already-undone' };

export interface AnalysisWriteBackRepository {
  apply(
    input: {
      readonly chapterId: string;
      readonly expectedRevision: number;
      readonly plan: (chapter: ChapterRecord) => WriteBackPlan;
    },
    now?: number,
  ): Promise<WriteBackOutcome>;
  undo(batchId: string, expectedRevision: number, now?: number): Promise<UndoOutcome>;
  /** The most recent batch still applied to this chapter, if any. */
  latestApplied(chapterId: string): Promise<AnalysisWriteBackRecord | null>;
}

const STORES = [STORE_NAMES.studies, STORE_NAMES.chapters, STORE_NAMES.analysisWriteBacks];

export class LocalAnalysisWriteBackRepository implements AnalysisWriteBackRepository {
  constructor(private readonly database: PersistenceDatabase) {}

  async apply(
    input: {
      readonly chapterId: string;
      readonly expectedRevision: number;
      readonly plan: (chapter: ChapterRecord) => WriteBackPlan;
    },
    now = Date.now(),
  ): Promise<WriteBackOutcome> {
    return this.database.transaction(STORES, 'readwrite', async (transaction) => {
      const raw = await transaction.get<unknown>(STORE_NAMES.chapters, input.chapterId);
      if (raw === undefined) throw new Error('That chapter no longer exists.');
      const current = assertValid(raw, isChapterRecord, 'chapter');
      if (current.revision !== input.expectedRevision) {
        return { status: 'blocked-on-merge', current };
      }
      const plan = input.plan(current);
      if (plan.entries.length === 0) return { status: 'nothing', plan };
      const chapter: ChapterRecord = {
        ...current,
        tree: applyWriteBack(current.tree, plan.entries),
        updatedAt: now,
        revision: current.revision + 1,
      };
      const batch: AnalysisWriteBackRecord = {
        id: stableId('writeback'),
        chapterId: current.id,
        studyId: current.studyId,
        entries: plan.entries,
        keptExisting: plan.keptExisting,
        notAnalysed: plan.notAnalysed,
        beforeRevision: current.revision,
        afterRevision: chapter.revision,
        status: 'applied',
        appliedAt: now,
        createdAt: now,
        updatedAt: now,
        revision: 0,
      };
      assertValid(batch, isAnalysisWriteBackRecord, 'write-back batch');
      const study = await transaction.get<Record<string, unknown>>(
        STORE_NAMES.studies,
        current.studyId,
      );
      if (!study) throw new Error('The chapter study no longer exists.');
      await transaction.put(STORE_NAMES.chapters, chapter);
      await transaction.put(STORE_NAMES.studies, { ...study, updatedAt: now });
      await transaction.put(STORE_NAMES.analysisWriteBacks, batch);
      return { status: 'applied', chapter, batch };
    });
  }

  async undo(batchId: string, expectedRevision: number, now = Date.now()): Promise<UndoOutcome> {
    return this.database.transaction(STORES, 'readwrite', async (transaction) => {
      const rawBatch = await transaction.get<unknown>(STORE_NAMES.analysisWriteBacks, batchId);
      if (rawBatch === undefined) throw new Error('That write is no longer recorded.');
      const batch = assertValid(rawBatch, isAnalysisWriteBackRecord, 'write-back batch');
      if (batch.status === 'undone') return { status: 'already-undone' };
      const raw = await transaction.get<unknown>(STORE_NAMES.chapters, batch.chapterId);
      if (raw === undefined) throw new Error('That chapter no longer exists.');
      const current = assertValid(raw, isChapterRecord, 'chapter');
      if (current.revision !== expectedRevision) return { status: 'blocked-on-merge', current };
      const undone = undoWriteBack(current.tree, batch.entries);
      const chapter: ChapterRecord = {
        ...current,
        tree: undone.tree,
        updatedAt: now,
        revision: current.revision + 1,
      };
      const record: AnalysisWriteBackRecord = {
        ...batch,
        status: 'undone',
        undoneAt: now,
        undo: { removed: undone.removed, keptChanged: undone.keptChanged },
        updatedAt: now,
        revision: batch.revision + 1,
      };
      await transaction.put(STORE_NAMES.chapters, chapter);
      await transaction.put(STORE_NAMES.analysisWriteBacks, record);
      return { status: 'undone', chapter, batch: record };
    });
  }

  async latestApplied(chapterId: string): Promise<AnalysisWriteBackRecord | null> {
    const rows = await this.database.getAllFromIndex<unknown>(
      STORE_NAMES.analysisWriteBacks,
      'chapterId',
      chapterId,
    );
    return (
      rows
        .map((row) => assertValid(row, isAnalysisWriteBackRecord, 'write-back batch'))
        .filter((row) => row.status === 'applied')
        .sort((a, b) => b.appliedAt - a.appliedAt)[0] ?? null
    );
  }
}
