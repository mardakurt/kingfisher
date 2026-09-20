import { describe, expect, it } from 'vitest';
import type { AssignmentRecord, TeamMember } from '@/persistence/domain';
import { assignmentInbox, canReview } from './inbox';

const coach: TeamMember = { id: 'coach', name: 'Coach', role: 'coach' };
const student: TeamMember = { id: 'ana', name: 'Ana', role: 'student' };
const assignment = (id: string, patch: Partial<AssignmentRecord> = {}): AssignmentRecord => ({
  id,
  teamId: 'team',
  title: id,
  kind: 'game',
  brief: '',
  setBy: coach.id,
  assignedTo: student.id,
  handovers: [],
  createdAt: 1,
  updatedAt: 1,
  revision: 1,
  ...patch,
});
const submitted = [
  { id: 'hand-in', kind: 'hand-in' as const, authorId: 'ana', authorName: 'Ana', at: 10, note: '' },
];
const defaults = {
  view: 'all' as const,
  member: coach,
  assignee: '',
  query: '',
  showArchived: false,
};

describe('the team inbox', () => {
  it('shows a coach only submitted work for others in the review queue', () => {
    const rows = [
      assignment('todo'),
      assignment('submitted', { handovers: submitted }),
      assignment('own', { assignedTo: coach.id, handovers: submitted }),
      assignment('archive', { archived: true, handovers: submitted }),
      assignment('accepted', {
        handovers: [
          ...submitted,
          { ...submitted[0]!, id: 'review', kind: 'review', at: 20, verdict: 'accepted' },
        ],
      }),
    ];
    expect(assignmentInbox(rows, { ...defaults, view: 'review' }).map((a) => a.id)).toEqual([
      'submitted',
    ]);
    expect(assignmentInbox(rows, { ...defaults, view: 'review', member: student })).toEqual([]);
    expect(canReview(rows[1]!, { ...coach, role: 'player' })).toBe(true);
    expect(canReview(rows[1]!, { ...coach, role: 'second' })).toBe(false);
  });

  it('combines search and member filters, and never mutates the input order', () => {
    const rows = [
      assignment('later', { due: '2026-10-02', opponent: 'Rival' }),
      assignment('other', { assignedTo: 'ben', due: '2026-09-01', opponent: 'Rival' }),
      assignment('earlier', { due: '2026-09-20', brief: 'Prepare for Rival' }),
    ];
    expect(
      assignmentInbox(rows, { ...defaults, query: ' RIVAL ', assignee: 'ana' }).map((a) => a.id),
    ).toEqual(['earlier', 'later']);
    expect(rows.map((a) => a.id)).toEqual(['later', 'other', 'earlier']);
  });

  it('keeps undated work last and distinguishes personal work from whole-team work', () => {
    const rows = [
      assignment('undated'),
      assignment('dated', { due: '2026-09-20' }),
      assignment('shared', { assignedTo: undefined }),
      assignment('archived', { archived: true }),
    ];
    expect(
      assignmentInbox(rows, { ...defaults, view: 'mine', member: student }).map((a) => a.id),
    ).toEqual(['dated', 'undated']);
    expect(assignmentInbox(rows, { ...defaults, showArchived: true })).toHaveLength(4);
    expect(assignmentInbox(rows, { ...defaults, view: 'mine', member: null })).toEqual([]);
  });
});
