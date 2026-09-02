/**
 * Repertoire storage.
 *
 * Positions are keyed by `[repertoireId, positionKey]`, unique, which is what
 * makes transposition convergence a property of the schema rather than of the
 * code that writes to it: there is physically nowhere to put a second entry for
 * the same position in the same repertoire.
 */

import { positionKey as canonicalKey } from '@/chess/fen';
import type { Fen } from '@/chess/types';

import { stableId } from '../ids';
import { STORE_NAMES } from '../schema/migrations';
import type { PersistenceDatabase } from '../indexeddb/database';
import type {
  PositionKey,
  RepertoireId,
  RepertoireMove,
  RepertoirePositionRecord,
  RepertoireRecord,
  RepertoireWithPositions,
} from '../domain';
import { StaleRepertoirePositionWriteError } from '../domain';
import { assertValid, isRepertoirePositionRecord, isRepertoireRecord } from '../validation';

export interface CreateRepertoireInput {
  readonly title: string;
  readonly color: 'w' | 'b';
  readonly description?: string;
}

export interface UpsertPositionInput {
  readonly repertoireId: RepertoireId;
  readonly fen: Fen;
  readonly sideToMove: 'w' | 'b';
  readonly depth: number;
  readonly moves: readonly RepertoireMove[];
  readonly note?: string;
  /** Required when this canonical position already exists. */
  readonly expectedRevision?: number;
}

export interface RepertoireRepository {
  list(): Promise<readonly RepertoireRecord[]>;
  get(id: RepertoireId): Promise<RepertoireWithPositions | null>;
  create(input: CreateRepertoireInput): Promise<RepertoireRecord>;
  update(
    id: RepertoireId,
    update: { title?: string; description?: string },
  ): Promise<RepertoireRecord>;
  delete(id: RepertoireId): Promise<void>;
  /** Add or merge moves at a position. Returns the stored entry. */
  upsertPosition(input: UpsertPositionInput): Promise<RepertoirePositionRecord>;
  getPosition(
    repertoireId: RepertoireId,
    key: PositionKey,
  ): Promise<RepertoirePositionRecord | null>;
  /** Every repertoire that says something about this position. */
  findByPosition(key: PositionKey): Promise<readonly RepertoirePositionRecord[]>;
  deletePosition(id: string, expectedRevision: number): Promise<void>;
  removeMove(positionId: string, uci: string, expectedRevision: number): Promise<void>;
}

export class LocalRepertoireRepository implements RepertoireRepository {
  constructor(private readonly database: PersistenceDatabase) {}

  async list(): Promise<readonly RepertoireRecord[]> {
    const records = await this.database.getAll<unknown>(STORE_NAMES.repertoires);
    const repertoires = records.map((record) =>
      assertValid(record, isRepertoireRecord, 'repertoire'),
    );
    return repertoires.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(id: RepertoireId): Promise<RepertoireWithPositions | null> {
    const raw = await this.database.get<unknown>(STORE_NAMES.repertoires, id);
    if (raw === undefined) return null;
    const repertoire = assertValid(raw, isRepertoireRecord, 'repertoire');
    const positions: RepertoirePositionRecord[] = (
      await this.database.getAllFromIndex<unknown>(
        STORE_NAMES.repertoirePositions,
        'repertoireId',
        id,
      )
    ).map((record) => assertValid(record, isRepertoirePositionRecord, 'repertoire position'));
    positions.sort((a, b) => a.depth - b.depth || a.createdAt - b.createdAt);
    return { repertoire, positions };
  }

  async create(input: CreateRepertoireInput): Promise<RepertoireRecord> {
    const now = Date.now();
    const repertoire: RepertoireRecord = {
      id: stableId('rep'),
      title: input.title.trim() || 'Untitled repertoire',
      color: input.color,
      ...(input.description?.trim() ? { description: input.description.trim() } : {}),
      createdAt: now,
      updatedAt: now,
    };
    await this.database.put(STORE_NAMES.repertoires, repertoire);
    return repertoire;
  }

  async update(
    id: RepertoireId,
    update: { title?: string; description?: string },
  ): Promise<RepertoireRecord> {
    const raw = await this.database.get<unknown>(STORE_NAMES.repertoires, id);
    if (raw === undefined) throw new Error('That repertoire no longer exists.');
    const current = assertValid(raw, isRepertoireRecord, 'repertoire');
    const next: RepertoireRecord = {
      ...current,
      ...(update.title !== undefined
        ? { title: update.title.trim() || 'Untitled repertoire' }
        : {}),
      ...(update.description !== undefined
        ? update.description.trim()
          ? { description: update.description.trim() }
          : { description: undefined }
        : {}),
      updatedAt: Date.now(),
    };
    await this.database.put(STORE_NAMES.repertoires, next);
    return next;
  }

  async delete(id: RepertoireId): Promise<void> {
    await this.database.transaction(
      [STORE_NAMES.repertoires, STORE_NAMES.repertoirePositions],
      'readwrite',
      async (transaction) => {
        const positions = await transaction.getAllFromIndex<RepertoirePositionRecord>(
          STORE_NAMES.repertoirePositions,
          'repertoireId',
          id,
        );
        for (const position of positions) {
          await transaction.delete(STORE_NAMES.repertoirePositions, position.id);
        }
        await transaction.delete(STORE_NAMES.repertoires, id);
      },
    );
  }

  /**
   * Merge moves into the entry for a position, creating it if needed.
   *
   * The read and the write share one transaction so two rapid additions from
   * the same line cannot both read an empty entry and race to create it.
   */
  async upsertPosition(input: UpsertPositionInput): Promise<RepertoirePositionRecord> {
    const key = canonicalKey(input.fen);
    const now = Date.now();

    return this.database.transaction(
      [STORE_NAMES.repertoires, STORE_NAMES.repertoirePositions],
      'readwrite',
      async (transaction) => {
        const repertoire = await transaction.get<RepertoireRecord>(
          STORE_NAMES.repertoires,
          input.repertoireId,
        );
        if (!repertoire) throw new Error('That repertoire no longer exists.');

        const matches = await transaction.getAllFromIndex<RepertoirePositionRecord>(
          STORE_NAMES.repertoirePositions,
          'repertoirePosition',
          [input.repertoireId, key],
        );
        const existing = matches[0];
        if (existing && existing.revision !== input.expectedRevision) {
          throw new StaleRepertoirePositionWriteError(existing, input.expectedRevision);
        }

        /*
          The store stamps the time, not the caller. Callers build moves while
          rendering a preview or replaying a line, and a timestamp read there is
          both impure and wrong — what `updatedAt` should mean is when the
          decision was written down, which only this transaction knows.
        */
        const merged = existing ? [...existing.moves] : [];
        for (const move of input.moves) {
          const stamped = { ...move, updatedAt: now };
          const at = merged.findIndex((candidate) => candidate.uci === move.uci);
          if (at < 0) merged.push(stamped);
          else merged[at] = { ...merged[at], ...stamped };
        }

        const record: RepertoirePositionRecord = {
          id: existing?.id ?? stableId('repos'),
          repertoireId: input.repertoireId,
          positionKey: key,
          fen: existing?.fen ?? input.fen,
          sideToMove: input.sideToMove,
          moves: merged,
          // The shallowest route to a position is the one worth reporting.
          depth: existing ? Math.min(existing.depth, input.depth) : input.depth,
          ...(input.note !== undefined
            ? input.note.trim()
              ? { note: input.note.trim() }
              : {}
            : existing?.note
              ? { note: existing.note }
              : {}),
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          revision: existing ? existing.revision + 1 : 0,
        };

        await transaction.put(STORE_NAMES.repertoirePositions, record);
        await transaction.put(STORE_NAMES.repertoires, { ...repertoire, updatedAt: now });
        return record;
      },
    );
  }

  async getPosition(
    repertoireId: RepertoireId,
    key: PositionKey,
  ): Promise<RepertoirePositionRecord | null> {
    const matches = await this.database.getAllFromIndex<unknown>(
      STORE_NAMES.repertoirePositions,
      'repertoirePosition',
      [repertoireId, key],
    );
    const first = matches[0];
    return first === undefined
      ? null
      : assertValid(first, isRepertoirePositionRecord, 'repertoire position');
  }

  async findByPosition(key: PositionKey): Promise<readonly RepertoirePositionRecord[]> {
    const matches = await this.database.getAllFromIndex<unknown>(
      STORE_NAMES.repertoirePositions,
      'positionKey',
      key,
    );
    return matches.map((record) =>
      assertValid(record, isRepertoirePositionRecord, 'repertoire position'),
    );
  }

  async deletePosition(id: string, expectedRevision: number): Promise<void> {
    await this.database.transaction(
      [STORE_NAMES.repertoirePositions],
      'readwrite',
      async (transaction) => {
        const raw = await transaction.get<unknown>(STORE_NAMES.repertoirePositions, id);
        if (raw === undefined) return;
        const position = assertValid(raw, isRepertoirePositionRecord, 'repertoire position');
        if (position.revision !== expectedRevision) {
          throw new StaleRepertoirePositionWriteError(position, expectedRevision);
        }
        await transaction.delete(STORE_NAMES.repertoirePositions, id);
      },
    );
  }

  async removeMove(positionId: string, uci: string, expectedRevision: number): Promise<void> {
    await this.database.transaction(
      [STORE_NAMES.repertoirePositions],
      'readwrite',
      async (transaction) => {
        const raw = await transaction.get<unknown>(STORE_NAMES.repertoirePositions, positionId);
        if (raw === undefined) return;
        const position = assertValid(raw, isRepertoirePositionRecord, 'repertoire position');
        if (position.revision !== expectedRevision) {
          throw new StaleRepertoirePositionWriteError(position, expectedRevision);
        }
        const moves = position.moves.filter((move) => move.uci !== uci);
        // An entry with nothing left to say is removed rather than kept as a stub.
        if (moves.length === 0) {
          await transaction.delete(STORE_NAMES.repertoirePositions, positionId);
          return;
        }
        await transaction.put(STORE_NAMES.repertoirePositions, {
          ...position,
          moves,
          updatedAt: Date.now(),
          revision: position.revision + 1,
        });
      },
    );
  }
}
