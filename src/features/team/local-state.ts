/**
 * What this device remembers about the hub, and nobody else needs to.
 *
 * Which team and assignment were open, and when each thread was last looked
 * at, are conveniences for one person on one machine — the same team on the
 * coach's Mac and the student's laptop has a different answer to each. They
 * live in `localStorage`, never in the record and never in a packet, and a
 * browser that refuses storage costs nothing but the convenience.
 */

const SELECTION_KEY = 'kingfisher.team.selection';
const SEEN_KEY = 'kingfisher.team.seen';

export interface TeamSelection {
  readonly teamId?: string;
  /** The last selected assignment, per team. */
  readonly assignmentByTeam?: Readonly<Record<string, string>>;
}

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A full or disabled store keeps the session working; it forgets on reload.
  }
}

export const readSelection = (): TeamSelection => read<TeamSelection>(SELECTION_KEY) ?? {};

export function rememberSelection(teamId: string | null, assignmentId: string | null): void {
  const current = readSelection();
  write(SELECTION_KEY, {
    ...(teamId ? { teamId } : {}),
    assignmentByTeam: {
      ...current.assignmentByTeam,
      ...(teamId && assignmentId ? { [teamId]: assignmentId } : {}),
    },
  });
}

/** Epoch millisecond each assignment's thread was last opened here. */
export const readSeen = (): Readonly<Record<string, number>> =>
  read<Record<string, number>>(SEEN_KEY) ?? {};

export function markSeen(assignmentId: string, at = Date.now()): Readonly<Record<string, number>> {
  const next = { ...readSeen(), [assignmentId]: at };
  write(SEEN_KEY, next);
  return next;
}
