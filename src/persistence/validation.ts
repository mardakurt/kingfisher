import { parseFen } from '@/chess/fen';
import type { GameTree } from '@/chess/tree/types';

import type {
  ModelGameLinkRecord,
  RepertoirePositionRecord,
  RepertoireRecord,
  TrainingItemRecord,
  TrainingReviewRecord,
  UserProfileRecord,
} from './domain';
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
