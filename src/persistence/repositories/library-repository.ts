/**
 * Model-game links and the user's own profile.
 *
 * Both are small stores of references rather than content: a link points at a
 * game that already exists, and a profile names the user in games that already
 * exist. Nothing here duplicates a game record, so annotating a game once
 * improves every place it is referenced from.
 */

import { stableId } from '../ids';
import { STORE_NAMES, playerKey } from '../schema/migrations';
import type { PersistenceDatabase } from '../indexeddb/database';
import type {
  FavoritePlayer,
  ModelGameLinkId,
  ModelGameLinkRecord,
  UserProfileRecord,
} from '../domain';
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
  /** Improvement themes the player invented; returns the full list. */
  addCustomTheme(theme: string): Promise<readonly string[]>;
  removeCustomTheme(theme: string): Promise<readonly string[]>;
  /**
   * Players kept one keystroke away.
   *
   * A coach's students, a team, the three people you keep being paired with.
   * Stored under the normalized key so a favourite matches the same games the
   * preparation search does, and carrying the name as typed so the list reads
   * the way the user wrote it.
   */
  addFavoritePlayer(name: string, note?: string): Promise<readonly FavoritePlayer[]>;
  removeFavoritePlayer(key: string): Promise<readonly FavoritePlayer[]>;
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
    const current = await this.get();
    const cleaned = [...new Set(aliases.map((alias) => alias.trim()).filter(Boolean))];
    const profile: UserProfileRecord = {
      id: 'me',
      aliases: cleaned,
      customThemes: current.customThemes ?? [],
      updatedAt: Date.now(),
    };
    await this.database.put(STORE_NAMES.profile, profile);
    return profile;
  }

  /*
    Slugged the same way the review repository normalises themes, so a tag
    typed as "Trade Decision" and one typed as "trade decision" are the same
    tag rather than two entries the summary counts separately.
  */
  async addCustomTheme(theme: string): Promise<readonly string[]> {
    const slug = theme.trim().toLowerCase().replace(/\s+/g, '-');
    if (!slug) return (await this.get()).customThemes ?? [];
    const current = await this.get();
    const themes = current.customThemes ?? [];
    if (themes.includes(slug)) return themes;
    const next = [...themes, slug];
    await this.database.put(STORE_NAMES.profile, {
      ...current,
      id: 'me' as const,
      customThemes: next,
      updatedAt: Date.now(),
    });
    return next;
  }

  async addFavoritePlayer(name: string, note?: string): Promise<readonly FavoritePlayer[]> {
    const trimmed = name.trim();
    if (!trimmed) return (await this.get()).favoritePlayers ?? [];
    const key = playerKey(trimmed);
    const current = await this.get();
    const favorites = current.favoritePlayers ?? [];
    // Re-adding an existing favourite updates its note rather than duplicating
    // a player under two spellings of the same name.
    const next: FavoritePlayer[] = favorites.some((entry) => entry.key === key)
      ? favorites.map((entry) =>
          entry.key === key ? { ...entry, name: trimmed, ...(note ? { note } : {}) } : entry,
        )
      : [...favorites, { key, name: trimmed, ...(note ? { note } : {}), addedAt: Date.now() }];
    await this.database.put(STORE_NAMES.profile, {
      ...current,
      id: 'me' as const,
      favoritePlayers: next,
      updatedAt: Date.now(),
    });
    return next;
  }

  async removeFavoritePlayer(key: string): Promise<readonly FavoritePlayer[]> {
    const current = await this.get();
    const next = (current.favoritePlayers ?? []).filter((entry) => entry.key !== key);
    await this.database.put(STORE_NAMES.profile, {
      ...current,
      id: 'me' as const,
      favoritePlayers: next,
      updatedAt: Date.now(),
    });
    return next;
  }

  async removeCustomTheme(theme: string): Promise<readonly string[]> {
    const current = await this.get();
    const next = (current.customThemes ?? []).filter((entry) => entry !== theme);
    await this.database.put(STORE_NAMES.profile, {
      ...current,
      id: 'me' as const,
      customThemes: next,
      updatedAt: Date.now(),
    });
    return next;
  }
}
