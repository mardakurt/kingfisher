/**
 * Where a piece of work stands, read off its thread.
 *
 * Deliberately not a stored field. A status that was written would have to be
 * kept in step with the handovers by every writer — the coach's copy, the
 * student's copy, and the merge between them — and the day it disagreed with
 * the thread, the thread would be right. So it is derived from the two facts
 * that decide it: the last hand-in and the last review, in time order.
 */

import type { AssignmentRecord, Handover } from '@/persistence/domain';

export type AssignmentStatus = 'todo' | 'returned' | 'handed-in' | 'accepted';

export const STATUS_LABEL: Readonly<Record<AssignmentStatus, string>> = {
  todo: 'To do',
  returned: 'Returned',
  'handed-in': 'Handed in',
  accepted: 'Accepted',
};

/** The rail groups the four statuses into the three columns a person scans. */
export type AssignmentColumn = 'todo' | 'handed-in' | 'accepted';

export const COLUMN_OF: Readonly<Record<AssignmentStatus, AssignmentColumn>> = {
  todo: 'todo',
  returned: 'todo',
  'handed-in': 'handed-in',
  accepted: 'accepted',
};

export const COLUMN_LABEL: Readonly<Record<AssignmentColumn, string>> = {
  todo: 'To do',
  'handed-in': 'Handed in',
  accepted: 'Accepted',
};

/** Oldest first; ties broken by id so two machines list one thread the same way. */
export function threadOrder(handovers: readonly Handover[]): readonly Handover[] {
  return [...handovers].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

export function assignmentStatus(
  assignment: Pick<AssignmentRecord, 'handovers'>,
): AssignmentStatus {
  let lastHandIn: Handover | null = null;
  let lastReview: Handover | null = null;
  for (const handover of threadOrder(assignment.handovers)) {
    if (handover.kind === 'hand-in') lastHandIn = handover;
    else if (handover.kind === 'review') lastReview = handover;
  }
  if (!lastHandIn && !lastReview) return 'todo';
  if (lastHandIn && (!lastReview || lastHandIn.at > lastReview.at)) return 'handed-in';
  return lastReview?.verdict === 'accepted' ? 'accepted' : 'returned';
}

/** The most recent handover that carries a board, if any. */
export function latestBoard(assignment: Pick<AssignmentRecord, 'handovers'>): Handover | null {
  const ordered = threadOrder(assignment.handovers);
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const handover = ordered[index];
    if (handover?.pgn) return handover;
  }
  return null;
}
