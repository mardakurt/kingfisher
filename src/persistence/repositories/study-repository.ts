import { stableId } from '../ids';
import { STORE_NAMES } from '../schema/migrations';
import type {
  ChapterId,
  ChapterRecord,
  CreateChapterInput,
  CreateStudyInput,
  StudyId,
  StudyRecord,
  StudyRepository,
  StudyUpdate,
  StudyWithChapters,
} from '../types';
import { StaleChapterWriteError } from '../types';
import { assertValid, isChapterRecord, isStudyRecord } from '../validation';
import type { PersistenceDatabase } from '../indexeddb/database';

export class LocalStudyRepository implements StudyRepository {
  constructor(private readonly database: PersistenceDatabase) {}

  async list(): Promise<readonly StudyRecord[]> {
    const records = await this.database.getAll<unknown>(STORE_NAMES.studies);
    return records
      .map((record) => assertValid(record, isStudyRecord, 'study'))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(id: StudyId): Promise<StudyWithChapters | null> {
    const raw = await this.database.get<unknown>(STORE_NAMES.studies, id);
    if (raw === undefined) return null;
    const study = assertValid(raw, isStudyRecord, 'study');
    const chapters = (
      await this.database.getAllFromIndex<unknown>(STORE_NAMES.chapters, 'studyId', id)
    )
      .map((record) => assertValid(record, isChapterRecord, 'chapter'))
      .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
    return { study, chapters };
  }

  async create(input: CreateStudyInput): Promise<StudyRecord> {
    const now = Date.now();
    const title = requiredTitle(input.title, 'Study');
    const study: StudyRecord = {
      id: stableId('study'),
      title,
      ...(input.description?.trim() ? { description: input.description.trim() } : {}),
      createdAt: now,
      updatedAt: now,
    };
    await this.database.put(STORE_NAMES.studies, study);
    return study;
  }

  async update(id: StudyId, update: StudyUpdate): Promise<StudyRecord> {
    const current = await this.get(id);
    if (!current) throw new Error('That study no longer exists.');
    const next: StudyRecord = {
      ...current.study,
      ...(update.title !== undefined ? { title: requiredTitle(update.title, 'Study') } : {}),
      ...(update.description !== undefined
        ? update.description.trim()
          ? { description: update.description.trim() }
          : { description: undefined }
        : {}),
      updatedAt: Date.now(),
    };
    await this.database.put(STORE_NAMES.studies, next);
    return next;
  }

  async delete(id: StudyId): Promise<void> {
    await this.database.transaction(
      [STORE_NAMES.studies, STORE_NAMES.chapters, STORE_NAMES.studyReferences],
      'readwrite',
      async (transaction) => {
        const chapters = await transaction.getAllFromIndex<ChapterRecord>(
          STORE_NAMES.chapters,
          'studyId',
          id,
        );
        for (const chapter of chapters) {
          const references = await transaction.getAllFromIndex<{ id: string }>(
            STORE_NAMES.studyReferences,
            'chapterId',
            chapter.id,
          );
          for (const reference of references) {
            await transaction.delete(STORE_NAMES.studyReferences, reference.id);
          }
          await transaction.delete(STORE_NAMES.chapters, chapter.id);
        }
        await transaction.delete(STORE_NAMES.studies, id);
      },
    );
  }

  async createChapter(input: CreateChapterInput): Promise<ChapterRecord> {
    const study = await this.get(input.studyId);
    if (!study) throw new Error('Create a study before adding a chapter.');
    const now = Date.now();
    const chapter: ChapterRecord = {
      id: stableId('chapter'),
      studyId: input.studyId,
      title: requiredTitle(input.title, 'Chapter'),
      order: study.chapters.length,
      tree: input.tree,
      createdAt: now,
      updatedAt: now,
      revision: 0,
    };
    await this.database.transaction(
      [STORE_NAMES.studies, STORE_NAMES.chapters],
      'readwrite',
      async (transaction) => {
        await transaction.put(STORE_NAMES.chapters, chapter);
        await transaction.put(STORE_NAMES.studies, { ...study.study, updatedAt: now });
      },
    );
    return chapter;
  }

  async getChapter(id: ChapterId): Promise<ChapterRecord | null> {
    const raw = await this.database.get<unknown>(STORE_NAMES.chapters, id);
    return raw === undefined ? null : assertValid(raw, isChapterRecord, 'chapter');
  }

  /**
   * The revision is re-read *inside* the write transaction, not before it.
   *
   * Reading first and writing afterwards leaves a window in which the other
   * tab commits, and a check made in that window passes on data that is
   * already stale by the time the put lands.
   */
  async saveChapter(chapter: ChapterRecord): Promise<ChapterRecord> {
    const now = Date.now();
    return this.database.transaction(
      [STORE_NAMES.studies, STORE_NAMES.chapters],
      'readwrite',
      async (transaction) => {
        const raw = await transaction.get<unknown>(STORE_NAMES.chapters, chapter.id);
        if (raw === undefined) {
          throw new Error('That chapter no longer exists. Save the analysis to a new chapter.');
        }
        const current = assertValid(raw, isChapterRecord, 'chapter');
        if (current.studyId !== chapter.studyId) {
          throw new Error('That chapter no longer exists. Save the analysis to a new chapter.');
        }
        if (current.revision !== chapter.revision) {
          throw new StaleChapterWriteError(current, chapter.revision);
        }

        const next: ChapterRecord = {
          ...chapter,
          title: requiredTitle(chapter.title, 'Chapter'),
          updatedAt: now,
          revision: current.revision + 1,
        };
        const study = await transaction.get<StudyRecord>(STORE_NAMES.studies, chapter.studyId);
        if (!study) throw new Error('The chapter study no longer exists.');
        await transaction.put(STORE_NAMES.chapters, next);
        await transaction.put(STORE_NAMES.studies, { ...study, updatedAt: now });
        return next;
      },
    );
  }

  async renameChapter(id: ChapterId, title: string): Promise<ChapterRecord> {
    const chapter = await this.getChapter(id);
    if (!chapter) throw new Error('That chapter no longer exists.');
    return this.saveChapter({ ...chapter, title: requiredTitle(title, 'Chapter') });
  }

  async deleteChapter(id: ChapterId): Promise<void> {
    const chapter = await this.getChapter(id);
    if (!chapter) return;
    await this.database.transaction(
      [STORE_NAMES.studies, STORE_NAMES.chapters, STORE_NAMES.studyReferences],
      'readwrite',
      async (transaction) => {
        const references = await transaction.getAllFromIndex<{ id: string }>(
          STORE_NAMES.studyReferences,
          'chapterId',
          id,
        );
        for (const reference of references) {
          await transaction.delete(STORE_NAMES.studyReferences, reference.id);
        }
        await transaction.delete(STORE_NAMES.chapters, id);
        const siblings = (
          await transaction.getAllFromIndex<ChapterRecord>(
            STORE_NAMES.chapters,
            'studyId',
            chapter.studyId,
          )
        ).sort((a, b) => a.order - b.order);
        for (const [order, sibling] of siblings.entries()) {
          if (sibling.order !== order) {
            await transaction.put(STORE_NAMES.chapters, {
              ...sibling,
              order,
              revision: sibling.revision + 1,
            });
          }
        }
        const study = await transaction.get<StudyRecord>(STORE_NAMES.studies, chapter.studyId);
        if (study) await transaction.put(STORE_NAMES.studies, { ...study, updatedAt: Date.now() });
      },
    );
  }

  async reorderChapters(studyId: StudyId, orderedIds: readonly ChapterId[]): Promise<void> {
    await this.database.transaction(
      [STORE_NAMES.studies, STORE_NAMES.chapters],
      'readwrite',
      async (transaction) => {
        const chapters = await transaction.getAllFromIndex<ChapterRecord>(
          STORE_NAMES.chapters,
          'studyId',
          studyId,
        );
        if (
          chapters.length !== orderedIds.length ||
          new Set(orderedIds).size !== orderedIds.length
        ) {
          throw new Error('Chapter order does not match the study.');
        }
        const byId = new Map(chapters.map((chapter) => [chapter.id, chapter]));
        for (const [order, id] of orderedIds.entries()) {
          const chapter = byId.get(id);
          if (!chapter) throw new Error('Chapter order contains an unknown chapter.');
          if (chapter.order === order) continue;
          await transaction.put(STORE_NAMES.chapters, {
            ...chapter,
            order,
            updatedAt: Date.now(),
            revision: chapter.revision + 1,
          });
        }
        const study = await transaction.get<StudyRecord>(STORE_NAMES.studies, studyId);
        if (study) await transaction.put(STORE_NAMES.studies, { ...study, updatedAt: Date.now() });
      },
    );
  }

  async duplicateChapter(id: ChapterId): Promise<ChapterRecord> {
    const chapter = await this.getChapter(id);
    if (!chapter) throw new Error('That chapter no longer exists.');
    return this.createChapter({
      studyId: chapter.studyId,
      title: `${chapter.title} copy`,
      tree: chapter.tree,
    });
  }
}

const requiredTitle = (value: string, fallback: string): string =>
  value.trim() || `Untitled ${fallback}`;
