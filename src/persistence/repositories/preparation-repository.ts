/**
 * Tournament preparation sessions and the game-day sheet.
 *
 * A session is a frame around work that already exists. The opponent's games
 * are in the collection, the lines are in a repertoire, the model games are
 * linked, the critical positions are in the review queue — so a session holds
 * ids, and a session that is opened a week later shows whatever those ids point
 * at *now*. That is the whole reason it is not a folder of copies.
 *
 * The one thing it owns outright is the sheet, because curation cannot be
 * derived: which eight positions matter on the morning of round six is a
 * judgement, and no amount of database evidence produces it.
 */

import { stableId } from '../ids';
import type { PersistenceDatabase } from '../indexeddb/database';
import { STORE_NAMES, playerKey } from '../schema/migrations';
import type { Color, Fen, San } from '@/chess/types';
import type { PreparationSessionRecord, PreparationSheetCard } from '../domain';
import { StalePreparationSessionWriteError } from '../domain';
import { assertValid, isPreparationSessionRecord } from '../validation';

export interface CreatePreparationSessionInput {
  readonly title: string;
  readonly opponent?: string;
  readonly myColor: Color;
  readonly event?: string;
  readonly round?: string;
  readonly gameDate?: string;
}

/** Everything on a session that is a reference to work stored elsewhere. */
export type PreparationReferenceField =
  'repertoireIds' | 'studyIds' | 'openingFileIds' | 'modelGameLinkIds' | 'reviewItemIds';

export interface AddSheetCardInput {
  readonly positionKey: string;
  readonly fen: Fen;
  readonly line: readonly San[];
  readonly why?: string;
  readonly intendedSan?: string;
  readonly note?: string;
  readonly source?: PreparationSheetCard['source'];
}

export interface PreparationRepository {
  list(): Promise<readonly PreparationSessionRecord[]>;
  get(id: string): Promise<PreparationSessionRecord | null>;
  /** Sessions against one opponent, newest first, for the player profile. */
  forOpponent(name: string): Promise<readonly PreparationSessionRecord[]>;
  create(input: CreatePreparationSessionInput, now?: number): Promise<PreparationSessionRecord>;
  update(
    id: string,
    expectedRevision: number,
    change: Partial<CreatePreparationSessionInput> & { readonly notes?: string },
  ): Promise<PreparationSessionRecord>;
  addReference(
    id: string,
    expectedRevision: number,
    field: PreparationReferenceField,
    targetId: string,
  ): Promise<PreparationSessionRecord>;
  removeReference(
    id: string,
    expectedRevision: number,
    field: PreparationReferenceField,
    targetId: string,
  ): Promise<PreparationSessionRecord>;
  addSheetCard(
    id: string,
    expectedRevision: number,
    card: AddSheetCardInput,
    now?: number,
  ): Promise<PreparationSessionRecord>;
  updateSheetCard(
    id: string,
    expectedRevision: number,
    cardId: string,
    change: Partial<Omit<PreparationSheetCard, 'id' | 'createdAt'>>,
  ): Promise<PreparationSessionRecord>;
  removeSheetCard(
    id: string,
    expectedRevision: number,
    cardId: string,
  ): Promise<PreparationSessionRecord>;
  /** Reorder the sheet; the printed order is the order it is read in. */
  moveSheetCard(
    id: string,
    expectedRevision: number,
    cardId: string,
    toIndex: number,
  ): Promise<PreparationSessionRecord>;
  delete(id: string): Promise<void>;
}

export class LocalPreparationRepository implements PreparationRepository {
  constructor(private readonly database: PersistenceDatabase) {}

  async list(): Promise<readonly PreparationSessionRecord[]> {
    const rows = await this.database.getAll<unknown>(STORE_NAMES.preparationSessions);
    return rows
      .map((row) => assertValid(row, isPreparationSessionRecord, 'preparation session'))
      .sort(byRoundThenRecency);
  }

  async get(id: string): Promise<PreparationSessionRecord | null> {
    const raw = await this.database.get<unknown>(STORE_NAMES.preparationSessions, id);
    return raw === undefined
      ? null
      : assertValid(raw, isPreparationSessionRecord, 'preparation session');
  }

  async forOpponent(name: string): Promise<readonly PreparationSessionRecord[]> {
    const key = playerKey(name);
    if (!key) return [];
    const rows = await this.database.getAllFromIndex<unknown>(
      STORE_NAMES.preparationSessions,
      'opponentKey',
      key,
    );
    return rows
      .map((row) => assertValid(row, isPreparationSessionRecord, 'preparation session'))
      .sort(byRoundThenRecency);
  }

  async create(
    input: CreatePreparationSessionInput,
    now = Date.now(),
  ): Promise<PreparationSessionRecord> {
    const title = input.title.trim();
    if (!title) throw new Error('A preparation session needs a title.');
    const opponent = input.opponent?.trim();
    const record: PreparationSessionRecord = {
      id: stableId('prep'),
      title,
      ...(opponent ? { opponent, opponentKey: playerKey(opponent) } : {}),
      myColor: input.myColor,
      ...optional('event', input.event),
      ...optional('round', input.round),
      ...optional('gameDate', input.gameDate),
      repertoireIds: [],
      studyIds: [],
      openingFileIds: [],
      modelGameLinkIds: [],
      reviewItemIds: [],
      sheet: [],
      createdAt: now,
      updatedAt: now,
      revision: 0,
    };
    await this.database.put(STORE_NAMES.preparationSessions, record);
    return record;
  }

  update(
    id: string,
    expectedRevision: number,
    change: Partial<CreatePreparationSessionInput> & { readonly notes?: string },
  ): Promise<PreparationSessionRecord> {
    return this.write(id, expectedRevision, (current) => {
      const opponent = change.opponent?.trim();
      return {
        ...current,
        ...(change.title !== undefined ? { title: change.title.trim() || current.title } : {}),
        ...(change.opponent !== undefined
          ? opponent
            ? { opponent, opponentKey: playerKey(opponent) }
            : { opponent: undefined, opponentKey: undefined }
          : {}),
        ...(change.myColor !== undefined ? { myColor: change.myColor } : {}),
        ...(change.event !== undefined ? { event: change.event } : {}),
        ...(change.round !== undefined ? { round: change.round } : {}),
        ...(change.gameDate !== undefined ? { gameDate: change.gameDate } : {}),
        ...(change.notes !== undefined ? { notes: change.notes } : {}),
      };
    });
  }

  addReference(
    id: string,
    expectedRevision: number,
    field: PreparationReferenceField,
    targetId: string,
  ): Promise<PreparationSessionRecord> {
    return this.write(id, expectedRevision, (current) => ({
      ...current,
      [field]: [...new Set([...current[field], targetId])],
    }));
  }

  removeReference(
    id: string,
    expectedRevision: number,
    field: PreparationReferenceField,
    targetId: string,
  ): Promise<PreparationSessionRecord> {
    return this.write(id, expectedRevision, (current) => ({
      ...current,
      [field]: current[field].filter((value) => value !== targetId),
    }));
  }

  addSheetCard(
    id: string,
    expectedRevision: number,
    card: AddSheetCardInput,
    now = Date.now(),
  ): Promise<PreparationSessionRecord> {
    return this.write(id, expectedRevision, (current) => {
      /*
        The same position added twice is almost always a slip rather than an
        intention, and a sheet with a line printed on it twice reads as
        careless at exactly the moment it is being trusted.
      */
      if (current.sheet.some((existing) => existing.positionKey === card.positionKey)) {
        throw new Error('That position is already on the game-day sheet.');
      }
      const next: PreparationSheetCard = {
        id: stableId('card'),
        positionKey: card.positionKey,
        fen: card.fen,
        line: [...card.line],
        ...optional('why', card.why),
        ...optional('intendedSan', card.intendedSan),
        ...optional('note', card.note),
        ...optional('source', card.source),
        createdAt: now,
      };
      return { ...current, sheet: [...current.sheet, next] };
    });
  }

  updateSheetCard(
    id: string,
    expectedRevision: number,
    cardId: string,
    change: Partial<Omit<PreparationSheetCard, 'id' | 'createdAt'>>,
  ): Promise<PreparationSessionRecord> {
    return this.write(id, expectedRevision, (current) => ({
      ...current,
      sheet: current.sheet.map((card) => (card.id === cardId ? { ...card, ...change } : card)),
    }));
  }

  removeSheetCard(
    id: string,
    expectedRevision: number,
    cardId: string,
  ): Promise<PreparationSessionRecord> {
    return this.write(id, expectedRevision, (current) => ({
      ...current,
      sheet: current.sheet.filter((card) => card.id !== cardId),
    }));
  }

  moveSheetCard(
    id: string,
    expectedRevision: number,
    cardId: string,
    toIndex: number,
  ): Promise<PreparationSessionRecord> {
    return this.write(id, expectedRevision, (current) => {
      const from = current.sheet.findIndex((card) => card.id === cardId);
      if (from < 0) return current;
      const sheet = [...current.sheet];
      const [card] = sheet.splice(from, 1);
      if (!card) return current;
      sheet.splice(Math.max(0, Math.min(toIndex, sheet.length)), 0, card);
      return { ...current, sheet };
    });
  }

  async delete(id: string): Promise<void> {
    // The session goes; everything it referenced is other people's work.
    await this.database.delete(STORE_NAMES.preparationSessions, id);
  }

  private write(
    id: string,
    expectedRevision: number,
    change: (current: PreparationSessionRecord) => PreparationSessionRecord,
  ): Promise<PreparationSessionRecord> {
    return this.database.transaction(
      [STORE_NAMES.preparationSessions],
      'readwrite',
      async (transaction) => {
        const raw = await transaction.get<unknown>(STORE_NAMES.preparationSessions, id);
        if (raw === undefined) throw new Error('That preparation session no longer exists.');
        const current = assertValid(raw, isPreparationSessionRecord, 'preparation session');
        if (current.revision !== expectedRevision) {
          throw new StalePreparationSessionWriteError(current, expectedRevision);
        }
        const next: PreparationSessionRecord = {
          ...change(current),
          updatedAt: Date.now(),
          revision: current.revision + 1,
        };
        await transaction.put(STORE_NAMES.preparationSessions, next);
        return next;
      },
    );
  }
}

/**
 * Upcoming rounds first, then most recently touched.
 *
 * A player opening this list is almost always looking for the next game, not
 * the last one, and a session with a date is more likely to be the next game
 * than one without.
 */
function byRoundThenRecency(a: PreparationSessionRecord, b: PreparationSessionRecord): number {
  if (a.gameDate && b.gameDate && a.gameDate !== b.gameDate) {
    return a.gameDate.localeCompare(b.gameDate);
  }
  if (a.gameDate && !b.gameDate) return -1;
  if (!a.gameDate && b.gameDate) return 1;
  return b.updatedAt - a.updatedAt;
}

const optional = <K extends string, V>(key: K, value: V | undefined) =>
  value === undefined || value === '' ? {} : ({ [key]: value } as Record<K, V>);
