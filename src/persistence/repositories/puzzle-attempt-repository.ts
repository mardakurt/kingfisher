/**
 * Tactics-puzzle attempts. Each is written once, when the attempt ends, and
 * never edited: the solver rating is replayed from the whole list
 * (`solverRating` in `src/training/puzzles.ts`), so changing an old attempt
 * would silently rewrite every rating after it.
 */
import type { PuzzleAttemptRecord } from '../domain';
import type { PersistenceDatabase } from '../indexeddb/database';
import { stableId } from '../ids';
import { STORE_NAMES } from '../schema/migrations';
import { assertValid, isPuzzleAttemptRecord } from '../validation';

export interface PuzzleAttemptInput {
  readonly puzzleId: string;
  readonly puzzleRating: number;
  readonly puzzleDeviation: number;
  readonly themes: readonly string[];
  readonly solved: boolean;
  readonly played: readonly string[];
  readonly durationMs: number;
}

export interface PuzzleAttemptRepository {
  /** Every attempt, oldest first. */
  list(): Promise<readonly PuzzleAttemptRecord[]>;
  record(input: PuzzleAttemptInput, now?: number): Promise<PuzzleAttemptRecord>;
}

export class LocalPuzzleAttemptRepository implements PuzzleAttemptRepository {
  constructor(private readonly database: PersistenceDatabase) {}

  async list(): Promise<readonly PuzzleAttemptRecord[]> {
    const rows = await this.database.getAllFromIndex<unknown>(
      STORE_NAMES.puzzleAttempts,
      'attemptedAt',
    );
    return rows.map((row) => assertValid(row, isPuzzleAttemptRecord, 'puzzle attempt'));
  }

  async record(input: PuzzleAttemptInput, now = Date.now()): Promise<PuzzleAttemptRecord> {
    const record: PuzzleAttemptRecord = {
      id: stableId('puzzle-attempt'),
      puzzleId: input.puzzleId,
      puzzleRating: input.puzzleRating,
      puzzleDeviation: input.puzzleDeviation,
      themes: [...input.themes],
      solved: input.solved,
      played: [...input.played],
      durationMs: Math.max(0, Math.round(input.durationMs)),
      attemptedAt: now,
      createdAt: now,
      updatedAt: now,
      revision: 0,
    };
    assertValid(record, isPuzzleAttemptRecord, 'puzzle attempt');
    await this.database.put(STORE_NAMES.puzzleAttempts, record);
    return record;
  }
}
