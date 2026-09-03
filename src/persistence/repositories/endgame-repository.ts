/**
 * The endgame position library.
 *
 * Everything about an entry is stated by the player except the piece count,
 * which is counted from the FEN because tablebase eligibility is arithmetic
 * rather than judgement. The category is not: "fortress" and "technical
 * conversion" describe what a position is *for*, and no amount of counting
 * material produces them.
 */

import { parseFen } from '@/chess/fen';
import { isOk } from '@/chess/result';
import type { Color, Fen } from '@/chess/types';
import { stableId } from '../ids';
import type { PersistenceDatabase } from '../indexeddb/database';
import { STORE_NAMES } from '../schema/migrations';
import type { EndgameCategory, EndgameGoal, EndgamePositionRecord } from '../domain';
import { StaleEndgamePositionWriteError } from '../domain';
import { assertValid, isEndgamePositionRecord } from '../validation';

export interface CreateEndgamePositionInput {
  readonly positionKey: string;
  readonly fen: Fen;
  readonly sideToMove: Color;
  readonly title: string;
  readonly category: EndgameCategory;
  readonly goal: EndgameGoal;
  readonly note?: string;
  readonly tags?: readonly string[];
  readonly source?: string;
  readonly gameId?: string;
}

export interface EndgameQuery {
  readonly category?: EndgameCategory;
  readonly goal?: EndgameGoal;
  /** Only positions a tablebase of this size could answer. */
  readonly maxPieces?: number;
  readonly tag?: string;
}

export interface EndgameRepository {
  list(query?: EndgameQuery): Promise<readonly EndgamePositionRecord[]>;
  get(id: string): Promise<EndgamePositionRecord | null>;
  forPosition(positionKey: string): Promise<readonly EndgamePositionRecord[]>;
  create(input: CreateEndgamePositionInput, now?: number): Promise<EndgamePositionRecord>;
  update(
    id: string,
    expectedRevision: number,
    change: Partial<Omit<CreateEndgamePositionInput, 'positionKey' | 'fen' | 'sideToMove'>> & {
      readonly trainingItemId?: string;
    },
  ): Promise<EndgamePositionRecord>;
  delete(id: string): Promise<void>;
  /** How many saved positions fall in each category, for the library header. */
  countsByCategory(): Promise<ReadonlyMap<EndgameCategory, number>>;
}

export class LocalEndgameRepository implements EndgameRepository {
  constructor(private readonly database: PersistenceDatabase) {}

  async list(query: EndgameQuery = {}): Promise<readonly EndgamePositionRecord[]> {
    const rows = await this.database.getAll<unknown>(STORE_NAMES.endgamePositions);
    return rows
      .map((row) => assertValid(row, isEndgamePositionRecord, 'endgame position'))
      .filter((record) => matchesEndgameQuery(record, query))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(id: string): Promise<EndgamePositionRecord | null> {
    const raw = await this.database.get<unknown>(STORE_NAMES.endgamePositions, id);
    return raw === undefined ? null : assertValid(raw, isEndgamePositionRecord, 'endgame position');
  }

  async forPosition(positionKey: string): Promise<readonly EndgamePositionRecord[]> {
    const rows = await this.database.getAllFromIndex<unknown>(
      STORE_NAMES.endgamePositions,
      'positionKey',
      positionKey,
    );
    return rows.map((row) => assertValid(row, isEndgamePositionRecord, 'endgame position'));
  }

  async create(
    input: CreateEndgamePositionInput,
    now = Date.now(),
  ): Promise<EndgamePositionRecord> {
    const title = input.title.trim();
    if (!title) throw new Error('An endgame position needs a title.');
    const record: EndgamePositionRecord = {
      id: stableId('eg'),
      positionKey: input.positionKey,
      fen: input.fen,
      sideToMove: input.sideToMove,
      title,
      category: input.category,
      goal: input.goal,
      ...(input.note ? { note: input.note } : {}),
      tags: [...new Set(input.tags ?? [])],
      pieceCount: countPieces(input.fen),
      ...(input.source ? { source: input.source } : {}),
      ...(input.gameId ? { gameId: input.gameId } : {}),
      createdAt: now,
      updatedAt: now,
      revision: 0,
    };
    await this.database.put(STORE_NAMES.endgamePositions, record);
    return record;
  }

  update(
    id: string,
    expectedRevision: number,
    change: Partial<Omit<CreateEndgamePositionInput, 'positionKey' | 'fen' | 'sideToMove'>> & {
      readonly trainingItemId?: string;
    },
  ): Promise<EndgamePositionRecord> {
    return this.write(id, expectedRevision, (current) => ({
      ...current,
      ...(change.title !== undefined ? { title: change.title.trim() || current.title } : {}),
      ...(change.category !== undefined ? { category: change.category } : {}),
      ...(change.goal !== undefined ? { goal: change.goal } : {}),
      ...(change.note !== undefined ? { note: change.note } : {}),
      ...(change.tags !== undefined ? { tags: [...new Set(change.tags)] } : {}),
      ...(change.source !== undefined ? { source: change.source } : {}),
      ...(change.trainingItemId !== undefined ? { trainingItemId: change.trainingItemId } : {}),
    }));
  }

  async delete(id: string): Promise<void> {
    await this.database.delete(STORE_NAMES.endgamePositions, id);
  }

  async countsByCategory(): Promise<ReadonlyMap<EndgameCategory, number>> {
    const all = await this.list();
    const counts = new Map<EndgameCategory, number>();
    for (const record of all) {
      counts.set(record.category, (counts.get(record.category) ?? 0) + 1);
    }
    return counts;
  }

  private write(
    id: string,
    expectedRevision: number,
    change: (current: EndgamePositionRecord) => EndgamePositionRecord,
  ): Promise<EndgamePositionRecord> {
    return this.database.transaction(
      [STORE_NAMES.endgamePositions],
      'readwrite',
      async (transaction) => {
        const raw = await transaction.get<unknown>(STORE_NAMES.endgamePositions, id);
        if (raw === undefined) throw new Error('That endgame position no longer exists.');
        const current = assertValid(raw, isEndgamePositionRecord, 'endgame position');
        if (current.revision !== expectedRevision) {
          throw new StaleEndgamePositionWriteError(current, expectedRevision);
        }
        const next: EndgamePositionRecord = {
          ...change(current),
          updatedAt: Date.now(),
          revision: current.revision + 1,
        };
        await transaction.put(STORE_NAMES.endgamePositions, next);
        return next;
      },
    );
  }
}

/** Pure, and exported, because it is the definition of a library filter. */
export function matchesEndgameQuery(record: EndgamePositionRecord, query: EndgameQuery): boolean {
  if (query.category && record.category !== query.category) return false;
  if (query.goal && record.goal !== query.goal) return false;
  if (query.maxPieces !== undefined && record.pieceCount > query.maxPieces) return false;
  if (query.tag && !record.tags.includes(query.tag)) return false;
  return true;
}

/**
 * Pieces on the board, kings included.
 *
 * Counted from the parsed board rather than by counting letters in the FEN,
 * so a malformed FEN produces zero rather than a number that looks plausible
 * and quietly makes a seven-piece position look tablebase-eligible.
 */
export function countPieces(fen: Fen | string): number {
  const parsed = parseFen(fen);
  if (!isOk(parsed)) return 0;
  let total = 0;
  for (let index = 0; index < 64; index += 1) {
    if (parsed.value.board[index]) total += 1;
  }
  return total;
}
