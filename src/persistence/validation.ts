import { parseFen } from '@/chess/fen';
import type { GameTree } from '@/chess/tree/types';

import type { ChapterRecord, DraftRecord, GameRecord, StudyRecord } from './types';

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

export const isGameRecord = (value: unknown): value is GameRecord =>
  object(value) &&
  text(value.id) &&
  text(value.fingerprint) &&
  text(value.white) &&
  text(value.black) &&
  text(value.result) &&
  text(value.normalizedPgn) &&
  finite(value.importedAt) &&
  isGameTree(value.tree);

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
