import type { GameTree } from '@/chess/tree/types';
import type { Fen, San, Uci } from '@/chess/types';
import type { ExplorerFilters, ExplorerResult, GameResult } from '@/database/types';
import type { TimeClass } from '@/search/time-control';

import type { PersistenceDatabase } from './indexeddb/database';
import type { ModelGameRepository, ProfileRepository } from './repositories/library-repository';
import type { RepertoireRepository } from './repositories/repertoire-repository';
import type { TrainingRepository } from './repositories/training-repository';
import type { StudyReferenceRepository } from './repositories/reference-repository';
import type { AnalysisQueueRepository } from './repositories/analysis-queue-repository';
import type { ReviewRepository } from './repositories/review-repository';
import type { TrainingSetRepository } from './repositories/training-set-repository';
import type { PreparationRepository } from './repositories/preparation-repository';
import type { OpeningFileRepository } from './repositories/opening-file-repository';
import type { TeamRepository } from './repositories/team-repository';
import type { JournalRepository } from './repositories/journal-repository';
import type { EndgameRepository } from './repositories/endgame-repository';
import type { PinnedLineRepository } from './repositories/pinned-line-repository';
import type { LinkedAccountRepository } from './repositories/linked-account-repository';
import type { SourceSetRepository } from './repositories/source-set-repository';
import type { PlayerIdentityRepository } from './repositories/player-identity-repository';

export type StudyId = string;
export type ChapterId = string;
export type GameId = string;

export interface StudyRecord {
  readonly id: StudyId;
  readonly title: string;
  readonly description?: string;
  /**
   * What the person filed this under. Typed, never inferred; absent on
   * records written before schema v20 and read as none.
   * `docs/design/organising-work.md`.
   */
  readonly tags?: readonly string[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface ChapterRecord {
  readonly id: ChapterId;
  readonly studyId: StudyId;
  readonly title: string;
  readonly order: number;
  /** As on the study: typed, never inferred, absent before schema v20. */
  readonly tags?: readonly string[];
  readonly tree: GameTree;
  readonly createdAt: number;
  readonly updatedAt: number;
  /**
   * Incremented by every accepted write.
   *
   * A workspace holds the revision it loaded and offers it back when it saves.
   * Two tabs editing one chapter therefore collide on the second write instead
   * of silently applying last-write-wins, which for a game tree means losing a
   * whole variation rather than a keystroke. See ADR 0019.
   */
  readonly revision: number;
}

/**
 * A write refused because the stored chapter moved on.
 *
 * Carries the current record so the caller can offer to reload it or fork a
 * copy without a second read, and so no caller is tempted to resolve the
 * conflict by merging two game trees automatically.
 */
export class StaleChapterWriteError extends Error {
  override readonly name = 'StaleChapterWriteError';
  constructor(
    readonly current: ChapterRecord,
    readonly attemptedRevision: number,
  ) {
    super('This chapter changed in another Kingfisher tab.');
  }
}

export interface StudyWithChapters {
  readonly study: StudyRecord;
  readonly chapters: readonly ChapterRecord[];
}

export interface CreateStudyInput {
  readonly title: string;
  readonly description?: string;
  readonly tags?: readonly string[];
}

export interface StudyUpdate {
  readonly title?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
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
  /**
   * Write a chapter, refusing the write if the stored revision has moved past
   * `chapter.revision`. Throws {@link StaleChapterWriteError} when it has.
   */
  saveChapter(chapter: ChapterRecord): Promise<ChapterRecord>;
  renameChapter(id: ChapterId, title: string): Promise<ChapterRecord>;
  /** Replace a chapter's tags. Normalised here, so every writer agrees. */
  tagChapter(id: ChapterId, tags: readonly string[]): Promise<ChapterRecord>;
  deleteChapter(id: ChapterId): Promise<void>;
  reorderChapters(studyId: StudyId, orderedIds: readonly ChapterId[]): Promise<void>;
  duplicateChapter(id: ChapterId): Promise<ChapterRecord>;
}

/**
 * Kingfisher's own opening classification, stored beside the PGN's tags.
 *
 * Deliberately a separate field rather than an overwrite of `eco`/`opening`.
 * The imported tags are evidence about the source file and are preserved
 * verbatim; this is evidence about the position, and is computed here.
 */
export interface StoredClassification {
  readonly eco: string;
  /** Opening family, e.g. "Sicilian Defense". */
  readonly name: string;
  readonly variation?: string;
  /** Ply of this game at which the deepest known position was reached. */
  readonly ply: number;
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
  /** Computed by Kingfisher, never read from the file. */
  readonly classification?: StoredClassification;
  /**
   * `OPENING_DATASET_DIGEST` of the index that last examined this game.
   *
   * Set whether or not a name was found, which is what keeps "the classifier
   * has not looked at this game yet" distinguishable from "the classifier
   * looked and the position is not in any opening table". Without the
   * distinction a backfill would re-examine every unnamed game on every run,
   * and could never report an honest completion. It also makes a dataset
   * update a bounded job: only rows whose digest is stale need revisiting.
   */
  readonly classifiedWith?: string;
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
  /** Representative position before `moveUci`; added by the Phase 8 structure index. */
  readonly fen?: Fen;
  readonly nodeId?: string;
  readonly pawnSkeleton?: string;
  readonly structureSignature?: string;
  readonly structureClaims?: readonly string[];
}

export type StructureSearchMode = 'exact-position' | 'pawn-skeleton' | 'signature' | 'claims';
export type StructureSearchSort = 'closest' | 'rating' | 'recent';

export interface StructureSearchQuery {
  readonly mode: StructureSearchMode;
  readonly positionKey: string;
  readonly pawnSkeleton: string;
  readonly structureSignature: string;
  readonly claims: readonly string[];
  readonly sort?: StructureSearchSort;
  readonly limit?: number;
}

export interface StructureSearchResult {
  readonly game: GameSummary;
  readonly position: PositionRecord;
  readonly exactPosition: boolean;
  readonly samePawnSkeleton: boolean;
  readonly sameSignature: boolean;
  /** Count of requested deterministic claims present in this position. */
  readonly sharedClaims: number;
}

export interface GameSearchQuery {
  readonly text?: string;
  readonly player?: string;
  readonly playerColor?: 'w' | 'b';
  readonly result?: GameResult;
  readonly fromYear?: number;
  readonly toYear?: number;
  readonly minRating?: number;
  /** Rating ceiling; together with `minRating` a band. */
  readonly maxRating?: number;
  /**
   * Whose rating the band applies to. `either` (the default, and what
   * `minRating` has always meant): at least one player's rating is inside it.
   * `both`: both ratings are known and inside it.
   */
  readonly ratingScope?: 'either' | 'both';
  /** Case-insensitive substring of the Event tag. */
  readonly event?: string;
  /** Case-insensitive substring of the Site tag. */
  readonly site?: string;
  /**
   * `YYYY-MM-DD`, inclusive. A game with a full date is compared by date; one
   * with only a year counts when that year is inside the range; a game with
   * no date matches no date range.
   */
  readonly fromDate?: string;
  readonly toDate?: string;
  /** By `classifyTimeControl` — the rule the filter prints. */
  readonly timeClass?: TimeClass;
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
   * The summaries of the stored games that reach a position, for a history of
   * it — when it was first played, by whom, how often by year. Bounded:
   * `total` is every game that reaches it, `games` at most `limit` of them.
   */
  summariesAtPosition(
    key: string,
    limit?: number,
  ): Promise<{ readonly games: readonly GameSummary[]; readonly total: number }>;
  /**
   * Distinct move orders that reach a position in the stored games.
   *
   * Read from what was actually played, never generated: a list of plausible
   * transpositions the user's database has no example of would be a list of
   * guesses dressed as evidence.
   */
  routesToPosition(key: string, limit?: number): Promise<readonly TranspositionRoute[]>;
  /** Deterministic structure lookup over the position index. */
  searchStructures(query: StructureSearchQuery): Promise<readonly StructureSearchResult[]>;
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
      /** The stored revision this workspace loaded, and will write against. */
      readonly revision: number;
    }
  | {
      readonly kind: 'database-game';
      readonly title: string;
      readonly gameId: GameId;
      /**
       * The side the viewer played, when the game came from one of their
       * linked accounts. Phase 63 set the board's orientation from it and
       * dropped the fact on the floor: the header of a synced game said
       * "From your game database" and nothing about whose game it was.
       */
      readonly viewerSide?: 'w' | 'b';
    }
  /**
   * A game from a reference source, opened on the board.
   *
   * Distinct from `database-game` because there is no stored record behind it:
   * the game lives in an installed pack, not in this browser's collection, and
   * nothing that writes back to a stored game applies. Carrying the source in
   * the document is what lets the header say where the game came from, which
   * for licensed data is not decoration.
   *
   * `viewerSide` is set when the viewer is one of the players, so the board
   * can be opened on their side and the title strip can say *Playing as …*
   * rather than just *From Lichess*. Absent means "we do not know" — for
   * master games, replay packs and any other view that is not one of yours.
   */
  | {
      readonly kind: 'reference-game';
      readonly title: string;
      readonly sourceId: string;
      readonly sourceName: string;
      readonly gameId: string;
      readonly viewerSide?: 'w' | 'b';
    };

/**
 * A workspace tab's board work, kept while the tab is not the active one.
 * See `docs/design/workspace-tabs.md`.
 */
export type TabDraftId = `tab:${string}`;

export interface DraftRecord {
  /** `active` is what is on the board; `tab:<id>` is an inactive tab's work. */
  readonly id: 'active' | TabDraftId;
  readonly document: AnalysisDocument;
  readonly tree: GameTree;
  readonly currentId: string;
  readonly orientation: 'w' | 'b';
  readonly updatedAt: number;
  /**
   * True while this draft holds work the authoritative record does not.
   *
   * The draft is written *before* the chapter and cleared *after* it, so a
   * crash, a refused write or a full disk in between leaves this set. It is
   * the only signal that distinguishes "the last session ended tidily" from
   * "there is work here nobody has seen since", and it is what decides whether
   * the user is offered a recovery on startup or left alone.
   */
  readonly unsaved?: boolean;
}

export interface DraftRepository {
  get(): Promise<DraftRecord | null>;
  save(draft: DraftRecord): Promise<void>;
  clear(): Promise<void>;
  /** Every inactive tab's work, in no particular order. */
  listTabs(): Promise<DraftRecord[]>;
  getTab(id: TabDraftId): Promise<DraftRecord | null>;
  deleteTab(id: TabDraftId): Promise<void>;
}

export interface AppRepositories {
  readonly studies: StudyRepository;
  readonly games: GameRepository;
  readonly drafts: DraftRepository;
  readonly repertoires: RepertoireRepository;
  readonly training: TrainingRepository;
  readonly modelGames: ModelGameRepository;
  readonly profile: ProfileRepository;
  readonly references: StudyReferenceRepository;
  readonly analysisQueue: AnalysisQueueRepository;
  readonly review: ReviewRepository;
  readonly trainingSets: TrainingSetRepository;
  readonly preparation: PreparationRepository;
  readonly openingFiles: OpeningFileRepository;
  readonly team: TeamRepository;
  readonly journal: JournalRepository;
  readonly endgames: EndgameRepository;
  readonly pinnedLines: PinnedLineRepository;
  readonly linkedAccounts: LinkedAccountRepository;
  readonly sourceSets: SourceSetRepository;
  readonly playerIdentities: PlayerIdentityRepository;
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
  /** Games found in the source. With `cancelled`, more than were attempted. */
  readonly games: number;
  readonly imported: number;
  readonly duplicates: number;
  readonly indexedPositions: number;
  /** Games or fragments the parser could not read. They were not imported. */
  readonly issues: number;
  /**
   * True when the user stopped the import part-way.
   *
   * Reported rather than thrown. Batches are committed as they go, so a
   * cancelled import has really added games; throwing the cancellation away
   * left the user with no idea whether any of them landed, and a second
   * attempt looking like it had duplicated everything.
   */
  readonly cancelled: boolean;
  readonly firstGame?: GameRecord;
}
