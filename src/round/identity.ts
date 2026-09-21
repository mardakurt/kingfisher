/**
 * Which side of a game the person played, and the headers a journal is read
 * by. Both come from the PGN tags and the profile's own aliases; nothing is
 * guessed from a rating or a result.
 */
import type { GameTree } from '@/chess/tree/types';
import type { Color } from '@/chess/types';

/**
 * The same key the games index uses for a player (`playerKey`): case and
 * runs of whitespace are ignored, nothing else is. "Kurt, Metin" and "Metin
 * Kurt" are two aliases, not one — Kingfisher never guesses which player is
 * you, and the profile asks for the exact spellings so that this page, the
 * explorer's "my games" and the repertoire's counts all agree on them.
 */
export const nameKey = (name: string | undefined): string =>
  (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

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
