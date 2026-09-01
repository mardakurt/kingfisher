import type { GameTree } from '@/chess/tree/types';
import type { Fen, San, Uci } from '@/chess/types';
import type { ExplorerFilters, ExplorerResult, GameResult } from '@/database/types';

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

export interface GameRecord extends GameMetadata {
  readonly id: GameId;
  readonly fingerprint: string;
  readonly tree: GameTree;
  readonly normalizedPgn: string;
  readonly importedAt: number;
}

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
}

export interface GameSearchResult {
  readonly games: readonly GameRecord[];
  readonly total: number;
}

export interface PersistGameResult {
  readonly game: GameRecord;
  readonly duplicate: boolean;
}

export interface GameRepository {
  count(): Promise<number>;
  get(id: GameId): Promise<GameRecord | null>;
  findByFingerprint(fingerprint: string): Promise<GameRecord | null>;
  search(query?: GameSearchQuery): Promise<GameSearchResult>;
  persist(game: GameRecord, positions: readonly PositionRecord[]): Promise<PersistGameResult>;
  delete(id: GameId): Promise<void>;
  deleteMany(ids: readonly GameId[]): Promise<void>;
  clear(): Promise<void>;
  explore(fen: Fen, filters?: ExplorerFilters, limit?: number): Promise<ExplorerResult>;
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
