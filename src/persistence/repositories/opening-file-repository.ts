/**
 * Opening files: a subject, and everything already stored about it.
 *
 * The gap this closes is organisational rather than chess-technical. A player
 * working on "Black vs 1.e4, Najdorf" has repertoire positions, two or three
 * study chapters, a handful of model games, some critical positions and a
 * training set — all correct, all findable, and all in different places. The
 * file is the one place that knows they belong together.
 *
 * Like a preparation session, it holds ids rather than copies. Unlike one, it
 * outlives a single game: a file is a standing subject, and its `positions`
 * list is the small set of positions the player considers the file to *be
 * about*, which is the only thing here that is not derivable.
 */

import { stableId } from '../ids';
import type { PersistenceDatabase } from '../indexeddb/database';
import { STORE_NAMES } from '../schema/migrations';
import type { Color, Fen, San } from '@/chess/types';
import type { OpeningFileRecord, OpeningFilePosition } from '../domain';
import { StaleOpeningFileWriteError } from '../domain';
import { assertValid, isOpeningFileRecord } from '../validation';

export interface CreateOpeningFileInput {
  readonly name: string;
  readonly color: Color;
  readonly positionKey?: string;
  readonly fen?: Fen;
  readonly eco?: string;
  readonly summary?: string;
}

export type OpeningFileReferenceField =
  'repertoireIds' | 'chapterIds' | 'modelGameLinkIds' | 'trainingItemIds' | 'reviewItemIds';

export interface OpeningFileRepository {
  list(): Promise<readonly OpeningFileRecord[]>;
  get(id: string): Promise<OpeningFileRecord | null>;
  /** Every file that names this position, for the board's own context menu. */
  forPosition(positionKey: string): Promise<readonly OpeningFileRecord[]>;
  create(input: CreateOpeningFileInput, now?: number): Promise<OpeningFileRecord>;
  update(
    id: string,
    expectedRevision: number,
    change: Partial<CreateOpeningFileInput> & { readonly notes?: string },
  ): Promise<OpeningFileRecord>;
  addReference(
    id: string,
    expectedRevision: number,
    field: OpeningFileReferenceField,
    targetId: string,
  ): Promise<OpeningFileRecord>;
  removeReference(
    id: string,
    expectedRevision: number,
    field: OpeningFileReferenceField,
    targetId: string,
  ): Promise<OpeningFileRecord>;
  addPosition(
    id: string,
    expectedRevision: number,
    position: {
      readonly positionKey: string;
      readonly fen: Fen;
      readonly line: readonly San[];
      readonly note?: string;
    },
    now?: number,
  ): Promise<OpeningFileRecord>;
  removePosition(
    id: string,
    expectedRevision: number,
    positionKey: string,
  ): Promise<OpeningFileRecord>;
  delete(id: string): Promise<void>;
}

export class LocalOpeningFileRepository implements OpeningFileRepository {
  constructor(private readonly database: PersistenceDatabase) {}

  async list(): Promise<readonly OpeningFileRecord[]> {
    const rows = await this.database.getAll<unknown>(STORE_NAMES.openingFiles);
    return rows
      .map((row) => assertValid(row, isOpeningFileRecord, 'opening file'))
      .sort((a, b) => a.color.localeCompare(b.color) || a.name.localeCompare(b.name));
  }

  async get(id: string): Promise<OpeningFileRecord | null> {
    const raw = await this.database.get<unknown>(STORE_NAMES.openingFiles, id);
    return raw === undefined ? null : assertValid(raw, isOpeningFileRecord, 'opening file');
  }

  async forPosition(positionKey: string): Promise<readonly OpeningFileRecord[]> {
    /*
      Two ways a file can be "about" a position: it is the file's root, or it
      is one of the positions the player added to it. The root is indexed; the
      list is not, because it is small and a second index on an array inside a
      record buys nothing at this size.
    */
    const files = await this.list();
    return files.filter(
      (file) =>
        file.positionKey === positionKey ||
        file.positions.some((position) => position.positionKey === positionKey),
    );
  }

  async create(input: CreateOpeningFileInput, now = Date.now()): Promise<OpeningFileRecord> {
    const name = input.name.trim();
    if (!name) throw new Error('An opening file needs a name.');
    return this.database.transaction(
      [STORE_NAMES.openingFiles],
      'readwrite',
      async (transaction) => {
        // The name index is unique; say the chess thing rather than letting
        // IndexedDB talk about constraints.
        const clash = await transaction.getAllFromIndex<unknown>(
          STORE_NAMES.openingFiles,
          'name',
          name,
        );
        if (clash.length > 0) throw new Error(`An opening file called “${name}” already exists.`);
        const record: OpeningFileRecord = {
          id: stableId('file'),
          name,
          color: input.color,
          ...optional('positionKey', input.positionKey),
          ...optional('fen', input.fen),
          ...optional('eco', input.eco),
          ...optional('summary', input.summary),
          repertoireIds: [],
          chapterIds: [],
          modelGameLinkIds: [],
          trainingItemIds: [],
          reviewItemIds: [],
          positions: [],
          createdAt: now,
          updatedAt: now,
          revision: 0,
        };
        await transaction.put(STORE_NAMES.openingFiles, record);
        return record;
      },
    );
  }

  update(
    id: string,
    expectedRevision: number,
    change: Partial<CreateOpeningFileInput> & { readonly notes?: string },
  ): Promise<OpeningFileRecord> {
    return this.write(id, expectedRevision, (current) => ({
      ...current,
      ...(change.name !== undefined ? { name: change.name.trim() || current.name } : {}),
      ...(change.color !== undefined ? { color: change.color } : {}),
      ...(change.eco !== undefined ? { eco: change.eco } : {}),
      ...(change.summary !== undefined ? { summary: change.summary } : {}),
      ...(change.notes !== undefined ? { notes: change.notes } : {}),
    }));
  }

  addReference(
    id: string,
    expectedRevision: number,
    field: OpeningFileReferenceField,
    targetId: string,
  ): Promise<OpeningFileRecord> {
    return this.write(id, expectedRevision, (current) => ({
      ...current,
      [field]: [...new Set([...current[field], targetId])],
    }));
  }

  removeReference(
    id: string,
    expectedRevision: number,
    field: OpeningFileReferenceField,
    targetId: string,
  ): Promise<OpeningFileRecord> {
    return this.write(id, expectedRevision, (current) => ({
      ...current,
      [field]: current[field].filter((value) => value !== targetId),
    }));
  }

  addPosition(
    id: string,
    expectedRevision: number,
    position: {
      readonly positionKey: string;
      readonly fen: Fen;
      readonly line: readonly San[];
      readonly note?: string;
    },
    now = Date.now(),
  ): Promise<OpeningFileRecord> {
    return this.write(id, expectedRevision, (current) => {
      if (current.positions.some((entry) => entry.positionKey === position.positionKey)) {
        return current;
      }
      const next: OpeningFilePosition = {
        positionKey: position.positionKey,
        fen: position.fen,
        line: [...position.line],
        ...optional('note', position.note),
        addedAt: now,
      };
      return { ...current, positions: [...current.positions, next] };
    });
  }

  removePosition(
    id: string,
    expectedRevision: number,
    positionKey: string,
  ): Promise<OpeningFileRecord> {
    return this.write(id, expectedRevision, (current) => ({
      ...current,
      positions: current.positions.filter((entry) => entry.positionKey !== positionKey),
    }));
  }

  async delete(id: string): Promise<void> {
    await this.database.delete(STORE_NAMES.openingFiles, id);
  }

  private write(
    id: string,
    expectedRevision: number,
    change: (current: OpeningFileRecord) => OpeningFileRecord,
  ): Promise<OpeningFileRecord> {
    return this.database.transaction(
      [STORE_NAMES.openingFiles],
      'readwrite',
      async (transaction) => {
        const raw = await transaction.get<unknown>(STORE_NAMES.openingFiles, id);
        if (raw === undefined) throw new Error('That opening file no longer exists.');
        const current = assertValid(raw, isOpeningFileRecord, 'opening file');
        if (current.revision !== expectedRevision) {
          throw new StaleOpeningFileWriteError(current, expectedRevision);
        }
        const next: OpeningFileRecord = {
          ...change(current),
          updatedAt: Date.now(),
          revision: current.revision + 1,
        };
        await transaction.put(STORE_NAMES.openingFiles, next);
        return next;
      },
    );
  }
}

const optional = <K extends string, V>(key: K, value: V | undefined) =>
  value === undefined || value === '' ? {} : ({ [key]: value } as Record<K, V>);
