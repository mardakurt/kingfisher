/**
 * Model-game links and the user's own profile.
 *
 * Both are small stores of references rather than content: a link points at a
 * game that already exists, and a profile names the user in games that already
 * exist. Nothing here duplicates a game record, so annotating a game once
 * improves every place it is referenced from.
 */

import { stableId } from '../ids';
import { STORE_NAMES } from '../schema/migrations';
import type { PersistenceDatabase } from '../indexeddb/database';
import type { ModelGameLinkId, ModelGameLinkRecord, UserProfileRecord } from '../domain';
import { EMPTY_PROFILE } from '../domain';
import { assertValid, isModelGameLinkRecord, isUserProfileRecord } from '../validation';

export type CreateModelGameLinkInput = Omit<ModelGameLinkRecord, 'id' | 'createdAt'>;

export interface ModelGameRepository {
  list(): Promise<readonly ModelGameLinkRecord[]>;
  forPosition(positionKey: string): Promise<readonly ModelGameLinkRecord[]>;
  forGame(gameId: string): Promise<readonly ModelGameLinkRecord[]>;
  forStudy(studyId: string): Promise<readonly ModelGameLinkRecord[]>;
  forRepertoire(repertoireId: string): Promise<readonly ModelGameLinkRecord[]>;
  create(input: CreateModelGameLinkInput): Promise<ModelGameLinkRecord>;
  update(link: ModelGameLinkRecord): Promise<ModelGameLinkRecord>;
  delete(id: ModelGameLinkId): Promise<void>;
}

export class LocalModelGameRepository implements ModelGameRepository {
  constructor(private readonly database: PersistenceDatabase) {}

  private async byIndex(index: string, key: string): Promise<readonly ModelGameLinkRecord[]> {
    const records = await this.database.getAllFromIndex<unknown>(
      STORE_NAMES.modelGameLinks,
      index,
      key,
    );
    const links = records.map((record) =>
      assertValid(record, isModelGameLinkRecord, 'model game link'),
    );
    return links.sort((a, b) => b.createdAt - a.createdAt);
  }

  async list(): Promise<readonly ModelGameLinkRecord[]> {
    const records = await this.database.getAll<unknown>(STORE_NAMES.modelGameLinks);
    const links = records.map((record) =>
      assertValid(record, isModelGameLinkRecord, 'model game link'),
    );
    return links.sort((a, b) => b.createdAt - a.createdAt);
  }

  forPosition(positionKey: string) {
    return this.byIndex('positionKey', positionKey);
  }
  forGame(gameId: string) {
    return this.byIndex('gameId', gameId);
  }
  forStudy(studyId: string) {
    return this.byIndex('studyId', studyId);
  }
  forRepertoire(repertoireId: string) {
    return this.byIndex('repertoireId', repertoireId);
  }

  async create(input: CreateModelGameLinkInput): Promise<ModelGameLinkRecord> {
    const link: ModelGameLinkRecord = { ...input, id: stableId('model'), createdAt: Date.now() };
    await this.database.put(STORE_NAMES.modelGameLinks, link);
    return link;
  }

  async update(link: ModelGameLinkRecord): Promise<ModelGameLinkRecord> {
    await this.database.put(STORE_NAMES.modelGameLinks, link);
    return link;
  }

  async delete(id: ModelGameLinkId): Promise<void> {
    await this.database.delete(STORE_NAMES.modelGameLinks, id);
  }
}

export interface ProfileRepository {
  get(): Promise<UserProfileRecord>;
  setAliases(aliases: readonly string[]): Promise<UserProfileRecord>;
}

export class LocalProfileRepository implements ProfileRepository {
  constructor(private readonly database: PersistenceDatabase) {}

  async get(): Promise<UserProfileRecord> {
    const raw = await this.database.get<unknown>(STORE_NAMES.profile, 'me');
    if (raw === undefined) return EMPTY_PROFILE;
    return assertValid(raw, isUserProfileRecord, 'profile');
  }

  /** Blank entries are dropped: an empty alias would match every game. */
  async setAliases(aliases: readonly string[]): Promise<UserProfileRecord> {
    const cleaned = [...new Set(aliases.map((alias) => alias.trim()).filter(Boolean))];
    const profile: UserProfileRecord = { id: 'me', aliases: cleaned, updatedAt: Date.now() };
    await this.database.put(STORE_NAMES.profile, profile);
    return profile;
  }
}
