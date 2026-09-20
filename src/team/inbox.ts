import type { AssignmentRecord, TeamMember } from '@/persistence/domain';
import { assignmentStatus } from './status';

export type InboxView = 'all' | 'review' | 'mine';

/** Role labels guide the workflow; they never grant access to packet contents. */
export function canReview(assignment: AssignmentRecord, member: TeamMember | null): boolean {
  return Boolean(
    member &&
    (member.role === 'coach' || member.role === 'player') &&
    assignment.assignedTo !== member.id,
  );
}

export function assignmentInbox(
  assignments: readonly AssignmentRecord[],
  options: {
    view: InboxView;
    member: TeamMember | null;
    assignee: string;
    query: string;
    showArchived: boolean;
  },
): AssignmentRecord[] {
  const query = options.query.trim().toLocaleLowerCase();
  return assignments
    .filter((entry) => {
      if (entry.archived && !options.showArchived) return false;
      if (options.assignee && entry.assignedTo !== options.assignee) return false;
      if (options.view === 'mine' && (!options.member || entry.assignedTo !== options.member.id))
        return false;
      if (
        options.view === 'review' &&
        (assignmentStatus(entry) !== 'handed-in' || !canReview(entry, options.member))
      )
        return false;
      return (
        !query ||
        `${entry.title}\n${entry.opponent ?? ''}\n${entry.brief}`
          .toLocaleLowerCase()
          .includes(query)
      );
    })
    .sort(
      (a, b) =>
        (a.due ?? '9999-12-31').localeCompare(b.due ?? '9999-12-31') ||
        a.createdAt - b.createdAt ||
        a.id.localeCompare(b.id),
    );
}
