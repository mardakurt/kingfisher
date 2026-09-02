/**
 * Checking that the stored data still agrees with itself.
 *
 * Kingfisher spreads one game across three stores — a summary, its moves, and
 * a row per position it reached — and links studies, repertoires, training
 * items and model games to those records by id. Every one of those links is a
 * place where an interrupted import, a failed delete or a browser evicting a
 * transaction can leave a reference to something that is not there.
 *
 * The rules here are deliberately narrow. Each one describes a relationship
 * the schema guarantees, so a violation is a fact rather than a suspicion, and
 * the report says which record and which relationship rather than warning that
 * the database "may be damaged". Anything that cannot be stated that precisely
 * does not belong in this file.
 *
 * Repair is separate, and only ever removes a pointer to something that
 * provably no longer exists. Nothing here reconstructs chess content: a game
 * whose moves are missing is reported and left alone, because inventing a tree
 * to satisfy a foreign key would turn a detectable problem into a permanent
 * lie.
 */

import { STORE_NAMES } from './schema/migrations';
import type { PersistenceDatabase } from './indexeddb/database';
import type {
  ChapterRecord,
  DraftRecord,
  GameContent,
  GameSummary,
  PositionRecord,
  StudyRecord,
} from './types';
import type {
  ModelGameLinkRecord,
  RepertoirePositionRecord,
  RepertoireRecord,
  TrainingItemRecord,
  TrainingReviewRecord,
  StudyReferenceRecord,
  AnalysisQueueJobRecord,
  StoredEngineEvidenceRecord,
  DecisionRecord,
  ReviewItemRecord,
  TrainingSetRecord,
} from './domain';

export type IntegrityCategory =
  | 'orphaned-reference'
  | 'missing-content'
  | 'index-inconsistency'
  | 'invalid-order'
  | 'unknown-entity';

export interface IntegrityIssue {
  readonly category: IntegrityCategory;
  /** Which relationship broke, in the user's terms. */
  readonly title: string;
  /** What is wrong, concretely, naming the records involved. */
  readonly detail: string;
  readonly store: string;
  readonly ids: readonly string[];
  /**
   * True when removing the offending rows is provably safe — the thing they
   * point at is gone, and nothing but the pointer is lost.
   */
  readonly repairable: boolean;
  /** What repair would do, so the user can decline it knowingly. */
  readonly repair?: string;
}

export interface IntegrityReport {
  readonly checkedAt: number;
  readonly issues: readonly IntegrityIssue[];
  /** Row counts per store, for the diagnostic report. */
  readonly counts: Readonly<Record<string, number>>;
  readonly durationMs: number;
}

export const isHealthy = (report: IntegrityReport): boolean => report.issues.length === 0;

/** Issues whose repair is unambiguous, in the order they should be applied. */
export const repairableIssues = (report: IntegrityReport): readonly IntegrityIssue[] =>
  report.issues.filter((issue) => issue.repairable);

export async function scanIntegrity(database: PersistenceDatabase): Promise<IntegrityReport> {
  const started = Date.now();

  const [
    studies,
    chapters,
    games,
    content,
    positions,
    repertoires,
    repertoirePositions,
    training,
    reviews,
    modelGames,
    references,
    analysisJobs,
    engineEvidence,
    decisions,
    reviewItems,
    trainingSets,
    draft,
  ] = await Promise.all([
    database.getAll<StudyRecord>(STORE_NAMES.studies),
    database.getAll<ChapterRecord>(STORE_NAMES.chapters),
    database.getAll<GameSummary>(STORE_NAMES.games),
    database.getAll<GameContent>(STORE_NAMES.gameContent),
    database.getAll<PositionRecord>(STORE_NAMES.positions),
    database.getAll<RepertoireRecord>(STORE_NAMES.repertoires),
    database.getAll<RepertoirePositionRecord>(STORE_NAMES.repertoirePositions),
    database.getAll<TrainingItemRecord>(STORE_NAMES.trainingItems),
    database.getAll<TrainingReviewRecord>(STORE_NAMES.trainingReviews),
    database.getAll<ModelGameLinkRecord>(STORE_NAMES.modelGameLinks),
    database.getAll<StudyReferenceRecord>(STORE_NAMES.studyReferences),
    database.getAll<AnalysisQueueJobRecord>(STORE_NAMES.analysisQueue),
    database.getAll<StoredEngineEvidenceRecord>(STORE_NAMES.engineEvidence),
    database.getAll<DecisionRecord>(STORE_NAMES.decisions),
    database.getAll<ReviewItemRecord>(STORE_NAMES.reviewItems),
    database.getAll<TrainingSetRecord>(STORE_NAMES.trainingSets),
    database.get<DraftRecord>(STORE_NAMES.drafts, 'active'),
  ]);

  const issues = collectIssues({
    studies,
    chapters,
    games,
    content,
    positions,
    repertoires,
    repertoirePositions,
    training,
    reviews,
    modelGames,
    references,
    analysisJobs,
    engineEvidence,
    decisions,
    reviewItems,
    trainingSets,
    draft: draft ?? null,
  });

  return {
    checkedAt: started,
    issues,
    counts: {
      studies: studies.length,
      chapters: chapters.length,
      games: games.length,
      gameContent: content.length,
      positions: positions.length,
      repertoires: repertoires.length,
      repertoirePositions: repertoirePositions.length,
      trainingItems: training.length,
      trainingReviews: reviews.length,
      modelGameLinks: modelGames.length,
      studyReferences: references.length,
      analysisQueue: analysisJobs.length,
      engineEvidence: engineEvidence.length,
      decisions: decisions.length,
      reviewItems: reviewItems.length,
      trainingSets: trainingSets.length,
    },
    durationMs: Date.now() - started,
  };
}

export interface IntegrityInput {
  readonly studies: readonly StudyRecord[];
  readonly chapters: readonly ChapterRecord[];
  readonly games: readonly GameSummary[];
  readonly content: readonly GameContent[];
  readonly positions: readonly PositionRecord[];
  readonly repertoires: readonly RepertoireRecord[];
  readonly repertoirePositions: readonly RepertoirePositionRecord[];
  readonly training: readonly TrainingItemRecord[];
  readonly reviews: readonly TrainingReviewRecord[];
  readonly modelGames: readonly ModelGameLinkRecord[];
  readonly references: readonly StudyReferenceRecord[];
  readonly analysisJobs: readonly AnalysisQueueJobRecord[];
  readonly engineEvidence: readonly StoredEngineEvidenceRecord[];
  readonly decisions: readonly DecisionRecord[];
  readonly reviewItems: readonly ReviewItemRecord[];
  readonly trainingSets: readonly TrainingSetRecord[];
  readonly draft: DraftRecord | null;
}

/**
 * The rules, as a pure function of the stored rows.
 *
 * Separated from reading the database so the whole rule set can be tested
 * against deliberately broken fixtures without an IndexedDB at all.
 */
export function collectIssues(input: IntegrityInput): readonly IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const studyIds = new Set(input.studies.map((study) => study.id));
  const chapterIds = new Set(input.chapters.map((chapter) => chapter.id));
  const gameIds = new Set(input.games.map((game) => game.id));
  const contentIds = new Set(input.content.map((entry) => entry.id));
  const repertoireIds = new Set(input.repertoires.map((entry) => entry.id));
  const trainingIds = new Set(input.training.map((item) => item.id));
  const repertoirePositionIds = new Set(input.repertoirePositions.map((item) => item.id));
  const analysisJobIds = new Set(input.analysisJobs.map((job) => job.id));

  // --- Games ---------------------------------------------------------------

  const withoutContent = input.games.filter((game) => !contentIds.has(game.id));
  if (withoutContent.length > 0) {
    issues.push({
      category: 'missing-content',
      title: 'Games whose moves are missing',
      detail:
        `${withoutContent.length} game${withoutContent.length === 1 ? '' : 's'} appear in the ` +
        'list but have no stored moves. Opening one would fail.',
      store: STORE_NAMES.games,
      ids: withoutContent.map((game) => game.id),
      // Deliberately not repairable. The summary is the only remaining record
      // that the game was ever imported; deleting it to satisfy a foreign key
      // destroys the last evidence, and no tree can honestly be invented.
      repairable: false,
    });
  }

  const orphanContent = input.content.filter((entry) => !gameIds.has(entry.id));
  if (orphanContent.length > 0) {
    issues.push({
      category: 'orphaned-reference',
      title: 'Stored moves with no game',
      detail:
        `${orphanContent.length} move record${orphanContent.length === 1 ? '' : 's'} belong to ` +
        'games that no longer exist. They occupy space and are unreachable.',
      store: STORE_NAMES.gameContent,
      ids: orphanContent.map((entry) => entry.id),
      repairable: true,
      repair: 'Delete the unreachable move records.',
    });
  }

  const orphanPositions = input.positions.filter((entry) => !gameIds.has(entry.gameId));
  if (orphanPositions.length > 0) {
    issues.push({
      category: 'index-inconsistency',
      title: 'Position index entries with no game',
      detail:
        `${orphanPositions.length} position${orphanPositions.length === 1 ? '' : 's'} in the ` +
        'index point at deleted games, so the explorer would count games that cannot be opened.',
      store: STORE_NAMES.positions,
      ids: orphanPositions.map((entry) => entry.id),
      repairable: true,
      repair: 'Remove the index entries for deleted games.',
    });
  }

  const indexed = new Set(input.positions.map((entry) => entry.gameId));
  const unindexed = input.games.filter((game) => contentIds.has(game.id) && !indexed.has(game.id));
  if (unindexed.length > 0) {
    issues.push({
      category: 'index-inconsistency',
      title: 'Games missing from the position index',
      detail:
        `${unindexed.length} game${unindexed.length === 1 ? '' : 's'} have moves but no indexed ` +
        'positions, so they never appear in explorer or preparation results.',
      store: STORE_NAMES.positions,
      ids: unindexed.map((game) => game.id),
      // Rebuilding the index is safe and derives nothing new — but it replays
      // chess, so it belongs to the importer rather than to a repair pass.
      repairable: false,
      repair: 'Re-import these games to rebuild their index entries.',
    });
  }

  // --- Studies -------------------------------------------------------------

  const orphanChapters = input.chapters.filter((chapter) => !studyIds.has(chapter.studyId));
  if (orphanChapters.length > 0) {
    issues.push({
      category: 'orphaned-reference',
      title: 'Chapters with no study',
      detail:
        `${orphanChapters.length} chapter${orphanChapters.length === 1 ? '' : 's'} belong to a ` +
        'study that no longer exists, so they cannot be opened from anywhere.',
      store: STORE_NAMES.chapters,
      ids: orphanChapters.map((chapter) => chapter.id),
      // Not repairable: the chapter still holds the user's analysis. Deleting
      // it is destroying work to tidy a pointer.
      repairable: false,
      repair: 'Export these chapters before deciding; their analysis is still intact.',
    });
  }

  for (const study of input.studies) {
    const owned = input.chapters
      .filter((chapter) => chapter.studyId === study.id)
      .sort((a, b) => a.order - b.order);
    if (owned.length === 0) continue;
    const orders = owned.map((chapter) => chapter.order);
    const contiguous = orders.every((order, index) => order === index);
    if (!contiguous) {
      issues.push({
        category: 'invalid-order',
        title: 'Chapter order has gaps or duplicates',
        detail:
          `“${study.title}” has chapters ordered ${orders.join(', ')} rather than ` +
          `${orders.map((_, index) => index).join(', ')}. The list still renders, but ` +
          'reordering behaves unpredictably.',
        store: STORE_NAMES.chapters,
        ids: owned.map((chapter) => chapter.id),
        repairable: true,
        repair: 'Renumber the chapters, keeping their current sequence.',
      });
    }
  }

  // --- Repertoires ---------------------------------------------------------

  const orphanRepertoirePositions = input.repertoirePositions.filter(
    (entry) => !repertoireIds.has(entry.repertoireId),
  );
  if (orphanRepertoirePositions.length > 0) {
    issues.push({
      category: 'orphaned-reference',
      title: 'Repertoire positions with no repertoire',
      detail: `${orphanRepertoirePositions.length} recorded decision${
        orphanRepertoirePositions.length === 1 ? '' : 's'
      } belong to a deleted repertoire and are counted by nothing.`,
      store: STORE_NAMES.repertoirePositions,
      ids: orphanRepertoirePositions.map((entry) => entry.id),
      repairable: true,
      repair: 'Delete the decisions whose repertoire is gone.',
    });
  }

  // --- Training ------------------------------------------------------------

  const orphanReviews = input.reviews.filter((review) => !trainingIds.has(review.itemId));
  if (orphanReviews.length > 0) {
    issues.push({
      category: 'orphaned-reference',
      title: 'Reviews for deleted training items',
      detail:
        `${orphanReviews.length} review${orphanReviews.length === 1 ? '' : 's'} refer to ` +
        'training items that no longer exist.',
      store: STORE_NAMES.trainingReviews,
      ids: orphanReviews.map((review) => review.id),
      repairable: true,
      repair: 'Delete the reviews whose item is gone.',
    });
  }

  const danglingSources = input.training.filter((item) => {
    const source = item.source;
    if (!source?.id) return false;
    if (source.kind === 'study') return !studyIds.has(source.id) && !chapterIds.has(source.id);
    if (source.kind === 'game') return !gameIds.has(source.id);
    if (source.kind === 'repertoire') return !repertoireIds.has(source.id);
    return false;
  });
  if (danglingSources.length > 0) {
    issues.push({
      category: 'unknown-entity',
      title: 'Training items citing something that is gone',
      detail:
        `${danglingSources.length} training item${danglingSources.length === 1 ? '' : 's'} name ` +
        'a source that no longer exists. The item still works; only the link back is broken.',
      store: STORE_NAMES.trainingItems,
      ids: danglingSources.map((item) => item.id),
      // The position and the answer are intact and still worth drilling, so
      // this is reported and left: the user loses a link, not their training.
      repairable: false,
      repair: 'Nothing is lost. Re-link the item from its position if you want the reference back.',
    });
  }

  // --- Model games ---------------------------------------------------------

  const orphanModelGames = input.modelGames.filter(
    (link) =>
      !gameIds.has(link.gameId) ||
      (link.studyId !== undefined && !studyIds.has(link.studyId)) ||
      (link.repertoireId !== undefined && !repertoireIds.has(link.repertoireId)),
  );
  if (orphanModelGames.length > 0) {
    issues.push({
      category: 'orphaned-reference',
      title: 'Model-game links pointing at deleted records',
      detail:
        `${orphanModelGames.length} model-game link${orphanModelGames.length === 1 ? '' : 's'} ` +
        'reference a game, study or repertoire that no longer exists.',
      store: STORE_NAMES.modelGameLinks,
      ids: orphanModelGames.map((link) => link.id),
      repairable: true,
      repair: 'Delete the links whose target is gone.',
    });
  }

  // --- Typed chapter references -------------------------------------------

  const brokenReferences = input.references.filter((reference) => {
    if (!chapterIds.has(reference.chapterId)) return true;
    if (reference.kind === 'model-game') return !gameIds.has(reference.targetId);
    if (reference.kind === 'repertoire-position') {
      return !repertoirePositionIds.has(reference.targetId);
    }
    return !trainingIds.has(reference.targetId);
  });
  if (brokenReferences.length > 0) {
    issues.push({
      category: 'orphaned-reference',
      title: 'Study references pointing at deleted records',
      detail:
        `${brokenReferences.length} chapter reference${brokenReferences.length === 1 ? '' : 's'} ` +
        'point at a chapter or chess entity that no longer exists.',
      store: STORE_NAMES.studyReferences,
      ids: brokenReferences.map((reference) => reference.id),
      repairable: true,
      repair: 'Remove the missing references; the chapter itself is unchanged.',
    });
  }

  const orphanAnalysisJobs = input.analysisJobs.filter((job) => !gameIds.has(job.gameId));
  if (orphanAnalysisJobs.length > 0) {
    issues.push({
      category: 'orphaned-reference',
      title: 'Analysis jobs whose game is gone',
      detail: `${orphanAnalysisJobs.length} queued analysis job${orphanAnalysisJobs.length === 1 ? '' : 's'} cannot resume because the source game was deleted.`,
      store: STORE_NAMES.analysisQueue,
      ids: orphanAnalysisJobs.map((job) => job.id),
      repairable: true,
      repair: 'Remove the jobs whose source game is gone.',
    });
  }

  const orphanEvidence = input.engineEvidence.filter(
    (entry) => !analysisJobIds.has(entry.jobId) || !gameIds.has(entry.gameId),
  );
  if (orphanEvidence.length > 0) {
    issues.push({
      category: 'orphaned-reference',
      title: 'Saved engine evidence with no analysis job or game',
      detail: `${orphanEvidence.length} saved evaluation${orphanEvidence.length === 1 ? '' : 's'} no longer has its source job or game.`,
      store: STORE_NAMES.engineEvidence,
      ids: orphanEvidence.map((entry) => entry.id),
      repairable: true,
      repair: 'Remove the unreachable saved evaluations.',
    });
  }

  // --- Improvement review --------------------------------------------------

  /*
    A decision or a review item whose source game is gone is not itself
    broken: what the player thought about a position is still a true record of
    what they thought, and the position is stored on the record. So only the
    *pointer* is reported, and repair only clears the pointer — deleting the
    thinking because the game was tidied away would be the wrong repair.
  */
  const decisionIds = new Set(input.decisions.map((decision) => decision.id));
  const danglingDecisions = input.decisions.filter(
    (decision) => decision.gameId !== undefined && !gameIds.has(decision.gameId),
  );
  if (danglingDecisions.length > 0) {
    issues.push({
      category: 'orphaned-reference',
      title: 'Decision records pointing at deleted games',
      detail:
        `${danglingDecisions.length} decision record${danglingDecisions.length === 1 ? '' : 's'} ` +
        'name a game that is no longer stored. The position and the thinking are intact.',
      store: STORE_NAMES.decisions,
      ids: danglingDecisions.map((decision) => decision.id),
      repairable: false,
      repair: 'Nothing is removed: the record is still a true note about a position.',
    });
  }

  const brokenReviewLinks = input.reviewItems.filter(
    (item) =>
      (item.gameId !== undefined && !gameIds.has(item.gameId)) ||
      (item.chapterId !== undefined && !chapterIds.has(item.chapterId)) ||
      (item.decisionId !== undefined && !decisionIds.has(item.decisionId)) ||
      (item.trainingItemId !== undefined && !trainingIds.has(item.trainingItemId)),
  );
  if (brokenReviewLinks.length > 0) {
    issues.push({
      category: 'orphaned-reference',
      title: 'Review queue entries with a missing source',
      detail:
        `${brokenReviewLinks.length} review item${brokenReviewLinks.length === 1 ? '' : 's'} ` +
        'point at a game, chapter, decision or training item that no longer exists.',
      store: STORE_NAMES.reviewItems,
      ids: brokenReviewLinks.map((item) => item.id),
      repairable: true,
      repair: 'Remove the queue entries whose source is gone.',
    });
  }

  const setsWithMissingItems = input.trainingSets.filter(
    (set) => set.kind === 'static' && set.itemIds.some((itemId) => !trainingIds.has(itemId)),
  );
  if (setsWithMissingItems.length > 0) {
    const missing = setsWithMissingItems.reduce(
      (total, set) => total + set.itemIds.filter((itemId) => !trainingIds.has(itemId)).length,
      0,
    );
    issues.push({
      category: 'orphaned-reference',
      title: 'Training sets listing deleted items',
      detail:
        `${setsWithMissingItems.length} training set${setsWithMissingItems.length === 1 ? '' : 's'} ` +
        `still list ${missing} training item${missing === 1 ? '' : 's'} that no longer exist.`,
      store: STORE_NAMES.trainingSets,
      ids: setsWithMissingItems.map((set) => set.id),
      repairable: false,
      repair: 'Open the set and remove the missing members; the set itself is fine.',
    });
  }

  // --- The open draft ------------------------------------------------------

  const draft = input.draft;
  if (draft) {
    const document = draft.document;
    const missing =
      (document.kind === 'study-chapter' && !chapterIds.has(document.chapterId)) ||
      (document.kind === 'database-game' && !gameIds.has(document.gameId));
    if (missing) {
      issues.push({
        category: 'unknown-entity',
        title: 'The open document no longer exists',
        detail:
          'The workspace draft points at a chapter or game that has been deleted. Kingfisher ' +
          'reopens it as an untitled analysis, so the work is kept, but the link is broken.',
        store: STORE_NAMES.drafts,
        ids: ['active'],
        // The draft holds the tree that was on screen. Deleting it to fix a
        // pointer would throw away the very work it exists to protect.
        repairable: false,
        repair: 'Save the open analysis to a new chapter to re-file it.',
      });
    }
  }

  return issues;
}

/**
 * Apply the repairs that are unambiguous.
 *
 * One transaction over every store touched, so a failure part-way leaves the
 * database exactly as it was rather than half-tidied. Returns what it removed,
 * because a repair the user cannot see is a repair they cannot trust.
 */
export async function repairIntegrity(
  database: PersistenceDatabase,
  issues: readonly IntegrityIssue[],
): Promise<{ readonly removed: number; readonly renumbered: number }> {
  const actionable = issues.filter((issue) => issue.repairable);
  if (actionable.length === 0) return { removed: 0, renumbered: 0 };

  const stores = [...new Set(actionable.map((issue) => issue.store))] as StoreNameList;
  return database.transaction(stores, 'readwrite', async (transaction) => {
    let removed = 0;
    let renumbered = 0;

    for (const issue of actionable) {
      if (issue.category === 'invalid-order') {
        const chapters = (
          await Promise.all(
            issue.ids.map((id) => transaction.get<ChapterRecord>(STORE_NAMES.chapters, id)),
          )
        ).filter((chapter): chapter is ChapterRecord => chapter !== undefined);
        // Their current sequence is preserved; only the numbering is closed up,
        // so the user's chapter order on screen does not change.
        const ordered = [...chapters].sort(
          (a, b) => a.order - b.order || a.createdAt - b.createdAt,
        );
        for (const [order, chapter] of ordered.entries()) {
          if (chapter.order === order) continue;
          await transaction.put(STORE_NAMES.chapters, {
            ...chapter,
            order,
            revision: chapter.revision + 1,
          });
          renumbered += 1;
        }
        continue;
      }

      for (const id of issue.ids) {
        await transaction.delete(issue.store as StoreNameList[number], id);
        removed += 1;
      }
    }

    return { removed, renumbered };
  });
}

type StoreNameList = Parameters<PersistenceDatabase['transaction']>[0];
