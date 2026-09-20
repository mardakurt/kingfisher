import { describe, expect, it } from 'vitest';

import type { Handover } from '@/persistence/domain';

import { assignmentStatus, latestBoard, threadOrder } from './status';

const handover = (partial: Partial<Handover> & Pick<Handover, 'id' | 'kind' | 'at'>): Handover => ({
  authorId: 'm1',
  authorName: 'Someone',
  note: '',
  ...partial,
});

describe('assignmentStatus', () => {
  it('is to do with nothing in the thread, and with notes only', () => {
    expect(assignmentStatus({ handovers: [] })).toBe('todo');
    expect(assignmentStatus({ handovers: [handover({ id: 'n', kind: 'note', at: 1 })] })).toBe(
      'todo',
    );
  });

  it('is handed in once a hand-in is the latest word', () => {
    expect(assignmentStatus({ handovers: [handover({ id: 'h1', kind: 'hand-in', at: 10 })] })).toBe(
      'handed-in',
    );
  });

  it('reads the verdict of a review that follows the hand-in', () => {
    const accepted = [
      handover({ id: 'h1', kind: 'hand-in', at: 10 }),
      handover({ id: 'r1', kind: 'review', at: 20, verdict: 'accepted' }),
    ];
    expect(assignmentStatus({ handovers: accepted })).toBe('accepted');
    const returned = [
      handover({ id: 'h1', kind: 'hand-in', at: 10 }),
      handover({ id: 'r1', kind: 'review', at: 20, verdict: 'needs-work' }),
    ];
    expect(assignmentStatus({ handovers: returned })).toBe('returned');
  });

  it('goes back to handed in when the student hands in again after a return', () => {
    const thread = [
      handover({ id: 'h1', kind: 'hand-in', at: 10 }),
      handover({ id: 'r1', kind: 'review', at: 20, verdict: 'needs-work' }),
      handover({ id: 'h2', kind: 'hand-in', at: 30 }),
    ];
    expect(assignmentStatus({ handovers: thread })).toBe('handed-in');
  });

  it('orders by time whatever order the array arrived in', () => {
    // A packet merge appends; the status must not depend on array order.
    const thread = [
      handover({ id: 'r1', kind: 'review', at: 20, verdict: 'accepted' }),
      handover({ id: 'h1', kind: 'hand-in', at: 10 }),
    ];
    expect(assignmentStatus({ handovers: thread })).toBe('accepted');
    expect(threadOrder(thread).map((entry) => entry.id)).toEqual(['h1', 'r1']);
  });
});

describe('latestBoard', () => {
  it('finds the newest handover that carries a PGN, skipping notes', () => {
    const thread = [
      handover({ id: 'h1', kind: 'hand-in', at: 10, pgn: '1. e4 *' }),
      handover({ id: 'r1', kind: 'review', at: 20, pgn: '1. e4 e5 *', verdict: 'needs-work' }),
      handover({ id: 'n1', kind: 'note', at: 30 }),
    ];
    expect(latestBoard({ handovers: thread })?.id).toBe('r1');
    expect(latestBoard({ handovers: [] })).toBeNull();
  });
});
