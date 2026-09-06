/**
 * Training items and their review history.
 *
 * Items and reviews are separate stores because they have opposite lifetimes:
 * an item is small, mutable and read constantly; a review is immutable, append
 * only, and grows without bound. Keeping the history out of the item is what
 * lets the due-queue query stay a single index scan forever.
 */

import { stableId } from '../ids';
import { upToKey } from '../indexeddb/key-range';
import { STORE_NAMES } from '../schema/migrations';
import type { PersistenceDatabase } from '../indexeddb/database';
import type {
  ReviewGrade,
  ScheduleState,
  TrainingItemId,
  TrainingItemRecord,
  TrainingReviewRecord,
} from '../domain';
import { StaleTrainingItemWriteError } from '../domain';
import { assertValid, isTrainingItemRecord, isTrainingReviewRecord } from '../validation';
import { grade as applyGrade, newSchedule } from '@/training/schedule';
import { reviewCardKey } from '@/repertoire/review-card';

export type CreateTrainingItemInput = Omit<
  TrainingItemRecord,
  'id' | 'schedule' | 'createdAt' | 'updatedAt' | 'revision'
>;

export interface TrainingRepository {
  list(): Promise<readonly TrainingItemRecord[]>;
  get(id: TrainingItemId): Promise<TrainingItemRecord | null>;
  /** Items whose next review is at or before `now`. */
  due(now: number, limit?: number): Promise<readonly TrainingItemRecord[]>;
  create(input: CreateTrainingItemInput, now?: number): Promise<TrainingItemRecord>;
  enrolRepertoire(
    inputs: readonly CreateTrainingItemInput[],
    now?: number,
  ): Promise<readonly TrainingItemRecord[]>;
  update(item: TrainingItemRecord): Promise<TrainingItemRecord>;
  delete(id: TrainingItemId): Promise<void>;
  /** Grade a review, advancing the schedule and appending to history. */
  review(
    id: TrainingItemId,
    outcome: ReviewGrade,
    correct: boolean,
    now: number,
  ): Promise<TrainingItemRecord>;
  history(id: TrainingItemId): Promise<readonly TrainingReviewRecord[]>;
  countByPosition(positionKey: string): Promise<number>;
}

export class LocalTrainingRepository implements TrainingRepository {
  constructor(private readonly database: PersistenceDatabase) {}

  async enrolRepertoire(
    inputs: readonly CreateTrainingItemInput[],
    now = Date.now(),
  ): Promise<readonly TrainingItemRecord[]> {
    return this.database.transaction(
      [STORE_NAMES.trainingItems],
      'readwrite',
      async (transaction) => {
        const all = await transaction.getAll<TrainingItemRecord>(STORE_NAMES.trainingItems);
        const existing = new Map<string, TrainingItemRecord>();
        for (const item of all) {
          if (item.mode !== 'repertoire-recall') continue;
          const key = reviewCardKey(item.positionKey, item.solutionUci);
          const held = existing.get(key);
          if (!held || item.schedule.dueAt < held.schedule.dueAt) existing.set(key, item);
        }
        const result: TrainingItemRecord[] = [];
        for (const input of inputs) {
          if (input.mode !== 'repertoire-recall')
            throw new Error('Repertoire enrolment requires recall cards.');
          const key = reviewCardKey(input.positionKey, input.solutionUci);
          let item = existing.get(key);
          if (!item) {
            item = {
              ...input,
              id: stableId('train'),
              schedule: newSchedule(now),
              createdAt: now,
              updatedAt: now,
              revision: 0,
            };
            assertValid(item, isTrainingItemRecord, 'training item');
            await transaction.put(STORE_NAMES.trainingItems, item);
            existing.set(key, item);
          }
          if (!result.some((held) => held.id === item.id)) result.push(item);
        }
        return result;
      },
    );
  }

  async list(): Promise<readonly TrainingItemRecord[]> {
    const records = await this.database.getAll<unknown>(STORE_NAMES.trainingItems);
    const items = records.map((record) =>
      assertValid(record, isTrainingItemRecord, 'training item'),
    );
    return items.sort((a, b) => a.schedule.dueAt - b.schedule.dueAt);
  }

  async get(id: TrainingItemId): Promise<TrainingItemRecord | null> {
    const raw = await this.database.get<unknown>(STORE_NAMES.trainingItems, id);
    return raw === undefined ? null : assertValid(raw, isTrainingItemRecord, 'training item');
  }

  /**
   * A bounded index range, not a filter over everything: the due queue is the
   * query this screen runs on every visit, and it must not get slower as the
   * user's collection grows.
   */
  async due(now: number, limit = 200): Promise<readonly TrainingItemRecord[]> {
    const records = await this.database.getAllFromIndex<unknown>(
      STORE_NAMES.trainingItems,
      'dueAt',
      upToKey(now),
    );
    const items = records.map((record) =>
      assertValid(record, isTrainingItemRecord, 'training item'),
    );
    items.sort((a, b) => a.schedule.dueAt - b.schedule.dueAt);
    return items.slice(0, limit);
  }

  async create(input: CreateTrainingItemInput, now = Date.now()): Promise<TrainingItemRecord> {
    const item: TrainingItemRecord = {
      ...input,
      id: stableId('train'),
      schedule: newSchedule(now),
      createdAt: now,
      updatedAt: now,
      revision: 0,
    };
    await this.database.put(STORE_NAMES.trainingItems, item);
    return item;
  }

  async update(item: TrainingItemRecord): Promise<TrainingItemRecord> {
    return this.database.transaction(
      [STORE_NAMES.trainingItems],
      'readwrite',
      async (transaction) => {
        const raw = await transaction.get<unknown>(STORE_NAMES.trainingItems, item.id);
        if (raw === undefined) throw new Error('That training item no longer exists.');
        const current = assertValid(raw, isTrainingItemRecord, 'training item');
        if (current.revision !== item.revision) {
          throw new StaleTrainingItemWriteError(current, item.revision);
        }
        const next: TrainingItemRecord = {
          ...item,
          // Reviews are append-only and schedule changes are allowed to race
          // with authoring without being erased by an older editor.
          schedule: current.schedule,
          updatedAt: Date.now(),
          revision: current.revision + 1,
        };
        await transaction.put(STORE_NAMES.trainingItems, next);
        return next;
      },
    );
  }

  async delete(id: TrainingItemId): Promise<void> {
    await this.database.transaction(
      [STORE_NAMES.trainingItems, STORE_NAMES.trainingReviews],
      'readwrite',
      async (transaction) => {
        const reviews = await transaction.getAllFromIndex<TrainingReviewRecord>(
          STORE_NAMES.trainingReviews,
          'itemId',
          id,
        );
        for (const entry of reviews) {
          await transaction.delete(STORE_NAMES.trainingReviews, entry.id);
        }
        await transaction.delete(STORE_NAMES.trainingItems, id);
      },
    );
  }

  /**
   * Advancing the schedule and recording the review happen in one transaction:
   * a history entry with no matching schedule change, or the reverse, would
   * make the queue disagree with what the user remembers doing.
   */
  async review(
    id: TrainingItemId,
    outcome: ReviewGrade,
    correct: boolean,
    now: number,
  ): Promise<TrainingItemRecord> {
    return this.database.transaction(
      [STORE_NAMES.trainingItems, STORE_NAMES.trainingReviews],
      'readwrite',
      async (transaction) => {
        const raw = await transaction.get<unknown>(STORE_NAMES.trainingItems, id);
        if (raw === undefined) throw new Error('That training item no longer exists.');
        const item = assertValid(raw, isTrainingItemRecord, 'training item');

        const schedule: ScheduleState = applyGrade(item.schedule, outcome, now);
        const next: TrainingItemRecord = { ...item, schedule, updatedAt: now };

        const entry: TrainingReviewRecord = {
          id: stableId('review'),
          itemId: id,
          reviewedAt: now,
          grade: outcome,
          intervalDays: schedule.intervalDays,
          correct,
        };

        await transaction.put(STORE_NAMES.trainingItems, next);
        await transaction.put(STORE_NAMES.trainingReviews, entry);
        return next;
      },
    );
  }

  async history(id: TrainingItemId): Promise<readonly TrainingReviewRecord[]> {
    const records = await this.database.getAllFromIndex<unknown>(
      STORE_NAMES.trainingReviews,
      'itemId',
      id,
    );
    const reviews = records.map((record) =>
      assertValid(record, isTrainingReviewRecord, 'training review'),
    );
    return reviews.sort((a, b) => b.reviewedAt - a.reviewedAt);
  }

  async countByPosition(positionKey: string): Promise<number> {
    const records = await this.database.getAllFromIndex<unknown>(
      STORE_NAMES.trainingItems,
      'positionKey',
      positionKey,
    );
    return records.length;
  }
}
