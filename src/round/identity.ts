/**
 * Which side of a game the person played, and the headers a journal is read
 * by. Both come from the PGN tags and the profile's own aliases; nothing is
 * guessed from a rating or a result.
 */
import type { GameTree } from '@/chess/tree/types';
import type { Color } from '@/chess/types';

/**
 * `Carlsen, Magnus` and `Magnus Carlsen` → `carlsen magnus`. Looser than the
 * game index's key on purpose: a name typed from a scoresheet and the same
 * name in a profile alias differ in commas, case and order far more often
 * than in letters, and the surname-first form is what every tournament
 * pairing sheet writes.
 */
export const nameKey = (name: string | undefined): string =>
  (name ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .sort()
    .join(' ');

/** The colour the person played, when one of the players is one of their aliases. */
export function ownColor(headers: GameTree['headers'], aliases: readonly string[]): Color | null {
  const keys = new Set(aliases.map(nameKey).filter(Boolean));
  if (keys.size === 0) return null;
  const white = keys.has(nameKey(headers.White));
  const black = keys.has(nameKey(headers.Black));
  if (white && !black) return 'w';
  if (black && !white) return 'b';
  return null;
}

export interface GameIdentity {
  readonly title: string;
  readonly event?: string;
  readonly round?: string;
  readonly date?: string;
  readonly opponent?: string;
  readonly result?: string;
}

const present = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed && trimmed !== '?' && trimmed !== '????.??.??' ? trimmed : undefined;
};

/** The journal headers for a game, from its tags. */
export function gameIdentity(headers: GameTree['headers'], color: Color | null): GameIdentity {
  const white = present(headers.White) ?? 'White';
  const black = present(headers.Black) ?? 'Black';
  const opponent =
    color === 'w' ? present(headers.Black) : color === 'b' ? present(headers.White) : undefined;
  return {
    title: `${white} – ${black}`,
    ...(present(headers.Event) ? { event: present(headers.Event) } : {}),
    ...(present(headers.Round) ? { round: present(headers.Round) } : {}),
    ...(present(headers.Date) ? { date: present(headers.Date) } : {}),
    ...(opponent ? { opponent } : {}),
    ...(present(headers.Result) && headers.Result !== '*'
      ? { result: present(headers.Result) }
      : {}),
  };
}
