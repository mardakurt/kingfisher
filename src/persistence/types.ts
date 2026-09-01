import type { GameTree } from '@/chess/tree/types';
import type { Fen, San, Uci } from '@/chess/types';
import type { ExplorerFilters, ExplorerResult, GameResult } from '@/database/types';

import type { PersistenceDatabase } from './indexeddb/database';
import type { ModelGameRepository, ProfileRepository } from './repositories/library-repository';
import type { RepertoireRepository } from './repositories/repertoire-repository';
import type { TrainingRepository } from './repositories/training-repository';

export type StudyId = string;
export type ChapterId = string;
export type GameId = string;

export interface StudyRecord {
  readonly id: StudyId;
  readonly title: string;
  readonly description?: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface ChapterRecord {
  readonly id: ChapterId;
  readonly studyId: StudyId;
  readonly title: string;
  readonly order: number;
  readonly tree: GameTree;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface StudyWithChapters {
  readonly study: StudyRecord;
  readonly chapters: readonly ChapterRecord[];
}

export interface CreateStudyInput {
  readonly title: string;
  readonly description?: string;
}

export interface StudyUpdate {
  readonly title?: string;
  readonly description?: string;
}

export interface CreateChapterInput {
  readonly studyId: StudyId;
  readonly title: string;
  readonly tree: GameTree;
}

export interface StudyRepository {
  list(): Promise<readonly StudyRecord[]>;
  get(id: StudyId): Promise<StudyWithChapters | null>;
  create(input: CreateStudyInput): Promise<StudyRecord>;
  update(id: StudyId, update: StudyUpdate): Promise<StudyRecord>;
  delete(id: StudyId): Promise<void>;
  createChapter(input: CreateChapterInput): Promise<ChapterRecord>;
  getChapter(id: ChapterId): Promise<ChapterRecord | null>;
  saveChapter(chapter: ChapterRecord): Promise<ChapterRecord>;
  renameChapter(id: ChapterId, title: string): Promise<ChapterRecord>;
  deleteChapter(id: ChapterId): Promise<void>;
  reorderChapters(studyId: StudyId, orderedIds: readonly ChapterId[]): Promise<void>;
  duplicateChapter(id: ChapterId): Promise<ChapterRecord>;
}

export interface GameMetadata {
  readonly white: string;
  readonly black: string;
  readonly result: GameResult;
  readonly date?: string;
  readonly year?: number;
  readonly event?: string;
  readonly site?: string;
  readonly round?: string;
  readonly whiteRating?: number;
  readonly blackRating?: number;
  readonly eco?: string;
  readonly opening?: string;
  readonly variation?: string;
  readonly timeControl?: string;
}

/**
 * Everything about a game except the moves.
 *
 * This is what the game list, the search and the explorer read. Keeping the
 * tree out of it is the difference between reading 379 bytes per game and
 * 6.7 kB — measured, and the reason for schema version 3.
 */
export interface GameSummary extends GameMetadata {
  readonly id: GameId;
  readonly fingerprint: string;
  /**
   * Normalized player names, written at import so the indexes can be walked
   * without deserialising and lower-casing every record at query time.
   */
  readonly whiteKey: string;
  readonly blackKey: string;
  readonly playerKeys: readonly string[];
  readonly importedAt: number;
}

/** The moves, stored separately and read only when a game is opened. */
export interface GameContent {
  readonly id: GameId;
  readonly tree: GameTree;
  readonly normalizedPgn: string;
}

/** A game with its moves, as import produces it and as analysis consumes it. */
export interface GameRecord extends GameSummary, Omit<GameContent, 'id'> {}

export interface PositionRecord {
  readonly id: string;
  readonly positionKey: string;
  readonly gameId: GameId;
  readonly ply: number;
  readonly moveUci: Uci;
  readonly moveSan: San;
  readonly mover: 'w' | 'b';
}

export interface GameSearchQuery {
  readonly text?: string;
  readonly player?: string;
  readonly playerColor?: 'w' | 'b';
  readonly result?: GameResult;
  readonly fromYear?: number;
  readonly toYear?: number;
  readonly minRating?: number;
  readonly opening?: string;
  readonly eco?: string;
  readonly sortBy?: 'importedAt' | 'date' | 'white' | 'black' | 'rating' | 'opening';
  readonly sortDirection?: 'asc' | 'desc';
  readonly limit?: number;
  readonly offset?: number;
  /**
   * Insist on an exact total even where counting costs a full scan.
   *
   * Off by default. A filter an index cannot answer has to visit every record
   * to be counted, and almost every caller wants "is there another page", not
   * "how many pages". See ADR 0014.
   */
  readonly exactTotal?: boolean;
}

export interface GameSearchResult {
  /** Summaries: opening a game fetches its moves separately. */
  readonly games: readonly GameSummary[];
  /**
   * Matching games, or null when the query could not be counted cheaply.
   *
   * Null is not "zero" and not "unknown-ish": it means the repository declined
   * to pay for a number nobody asked for. A caller that needs one passes
   * `exactTotal`. The interface refuses to report an estimate as a total,
   * because a wrong count on a database screen is worse than no count.
   */
  readonly total: number | null;
  /** Whether a further page exists. Always exact — it costs one extra row. */
  readonly hasMore: boolean;
}

export interface PersistGameResult {
  readonly game: GameRecord;
  readonly duplicate: boolean;
}

export interface GameRepository {
  count(): Promise<number>;
  /** The game with its moves. */
  get(id: GameId): Promise<GameRecord | null>;
  /** Many full games in one transaction, for bounded preparation reports. */
  getMany(ids: readonly GameId[]): Promise<readonly GameRecord[]>;
  /** Metadata only; never reads the tree. */
  summary(id: GameId): Promise<GameSummary | null>;
  /** Metadata for many games at once, in one transaction. */
  summaries(ids: readonly GameId[]): Promise<readonly GameSummary[]>;
  findByFingerprint(fingerprint: string): Promise<GameSummary | null>;
  search(query?: GameSearchQuery): Promise<GameSearchResult>;
  persist(game: GameRecord, positions: readonly PositionRecord[]): Promise<PersistGameResult>;
  /** Store many games in one transaction; the batch is the unit of atomicity. */
  persistMany(
    entries: readonly { game: GameRecord; positions: readonly PositionRecord[] }[],
  ): Promise<PersistGameResult[]>;
  delete(id: GameId): Promise<void>;
  deleteMany(ids: readonly GameId[]): Promise<void>;
  clear(): Promise<void>;
  explore(fen: Fen, filters?: ExplorerFilters, limit?: number): Promise<ExplorerResult>;
  /** How many stored games reach a canonical position. */
  countAtPosition(key: string): Promise<number>;
  /**
   * Distinct move orders that reach a position in the stored games.
   *
   * Read from what was actually played, never generated: a list of plausible
   * transpositions the user's database has no example of would be a list of
   * guesses dressed as evidence.
   */
  routesToPosition(key: string, limit?: number): Promise<readonly TranspositionRoute[]>;
}

export interface TranspositionRoute {
  /** The move order, in SAN, from the start of the game. */
  readonly moves: readonly San[];
  /** How many stored games arrived this way. */
  readonly games: number;
}

export type AnalysisDocument =
  | { readonly kind: 'untitled'; readonly title: string }
  | {
      readonly kind: 'study-chapter';
      readonly title: string;
      readonly studyId: StudyId;
      readonly studyTitle: string;
      readonly chapterId: ChapterId;
    }
  | {
      readonly kind: 'database-game';
      readonly title: string;
      readonly gameId: GameId;
    };

export interface DraftRecord {
  readonly id: 'active';
  readonly document: AnalysisDocument;
  readonly tree: GameTree;
  readonly currentId: string;
  readonly orientation: 'w' | 'b';
  readonly updatedAt: number;
}

export interface DraftRepository {
  get(): Promise<DraftRecord | null>;
  save(draft: DraftRecord): Promise<void>;
  clear(): Promise<void>;
}

export interface AppRepositories {
  readonly studies: StudyRepository;
  readonly games: GameRepository;
  readonly drafts: DraftRepository;
  readonly repertoires: RepertoireRepository;
  readonly training: TrainingRepository;
  readonly modelGames: ModelGameRepository;
  readonly profile: ProfileRepository;
  /**
   * The underlying database, for backup and restore only.
   *
   * Everything else goes through a repository; a whole-database export is the
   * one operation that legitimately needs to walk every store generically.
   */
  readonly raw: PersistenceDatabase;
  close(): void;
}

export type ImportStage = 'parsing' | 'importing' | 'indexing' | 'complete';

export interface ImportProgress {
  readonly stage: ImportStage;
  readonly completed: number;
  readonly total: number;
}

export interface PersistentImportSummary {
  readonly games: number;
  readonly imported: number;
  readonly duplicates: number;
  readonly indexedPositions: number;
  readonly issues: number;
  readonly firstGame?: GameRecord;
}
