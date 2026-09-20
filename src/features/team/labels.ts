import type { AssignmentKind, TeamRole } from '@/persistence/domain';

export const KIND_LABEL: Readonly<Record<AssignmentKind, string>> = {
  game: 'Annotate a game',
  opening: 'Prepare a line',
  opponent: 'Prepare for an opponent',
  positions: 'Positions to solve',
  other: 'Other',
};

export const ROLE_LABEL: Readonly<Record<TeamRole, string>> = {
  coach: 'Coach',
  second: 'Second',
  player: 'Player',
  student: 'Student',
};

/** Coaches and seconds review; players and students hand in. The label puts the right button first. */
export const REVIEWING_ROLES: ReadonlySet<TeamRole> = new Set(['coach', 'second']);

/** `19 Sep`, or `19 Sep 2025` when it was not this year. */
export function shortDate(at: number, now = Date.now()): string {
  const date = new Date(at);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** An ISO day, read for a person: `due 25 Sep`, and `overdue` once it has passed. */
export function describeDue(due: string | undefined, now = Date.now()): string | null {
  if (!due) return null;
  const [y, m, d] = due.split('-').map(Number);
  if (!y || !m || !d) return `due ${due}`;
  const at = new Date(y, m - 1, d).getTime();
  const today = new Date(now);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return at < startOfToday ? `overdue (${shortDate(at, now)})` : `due ${shortDate(at, now)}`;
}
