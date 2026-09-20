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

/**
 * Who reviews and who hands in, by role.
 *
 * A coach reviews a student's work; a *player* reviews a second's — the
 * second produces the file, the player reads it the morning of the game and
 * accepts it or asks for more (`docs/design/team-hub.md` §1). The first
 * version put seconds with coaches, which offered a second "Accept" on the
 * file they were supposed to be writing. The label only orders the buttons;
 * an assignment addressed to you always shows the hand-in first.
 */
export const REVIEWING_ROLES: ReadonlySet<TeamRole> = new Set(['coach', 'player']);

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
