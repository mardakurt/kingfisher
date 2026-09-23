/**
 * The time class of a game, from its `TimeControl` tag, by a rule a person
 * can read.
 *
 * ChessBase 26 added a time-control filter and its own reviewer found blitz
 * games in a search that excluded blitz — the games had been misclassified.
 * The defence here is not cleverness but visibility: one pure function, the
 * rule printed beside the filter, and a game whose tag says nothing usable
 * put in no class at all rather than a guessed one.
 */

export type TimeClass =
  | 'ultrabullet'
  | 'bullet'
  | 'blitz'
  | 'rapid'
  | 'classical'
  | 'correspondence'
  | 'none'
  | 'unknown';

export const TIME_CLASSES: readonly TimeClass[] = [
  'ultrabullet',
  'bullet',
  'blitz',
  'rapid',
  'classical',
  'correspondence',
  'none',
  'unknown',
];

export const TIME_CLASS_LABEL: Record<TimeClass, string> = {
  ultrabullet: 'UltraBullet',
  bullet: 'Bullet',
  blitz: 'Blitz',
  rapid: 'Rapid',
  classical: 'Classical',
  correspondence: 'Correspondence',
  none: 'No time control',
  unknown: 'Unknown',
};

/** The sentence the filter prints, so a surprising result can be traced to its tag. */
export const TIME_CLASS_RULE =
  'Estimated duration = base + 40 × increment, as Lichess defines it: under 30 s UltraBullet, under 3 min Bullet, under 8 min Blitz, under 25 min Rapid, otherwise Classical. "1/N" is Correspondence; "-" is No time control; a missing tag is Unknown. A control with several periods is classed by its first.';

/** Estimated game duration in seconds, or null when the tag gives no clock. */
export function estimatedSeconds(tag: string | undefined): number | null {
  const parsed = parseClock(tag);
  return parsed && parsed.kind === 'clock' ? parsed.base + 40 * parsed.increment : null;
}

export function classifyTimeControl(tag: string | undefined): TimeClass {
  const parsed = parseClock(tag);
  if (!parsed) return 'unknown';
  if (parsed.kind === 'none') return 'none';
  if (parsed.kind === 'correspondence') return 'correspondence';
  const seconds = parsed.base + 40 * parsed.increment;
  if (seconds < 30) return 'ultrabullet';
  if (seconds < 180) return 'bullet';
  if (seconds < 480) return 'blitz';
  if (seconds < 1500) return 'rapid';
  return 'classical';
}

type Parsed =
  | { readonly kind: 'clock'; readonly base: number; readonly increment: number }
  | { readonly kind: 'correspondence' }
  | { readonly kind: 'none' };

function parseClock(tag: string | undefined): Parsed | null {
  const value = tag?.trim();
  if (!value || value === '?') return null;
  // The PGN standard's "no time control" — a fact the file states, not a gap.
  if (value === '-') return { kind: 'none' };
  const first = value.split(':')[0]!;
  // `seconds[+increment]`, the form online play writes.
  const simple = /^(\d+)(?:\+(\d+))?$/.exec(first);
  if (simple) {
    return { kind: 'clock', base: Number(simple[1]), increment: Number(simple[2] ?? 0) };
  }
  // `moves/seconds[+increment]`. One move per period is a per-move allowance —
  // Chess.com Daily writes "1/86400" — and that is correspondence, however long.
  const period = /^(\d+)\/(\d+)(?:\+(\d+))?$/.exec(first);
  if (period) {
    const moves = Number(period[1]);
    if (moves <= 0) return null;
    if (moves === 1) return { kind: 'correspondence' };
    return { kind: 'clock', base: Number(period[2]), increment: Number(period[3] ?? 0) };
  }
  return null;
}
