import { stableId } from '../ids';
import type { PersistenceDatabase } from '../indexeddb/database';
import { STORE_NAMES } from '../schema/migrations';
import type { ResolvedStudyReference, StudyReferenceKind, StudyReferenceRecord } from '../domain';
import type { GameSummary } from '../types';
import {
  assertValid,
  isRepertoirePositionRecord,
  isStudyReferenceRecord,
  isTrainingItemRecord,
} from '../validation';

export interface CreateStudyReferenceInput {
  readonly chapterId: string;
  readonly kind: StudyReferenceKind;
  readonly targetId: string;
  readonly label: string;
}

export interface StudyReferenceRepository {
  forChapter(chapterId: string): Promise<readonly StudyReferenceRecord[]>;
  create(input: CreateStudyReferenceInput): Promise<StudyReferenceRecord>;
  delete(id: string): Promise<void>;
  resolve(reference: StudyReferenceRecord): Promise<ResolvedStudyReference>;
}

export class LocalStudyReferenceRepository implements StudyReferenceRepository {
  constructor(private readonly database: PersistenceDatabase) {}

  async forChapter(chapterId: string): Promise<readonly StudyReferenceRecord[]> {
    const records = await this.database.getAllFromIndex<unknown>(
      STORE_NAMES.studyReferences,
      'chapterId',
      chapterId,
    );
    return records
      .map((record) => assertValid(record, isStudyReferenceRecord, 'study reference'))
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async create(input: CreateStudyReferenceInput): Promise<StudyReferenceRecord> {
    return this.database.transaction(
      [STORE_NAMES.chapters, STORE_NAMES.studyReferences],
      'readwrite',
      async (transaction) => {
        if (!(await transaction.get(STORE_NAMES.chapters, input.chapterId))) {
          throw new Error('That chapter no longer exists.');
        }
        const existing = await transaction.getAllFromIndex<StudyReferenceRecord>(
          STORE_NAMES.studyReferences,
          'chapterTarget',
          [input.chapterId, input.kind, input.targetId],
        );
        if (existing[0]) return existing[0];
        const reference: StudyReferenceRecord = {
          ...input,
          id: stableId('ref'),
          label: input.label.trim() || 'Chess reference',
          createdAt: Date.now(),
        };
        await transaction.put(STORE_NAMES.studyReferences, reference);
        return reference;
      },
    );
  }

  async delete(id: string): Promise<void> {
    await this.database.delete(STORE_NAMES.studyReferences, id);
  }

  async resolve(reference: StudyReferenceRecord): Promise<ResolvedStudyReference> {
    if (reference.kind === 'model-game') {
      const game = await this.database.get<GameSummary>(STORE_NAMES.games, reference.targetId);
      return {
        reference,
        missing: !game,
        label: game
          ? `${game.white} – ${game.black}${game.year ? `, ${game.year}` : ''}`
          : reference.label,
        gameId: reference.targetId,
      };
    }
    if (reference.kind === 'repertoire-position') {
      const raw = await this.database.get<unknown>(
        STORE_NAMES.repertoirePositions,
        reference.targetId,
      );
      const position = raw
        ? assertValid(raw, isRepertoirePositionRecord, 'repertoire position')
        : null;
      return {
        reference,
        missing: !position,
        label: reference.label,
        ...(position ? { repertoireId: position.repertoireId } : {}),
      };
    }
    const raw = await this.database.get<unknown>(STORE_NAMES.trainingItems, reference.targetId);
    const item = raw ? assertValid(raw, isTrainingItemRecord, 'training item') : null;
    return {
      reference,
      missing: !item,
      label: item?.prompt ?? reference.label,
      trainingItemId: reference.targetId,
    };
  }
}
