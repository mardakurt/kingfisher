import { parseFen } from '@/chess/fen';
import type { GameTree } from '@/chess/tree/types';

import type {
  ModelGameLinkRecord,
  RepertoirePositionRecord,
  RepertoireRecord,
  TrainingItemRecord,
  TrainingReviewRecord,
  UserProfileRecord,
  StudyReferenceRecord,
  AnalysisQueueJobRecord,
  StoredEngineEvidenceRecord,
  DecisionRecord,
  ReviewItemRecord,
  TrainingSetRecord,
  PreparationSessionRecord,
  OpeningFileRecord,
  EndgamePositionRecord,
  PinnedLineRecord,
} from './domain';
import { ENDGAME_CATEGORIES } from './domain';
import type { ChapterRecord, DraftRecord, GameRecord, GameSummary, StudyRecord } from './types';

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown): value is string => typeof value === 'string';
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export function isGameTree(value: unknown): value is GameTree {
  if (!object(value) || !text(value.rootId) || !text(value.startFen) || !object(value.nodes)) {
    return false;
  }
  if (!parseFen(value.startFen).ok || !object(value.headers) || !finite(value.nextId)) return false;
  const root = value.nodes[value.rootId];
  return object(root) && root.parentId === null && text(root.fen) && Array.isArray(root.children);
}

export const isStudyRecord = (value: unknown): value is StudyRecord =>
  object(value) &&
  text(value.id) &&
  text(value.title) &&
  finite(value.createdAt) &&
  finite(value.updatedAt);

export const isChapterRecord = (value: unknown): value is ChapterRecord =>
  object(value) &&
  text(value.id) &&
  text(value.studyId) &&
  text(value.title) &&
  finite(value.order) &&
  finite(value.createdAt) &&
  finite(value.updatedAt) &&
  finite(value.revision) &&
  isGameTree(value.tree);

/** Metadata only; the moves live in their own store since schema version 3. */
export const isGameSummary = (value: unknown): value is GameSummary =>
  object(value) &&
  text(value.id) &&
  text(value.fingerprint) &&
  text(value.white) &&
  text(value.black) &&
  text(value.result) &&
  finite(value.importedAt);

export const isGameRecord = (value: unknown): value is GameRecord =>
  isGameSummary(value) &&
  text((value as unknown as Record<string, unknown>).normalizedPgn) &&
  isGameTree((value as unknown as Record<string, unknown>).tree);

export const isDraftRecord = (value: unknown): value is DraftRecord =>
  object(value) &&
  value.id === 'active' &&
  object(value.document) &&
  text(value.document.kind) &&
  text(value.currentId) &&
  (value.orientation === 'w' || value.orientation === 'b') &&
  finite(value.updatedAt) &&
  isGameTree(value.tree);

export function assertValid<T>(
  value: unknown,
  predicate: (candidate: unknown) => candidate is T,
  label: string,
): T {
  if (!predicate(value))
    throw new Error(`Stored ${label} is corrupted or uses an unsupported schema.`);
  return value;
}

// --- Phase 3 entities -------------------------------------------------------

const array = (value: unknown): value is unknown[] => Array.isArray(value);
const color = (value: unknown): value is 'w' | 'b' => value === 'w' || value === 'b';

export const isRepertoireRecord = (value: unknown): value is RepertoireRecord =>
  object(value) &&
  text(value.id) &&
  text(value.title) &&
  color(value.color) &&
  finite(value.createdAt) &&
  finite(value.updatedAt);

const isRepertoireMove = (value: unknown): boolean =>
  object(value) &&
  text(value.uci) &&
  text(value.san) &&
  (value.expected === undefined || typeof value.expected === 'boolean') &&
  (value.role === 'main' ||
    value.role === 'alternative' ||
    value.role === 'candidate' ||
    value.role === 'avoid');

export const isRepertoirePositionRecord = (value: unknown): value is RepertoirePositionRecord =>
  object(value) &&
  text(value.id) &&
  text(value.repertoireId) &&
  text(value.positionKey) &&
  text(value.fen) &&
  color(value.sideToMove) &&
  finite(value.depth) &&
  finite(value.revision) &&
  array(value.moves) &&
  value.moves.every(isRepertoireMove);

const isScheduleState = (value: unknown): boolean =>
  object(value) &&
  finite(value.streak) &&
  finite(value.intervalDays) &&
  finite(value.ease) &&
  finite(value.dueAt) &&
  finite(value.reviewCount) &&
  finite(value.lapses);

export const isTrainingItemRecord = (value: unknown): value is TrainingItemRecord =>
  object(value) &&
  text(value.id) &&
  text(value.mode) &&
  text(value.positionKey) &&
  text(value.fen) &&
  color(value.sideToMove) &&
  text(value.prompt) &&
  array(value.solutionUci) &&
  array(value.tags) &&
  finite(value.revision) &&
  isScheduleState(value.schedule) &&
  finite(value.createdAt);

export const isTrainingReviewRecord = (value: unknown): value is TrainingReviewRecord =>
  object(value) &&
  text(value.id) &&
  text(value.itemId) &&
  finite(value.reviewedAt) &&
  text(value.grade) &&
  finite(value.intervalDays);

export const isModelGameLinkRecord = (value: unknown): value is ModelGameLinkRecord =>
  object(value) &&
  text(value.id) &&
  text(value.gameId) &&
  array(value.kinds) &&
  array(value.tags) &&
  finite(value.createdAt);

export const isUserProfileRecord = (value: unknown): value is UserProfileRecord =>
  object(value) && value.id === 'me' && array(value.aliases) && value.aliases.every(text);

export const isStudyReferenceRecord = (value: unknown): value is StudyReferenceRecord =>
  object(value) &&
  text(value.id) &&
  text(value.chapterId) &&
  (value.kind === 'model-game' ||
    value.kind === 'repertoire-position' ||
    value.kind === 'training-item') &&
  text(value.targetId) &&
  text(value.label) &&
  finite(value.createdAt);

export const isAnalysisQueueJobRecord = (value: unknown): value is AnalysisQueueJobRecord =>
  object(value) &&
  text(value.id) &&
  text(value.gameId) &&
  text(value.gameLabel) &&
  text(value.engineId) &&
  text(value.preset) &&
  finite(value.multiPv) &&
  object(value.limit) &&
  text(value.strategy) &&
  finite(value.startPly) &&
  text(value.status) &&
  finite(value.nextIndex) &&
  finite(value.totalPositions) &&
  finite(value.createdAt) &&
  finite(value.updatedAt);

export const isStoredEngineEvidenceRecord = (value: unknown): value is StoredEngineEvidenceRecord =>
  object(value) &&
  text(value.id) &&
  text(value.jobId) &&
  text(value.gameId) &&
  text(value.nodeId) &&
  text(value.positionKey) &&
  text(value.fen) &&
  text(value.engineId) &&
  text(value.engineName) &&
  object(value.score) &&
  finite(value.depth) &&
  finite(value.nodes) &&
  finite(value.timeMs) &&
  array(value.pv) &&
  finite(value.analysedAt);

const stringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every(text);

const isEvaluationEstimate = (value: unknown): boolean =>
  value === undefined ||
  (object(value) &&
    (value.band === 'clearly-white' ||
      value.band === 'slightly-white' ||
      value.band === 'equal' ||
      value.band === 'slightly-black' ||
      value.band === 'clearly-black') &&
    (value.pawns === undefined || finite(value.pawns)));

const isDecisionCandidate = (value: unknown): boolean =>
  object(value) &&
  text(value.uci) &&
  text(value.san) &&
  (value.note === undefined || text(value.note)) &&
  (value.line === undefined || stringArray(value.line)) &&
  isEvaluationEstimate(value.estimate);

export const isDecisionRecord = (value: unknown): value is DecisionRecord =>
  object(value) &&
  text(value.id) &&
  text(value.positionKey) &&
  text(value.fen) &&
  color(value.sideToMove) &&
  array(value.candidates) &&
  value.candidates.every(isDecisionCandidate) &&
  isEvaluationEstimate(value.estimate) &&
  stringArray(value.themes) &&
  finite(value.createdAt) &&
  finite(value.updatedAt) &&
  finite(value.revision);

const isReviewSignal = (value: unknown): boolean =>
  object(value) && text(value.kind) && text(value.detail);

export const isReviewItemRecord = (value: unknown): value is ReviewItemRecord =>
  object(value) &&
  text(value.id) &&
  text(value.identityKey) &&
  text(value.positionKey) &&
  text(value.fen) &&
  color(value.sideToMove) &&
  (value.source === 'marked' || value.source === 'suggested' || value.source === 'manual') &&
  (value.status === 'unreviewed' ||
    value.status === 'reviewed' ||
    value.status === 'converted' ||
    value.status === 'ignored') &&
  array(value.signals) &&
  value.signals.every(isReviewSignal) &&
  stringArray(value.themes) &&
  finite(value.createdAt) &&
  finite(value.revision);

export const isTrainingSetRecord = (value: unknown): value is TrainingSetRecord =>
  object(value) &&
  text(value.id) &&
  text(value.name) &&
  (value.kind === 'static' || value.kind === 'dynamic') &&
  stringArray(value.itemIds) &&
  (value.query === undefined || object(value.query)) &&
  finite(value.createdAt) &&
  finite(value.updatedAt) &&
  finite(value.revision);

// --- Phase 9 entities ------------------------------------------------------

const isSheetCard = (value: unknown): boolean =>
  object(value) &&
  text(value.id) &&
  text(value.positionKey) &&
  text(value.fen) &&
  stringArray(value.line) &&
  finite(value.createdAt);

export const isPreparationSessionRecord = (value: unknown): value is PreparationSessionRecord =>
  object(value) &&
  text(value.id) &&
  text(value.title) &&
  color(value.myColor) &&
  stringArray(value.repertoireIds) &&
  stringArray(value.studyIds) &&
  stringArray(value.openingFileIds) &&
  stringArray(value.modelGameLinkIds) &&
  stringArray(value.reviewItemIds) &&
  array(value.sheet) &&
  value.sheet.every(isSheetCard) &&
  finite(value.createdAt) &&
  finite(value.updatedAt) &&
  finite(value.revision);

const isOpeningFilePosition = (value: unknown): boolean =>
  object(value) &&
  text(value.positionKey) &&
  text(value.fen) &&
  stringArray(value.line) &&
  finite(value.addedAt);

export const isOpeningFileRecord = (value: unknown): value is OpeningFileRecord =>
  object(value) &&
  text(value.id) &&
  text(value.name) &&
  color(value.color) &&
  stringArray(value.repertoireIds) &&
  stringArray(value.chapterIds) &&
  stringArray(value.modelGameLinkIds) &&
  stringArray(value.trainingItemIds) &&
  stringArray(value.reviewItemIds) &&
  array(value.positions) &&
  value.positions.every(isOpeningFilePosition) &&
  finite(value.createdAt) &&
  finite(value.updatedAt) &&
  finite(value.revision);

export const isEndgamePositionRecord = (value: unknown): value is EndgamePositionRecord =>
  object(value) &&
  text(value.id) &&
  text(value.positionKey) &&
  text(value.fen) &&
  color(value.sideToMove) &&
  text(value.title) &&
  (ENDGAME_CATEGORIES as readonly string[]).includes(value.category as string) &&
  (value.goal === 'convert-win' ||
    value.goal === 'hold-draw' ||
    value.goal === 'find-best-move' ||
    value.goal === 'study') &&
  stringArray(value.tags) &&
  finite(value.pieceCount) &&
  finite(value.createdAt) &&
  finite(value.updatedAt) &&
  finite(value.revision);

export const isPinnedLineRecord = (value: unknown): value is PinnedLineRecord =>
  object(value) &&
  text(value.id) &&
  text(value.positionKey) &&
  text(value.fen) &&
  text(value.engineId) &&
  text(value.engineName) &&
  finite(value.multiPv) &&
  object(value.score) &&
  finite(value.depth) &&
  finite(value.nodes) &&
  finite(value.timeMs) &&
  stringArray(value.pvUci) &&
  stringArray(value.pvSan) &&
  finite(value.createdAt);
