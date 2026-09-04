/**
 * Player identities: the links the user has explicitly made.
 *
 * The rule this repository exists to enforce is a negative one. It never
 * creates a record, never merges two names, and never guesses that an online
 * username belongs to a database name. Every one of those is an assertion about
 * a person, and getting it wrong produces a profile that mixes two careers
 * together and looks entirely plausible while doing it.
 *
 * What it does is remember an assertion somebody made, and refuse to let one
 * alias belong to two identities — because that ambiguity would make "whose
 * games are these" unanswerable rather than merely unknown.
 */

import type { PersistenceDatabase } from '../indexeddb/database';
import { playerKey, STORE_NAMES } from '../schema/migrations';
import type { PlayerIdentityRecord } from '../domain';
import { assertValid, isPlayerIdentityRecord } from '../validation';

export interface PlayerIdentityInput {
  readonly name: string;
  readonly fideId?: string;
  readonly fideName?: string;
  readonly lichessUsername?: string;
  readonly chessComUsername?: string;
  readonly note?: string;
}

export interface PlayerIdentityRepository {
  list(): Promise<readonly PlayerIdentityRecord[]>;
  get(id: string): Promise<PlayerIdentityRecord | null>;
  /** The identity that claims this name, if any user has claimed it. */
  findByAlias(name: string): Promise<PlayerIdentityRecord | null>;
  /** Create or update the identity for a primary name. */
  upsert(input: PlayerIdentityInput, now?: number): Promise<PlayerIdentityRecord>;
  linkAlias(id: string, alias: string, now?: number): Promise<PlayerIdentityRecord>;
  unlinkAlias(id: string, alias: string, now?: number): Promise<PlayerIdentityRecord>;
  setFavorite(id: string, favorite: boolean, now?: number): Promise<PlayerIdentityRecord>;
  delete(id: string): Promise<void>;
}

export class LocalPlayerIdentityRepository implements PlayerIdentityRepository {
  constructor(private readonly database: PersistenceDatabase) {}

  async list(): Promise<readonly PlayerIdentityRecord[]> {
    const records = await this.database.getAll<unknown>(STORE_NAMES.playerIdentities);
    return records
      .map((record) => assertValid(record, isPlayerIdentityRecord, 'player identity'))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(id: string): Promise<PlayerIdentityRecord | null> {
    const record = await this.database.get<unknown>(STORE_NAMES.playerIdentities, id);
    return record === undefined
      ? null
      : assertValid(record, isPlayerIdentityRecord, 'player identity');
  }

  async findByAlias(name: string): Promise<PlayerIdentityRecord | null> {
    const key = playerKey(name);
    if (!key) return null;
    const matches = await this.database.getAllFromIndex<unknown>(
      STORE_NAMES.playerIdentities,
      'aliases',
      key,
    );
    const first = matches[0];
    return first === undefined
      ? null
      : assertValid(first, isPlayerIdentityRecord, 'player identity');
  }

  async upsert(input: PlayerIdentityInput, now = Date.now()): Promise<PlayerIdentityRecord> {
    const name = input.name.trim();
    const key = playerKey(name);
    if (!key) throw new Error('A player identity needs a name.');
    const existing = (await this.get(key)) ?? (await this.findByAlias(name));

    const record: PlayerIdentityRecord = {
      id: existing?.id ?? key,
      name: name || existing?.name || key,
      aliases: existing?.aliases ?? [name],
      aliasKeys: existing?.aliasKeys ?? [key],
      ...(existing?.favorite !== undefined ? { favorite: existing.favorite } : {}),
      ...optional('fideId', input.fideId, existing?.fideId),
      ...optional('fideName', input.fideName, existing?.fideName),
      ...optional('lichessUsername', input.lichessUsername, existing?.lichessUsername),
      ...optional('chessComUsername', input.chessComUsername, existing?.chessComUsername),
      ...optional('note', input.note, existing?.note),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await this.database.put(STORE_NAMES.playerIdentities, record);
    return record;
  }

  /**
   * Add another name to this identity.
   *
   * Refused if a different identity already claims that name. Silently moving
   * an alias would make one user action change two profiles, only one of which
   * they were looking at.
   */
  async linkAlias(id: string, alias: string, now = Date.now()): Promise<PlayerIdentityRecord> {
    const record = await this.get(id);
    if (!record) throw new Error('That player identity no longer exists.');
    const name = alias.trim();
    const key = playerKey(name);
    if (!key) throw new Error('That alias is empty.');
    if (record.aliasKeys.includes(key)) return record;

    const owner = await this.findByAlias(name);
    if (owner && owner.id !== id) {
      throw new Error(`“${name}” is already linked to ${owner.name}.`);
    }

    const next: PlayerIdentityRecord = {
      ...record,
      aliases: [...record.aliases, name],
      aliasKeys: [...record.aliasKeys, key],
      updatedAt: now,
    };
    await this.database.put(STORE_NAMES.playerIdentities, next);
    return next;
  }

  /** Remove an alias. The primary name cannot be unlinked from itself. */
  async unlinkAlias(id: string, alias: string, now = Date.now()): Promise<PlayerIdentityRecord> {
    const record = await this.get(id);
    if (!record) throw new Error('That player identity no longer exists.');
    const key = playerKey(alias);
    if (key === record.id) {
      throw new Error('The primary name cannot be unlinked. Delete the identity instead.');
    }
    const index = record.aliasKeys.indexOf(key);
    if (index === -1) return record;

    const next: PlayerIdentityRecord = {
      ...record,
      aliases: record.aliases.filter((_, position) => position !== index),
      aliasKeys: record.aliasKeys.filter((_, position) => position !== index),
      updatedAt: now,
    };
    await this.database.put(STORE_NAMES.playerIdentities, next);
    return next;
  }

  async setFavorite(
    id: string,
    favorite: boolean,
    now = Date.now(),
  ): Promise<PlayerIdentityRecord> {
    const record = await this.get(id);
    if (!record) throw new Error('That player identity no longer exists.');
    const next: PlayerIdentityRecord = { ...record, favorite, updatedAt: now };
    await this.database.put(STORE_NAMES.playerIdentities, next);
    return next;
  }

  async delete(id: string): Promise<void> {
    await this.database.delete(STORE_NAMES.playerIdentities, id);
  }
}

/**
 * Apply an optional field, distinguishing "cleared" from "not mentioned".
 *
 * An empty string means the user emptied the box and the field should go; an
 * `undefined` means this call is not about that field and whatever was there
 * stays. Collapsing the two would make editing a FIDE id wipe a Lichess name.
 */
function optional<K extends string>(
  field: K,
  next: string | undefined,
  current: string | undefined,
): Record<K, string> | Record<string, never> {
  if (next === undefined) return current === undefined ? {} : ({ [field]: current } as never);
  const trimmed = next.trim();
  return trimmed ? ({ [field]: trimmed } as never) : {};
}
